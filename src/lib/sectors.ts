/**
 * Sectors Financial API v2 client — IDX market data.
 *
 * Verified live against api.sectors.app (2026-10-03):
 *   GET /daily/{symbol}/        → [{symbol:"BBCA.JK", date, open, high, low, close, volume, market_cap}]
 *   GET /companies/             → {results:[{symbol, company_name}], pagination:{total_count, limit, offset, has_next, next_offset}}
 *   GET /company/report/{sym}/  → per-section report (overview, financials, dividend, future, …)
 *
 * Conventions discovered live:
 *   - Auth: raw key in the `Authorization` header (no "Bearer" prefix).
 *   - Response `symbol` carries a `.JK` suffix; our DB stores bare tickers.
 *   - `market_cap` is full IDR — the app schema stores billions (÷ 1e9).
 *   - Non-trading days are simply absent from daily series.
 *   - 2xx/404 consume credits; 400/401/403/429/5xx are free; 429/503 are retryable.
 */

const DEFAULT_BASE_URL = "https://api.sectors.app/v2";

export class SectorsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SectorsConfigError";
  }
}

export class SectorsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "SectorsApiError";
  }
}

export function sectorsApiKey(): string {
  const key = process.env.SECTORS_API_KEY?.trim();
  if (!key) {
    throw new SectorsConfigError(
      "SECTORS_API_KEY is not set. Add it to .env (key from sectors.app/api, Insider plan). " +
        "Until then the app keeps serving the seeded demonstration dataset.",
    );
  }
  return key;
}

export function sectorsBaseUrl(): string {
  return (process.env.SECTORS_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** "BBCA.JK" → "BBCA" (response symbols carry the .JK suffix). */
export function stripJk(symbol: string): string {
  return symbol.replace(/\.JK$/i, "").toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DailyPriceRow {
  /** e.g. "BBCA.JK" */
  symbol: string;
  /** YYYY-MM-DD (trading days only) */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** full IDR — divide by 1e9 for the app's billions convention */
  market_cap: number;
}

export interface IndexDailyRow {
  /** e.g. "IHSG" — the API uppercases whatever was requested */
  index_code: string;
  /** YYYY-MM-DD (trading days only) */
  date: string;
  price: number;
}

export interface ForeignFlowRow {
  date: string;
  /** full IDR — positive means foreign brokers were net buyers */
  net_foreign_inflow: number;
  foreign_buy_idr?: number;
  foreign_sell_idr?: number;
  /** foreign brokers' share of total volume, 0..1 */
  foreign_share?: number;
}

/**
 * NOTE: this endpoint returns an OBJECT with a `data` array, unlike
 * `/daily/{symbol}/` which returns a bare array. Verified live 2026-10-04.
 */
export interface ForeignFlowResponse {
  symbol: string;
  start: string;
  end: string;
  data: ForeignFlowRow[];
}

export interface CompanyScreenerRow {
  /** e.g. "BBCA.JK" */
  symbol: string;
  company_name: string;
  /** Present when include_query_values is true — field values used in the query. */
  query_values?: Record<string, unknown>;
}

export interface Pagination {
  total_count: number;
  showing: number;
  limit: number;
  offset: number;
  has_next: boolean;
  has_previous: boolean;
  next_offset: number | null;
  previous_offset: number | null;
}

export interface ScreenerResponse {
  results: CompanyScreenerRow[];
  pagination: Pagination;
}

export type ReportSection =
  | "overview"
  | "valuation"
  | "future"
  | "peers"
  | "financials"
  | "dividend"
  | "management"
  | "ownership";

/* ------------------------------------------------------------------ */
/*  Fetch core — retry, backoff, credit budget                         */
/* ------------------------------------------------------------------ */

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

/**
 * Global pacer: minimum interval between ANY two API calls, across concurrent
 * callers. Live testing (2026-10-03) showed the plan's rate limit trips at
 * high concurrency even with per-request retries.
 *
 * The slot is reserved SYNCHRONOUSLY before sleeping — callers that arrive
 * while another is waiting each get a strictly later slot instead of all
 * waking on the same tick (the old read-then-sleep-then-write version let
 * concurrent callers fire together, which is exactly the 429 burst pattern).
 */
let lastCallAt = 0;
const MIN_INTERVAL_MS = Number(process.env.SECTORS_MIN_INTERVAL_MS ?? 1_500);
async function pace() {
  const now = Date.now();
  const slot = Math.max(lastCallAt + MIN_INTERVAL_MS, now);
  lastCallAt = slot;
  const wait = slot - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export interface FetchOptions {
  /** extra attempts-aware abort timeout per request (ms) */
  timeoutMs?: number;
}

/**
 * Shared credit budget guard. The sync script decrements before each call and
 * aborts the run when the soft budget is exhausted.
 */
export const creditBudget = { remaining: Infinity };

interface CoreRequest {
  path: string;
  /** query params; undefined/null values are dropped, numbers stringified */
  params?: Record<string, string | number | boolean | undefined | null>;
  timeoutMs?: number;
  /** credit cost of this endpoint — checked against the budget, if armed */
  credits?: number;
}

async function sectorsFetch<T>({ path, params, timeoutMs = 30_000, credits = 1 }: CoreRequest): Promise<T> {
  const key = sectorsApiKey();
  if (Number.isFinite(creditBudget.remaining) && creditBudget.remaining < credits) {
    throw new SectorsConfigError(
      `Credit budget exhausted (remaining: ${creditBudget.remaining}, needed: ${credits}). Aborting before the call.`,
    );
  }

  const url = new URL(`${sectorsBaseUrl()}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  let lastError: SectorsApiError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await pace();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Authorization: key },
        signal: controller.signal,
        cache: "no-store",
      });

      if (res.ok) {
        if (Number.isFinite(creditBudget.remaining)) creditBudget.remaining -= credits;
        return (await res.json()) as T;
      }

      const body = await res.text().catch(() => "");
      const retryable = RETRYABLE.has(res.status);
      let retryAfterMs: number | null = null;
      const ra = res.headers.get("retry-after");
      if (ra) {
        const s = Number(ra);
        retryAfterMs = Number.isFinite(s) ? s * 1000 : Date.parse(ra) - Date.now() || null;
      }
      lastError = new SectorsApiError(
        `Sectors API ${res.status} on ${path}: ${body.slice(0, 200) || res.statusText}`,
        res.status,
        retryable,
        retryAfterMs,
      );
      if (!retryable || attempt === MAX_ATTEMPTS) throw lastError;
    } catch (err) {
      if (err instanceof SectorsApiError) {
        lastError = err;
        if (!err.retryable || attempt === MAX_ATTEMPTS) throw err;
      } else if (err instanceof Error && err.name === "AbortError") {
        lastError = new SectorsApiError(`Sectors API timeout on ${path}`, 0, true);
        if (attempt === MAX_ATTEMPTS) throw lastError;
      } else {
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }

    /* 429 needs a materially longer cooldown than transient 5xx errors. */
    const backoffMs =
      lastError?.retryAfterMs ??
      (lastError?.status === 429
        ? Math.min(30_000, 5_000 * 2 ** (attempt - 1))
        : Math.min(8_000, 750 * 2 ** (attempt - 1)));
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastError ?? new SectorsApiError(`Sectors API failed on ${path}`, 0, false);
}

/* ------------------------------------------------------------------ */
/*  Endpoints                                                          */
/* ------------------------------------------------------------------ */

/**
 * Daily close/volume/market-cap series for one symbol.
 * Window defaults to 30 days back; the API clamps ranges to the trailing 90 days.
 */
export async function fetchDailyPrice(symbol: string, start?: string, end?: string): Promise<DailyPriceRow[]> {
  return sectorsFetch<DailyPriceRow[]>({
    path: `/daily/${encodeURIComponent(symbol.toUpperCase())}/`,
    params: { start, end },
    credits: 1,
  });
}

/**
 * Company screener. Structured queries (where/order_by) cost 1 credit;
 * natural-language `q` costs 3 — prefer structured.
 * NOTE (live-verified): the response only carries `symbol` + `company_name`.
 */
export async function fetchCompanies(opts: {
  where?: string;
  orderBy?: string;
  limit?: number;
  offset?: number;
  includeQueryValues?: boolean;
}): Promise<ScreenerResponse> {
  return sectorsFetch<ScreenerResponse>({
    path: "/companies/",
    params: {
      where: opts.where,
      order_by: opts.orderBy,
      limit: opts.limit,
      offset: opts.offset,
      include_query_values: opts.includeQueryValues ? true : undefined,
    },
    credits: 1,
  });
}

/**
 * Full company report. 1 credit PER requested section — request only what
 * you need (default all 8 sections = 8 credits).
 */
export async function fetchCompanyReport<T = Record<string, unknown>>(
  symbol: string,
  sections: ReportSection[],
): Promise<T> {
  return sectorsFetch<T>({
    path: `/company/report/${encodeURIComponent(symbol.toUpperCase())}/`,
    params: { sections: sections.join(",") },
    credits: sections.length,
  });
}

/**
 * Quarterly financial statements for one symbol. 1 credit per quarter returned.
 */
export async function fetchQuarterlyFinancials<T = Record<string, unknown>>(
  symbol: string,
  nQuarters?: number,
): Promise<T> {
  return sectorsFetch<T>({
    path: `/quarterly-financials/${encodeURIComponent(symbol.toUpperCase())}/`,
    params: { n_quarters: nQuarters },
    credits: nQuarters ?? 1,
  });
}

/**
 * Daily closing level for one IDX index (e.g. "ihsg").
 *
 * Live-verified 2026-10-04: `GET /index-daily/{code}/` -> [{index_code:"IHSG", date, price}]
 *   - 1 credit. Earliest available data: 2019-01-02.
 *   - Max window 90 days per call; wider ranges are CLAMPED to the trailing
 *     90 ending at `end`. To backfill longer history the caller must page in
 *     <=90-day chunks (see sync.ts `syncIndex`).
 *   - The response echoes `index_code` uppercased, whatever case was sent.
 */
export async function fetchIndexDaily(
  indexCode: string,
  start?: string,
  end?: string,
): Promise<IndexDailyRow[]> {
  return sectorsFetch<IndexDailyRow[]>({
    path: `/index-daily/${encodeURIComponent(indexCode.toLowerCase())}/`,
    params: { start, end },
    credits: 1,
  });
}

/**
 * Daily net foreign-broker flow for one ticker.
 *
 * Live-verified 2026-10-04: 1 credit per symbol, max 90-day window.
 * Positive `net_foreign_inflow` = foreign brokers net buyers that day.
 * Returns the response OBJECT — read `.data`, it is not a bare array.
 */
export async function fetchForeignFlow(
  symbol: string,
  start?: string,
  end?: string,
): Promise<ForeignFlowResponse> {
  return sectorsFetch<ForeignFlowResponse>({
    path: `/foreign-flow/${encodeURIComponent(symbol.toUpperCase())}/`,
    params: { start, end },
    credits: 1,
  });
}

/**
 * Walk a paginated screener feed with bounded concurrency-friendly paging.
 * Calls `onPage` per page; stop early by returning false.
 */
export async function fetchCompaniesAllPages(
  opts: { where?: string; orderBy?: string; pageSize?: number },
  onPage: (rows: CompanyScreenerRow[], page: Pagination) => Promise<boolean | void>,
): Promise<void> {
  const pageSize = Math.min(opts.pageSize ?? 200, 200);
  let offset = 0;
  for (;;) {
    const res = await fetchCompanies({ where: opts.where, orderBy: opts.orderBy, limit: pageSize, offset });
    const stop = await onPage(res.results, res.pagination);
    if (stop === false || !res.pagination.has_next || res.pagination.next_offset === null) return;
    offset = res.pagination.next_offset;
  }
}

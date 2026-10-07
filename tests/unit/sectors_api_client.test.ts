/**
 * Unit tests — Sectors Financial API v2 client (`src/lib/sectors.ts`).
 *
 * `global.fetch` is mocked, so nothing ever leaves the process. Retry/backoff
 * paths run under ONE file-wide fake-timer clock installed in `beforeAll`,
 * not per-test. The module-level pacer (`lastCallAt` in `src/lib/sectors.ts`)
 * persists across tests in this file: re-installing fake timers per test
 * resets the clock to real now while `lastCallAt` stayed in the fake future,
 * so `pace()` "owed" thousands of ms of sleep (pace debt) that the test's
 * advance window never covered — the source of the old timeouts, orphaned
 * promise chains and cross-test contamination. A single monotonic clock
 * installed once keeps `lastCallAt` ≤ clock, so pace debt is always zero.
 *
 * Tests that wait for a rejection use catch-at-creation
 * (`const settled = promise.catch((err) => err)`) so the rejection is handled
 * from birth — no unhandled-rejection windows, no
 * `PromiseRejectionHandledWarning`, no double-reported failures.
 *
 * Cache policy is asserted at the wire level: every call ships
 * `cache: "no-store"` — by design there is no response cache to invalidate.
 *
 * `tests/setupEnv.ts` pins SECTORS_MIN_INTERVAL_MS=0 BEFORE these modules
 * load, because `src/lib/sectors.ts` reads that constant at import time
 * (pace() becomes a no-op — the tests below advance backoff timers only).
 */
import {
  creditBudget,
  fetchCompanies,
  fetchCompaniesAllPages,
  fetchDailyPrice,
  fetchCompanyReport,
  sectorsApiKey,
  sectorsBaseUrl,
  stripJk,
  SectorsApiError,
  SectorsConfigError,
  type CompanyScreenerRow,
  type DailyPriceRow,
} from "@/lib/sectors";

/* ------------------------------------------------------------------ */
/*  Fake Response helpers (shape the client actually reads)            */
/* ------------------------------------------------------------------ */

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (_name: string) => null },
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

function errorResponse(
  status: number,
  headers: Record<string, string> = {},
  body = "",
): Record<string, unknown> {
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lowered[k.toLowerCase()] = v;
  return {
    ok: false,
    status,
    statusText: `HTTP ${status}`,
    headers: { get: (name: string) => lowered[name.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => {
      throw new SyntaxError("not json");
    },
  };
}

const DAILY_ROWS: DailyPriceRow[] = [
  {
    symbol: "BBCA.JK",
    date: "2026-01-02",
    open: 8800,
    high: 8950,
    low: 8750,
    close: 8900,
    volume: 62_500_000,
    market_cap: 218e12,
  },
];

/* ------------------------------------------------------------------ */
/*  Harness                                                            */
/* ------------------------------------------------------------------ */

const fetchMock = jest.fn();
let savedKey: string | undefined;
let savedBase: string | undefined;
let realFetch: typeof globalThis.fetch;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeAll(() => {
  savedKey = process.env.SECTORS_API_KEY;
  savedBase = process.env.SECTORS_API_BASE_URL;
  realFetch = globalThis.fetch;
  // One monotonic clock for the whole file — `lastCallAt` can never be in
  // front of the clock, so pace debt is always zero. Installed once, removed
  // once in afterAll; tests only advance time explicitly.
  jest.useFakeTimers();
});

afterAll(() => {
  setEnv("SECTORS_API_KEY", savedKey);
  setEnv("SECTORS_API_BASE_URL", savedBase);
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  creditBudget.remaining = Infinity;
  setEnv("SECTORS_API_KEY", "unit-test-dummy-key");
  setEnv("SECTORS_API_BASE_URL", undefined);
});

/* ------------------------------------------------------------------ */
/*  API key + URL conventions                                          */
/* ------------------------------------------------------------------ */

describe("API key handling", () => {
  it("throws SectorsConfigError with the documented message when no key is configured", async () => {
    setEnv("SECTORS_API_KEY", undefined);
    expect(() => sectorsApiKey()).toThrow(SectorsConfigError);
    expect(() => sectorsApiKey()).toThrow(/SECTORS_API_KEY is not set/);
    // the same guard rejects the fetch helpers before any HTTP call
    await expect(fetchDailyPrice("BBCA")).rejects.toThrow(SectorsConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the configured key trimmed of whitespace", () => {
    setEnv("SECTORS_API_KEY", "  secret-key-123  ");
    expect(sectorsApiKey()).toBe("secret-key-123");
  });
});

describe("stripJk — response symbols carry .JK, the DB stores bare tickers", () => {
  it("strips the suffix case-insensitively and uppercases the rest", () => {
    expect(stripJk("BBCA.JK")).toBe("BBCA");
    expect(stripJk("bbca.jk")).toBe("BBCA");
    expect(stripJk("BBCA")).toBe("BBCA");
  });
});

describe("sectorsBaseUrl", () => {
  it("defaults to the v2 API root, honours a custom env and strips trailing slashes", () => {
    expect(sectorsBaseUrl()).toBe("https://api.sectors.app/v2");
    setEnv("SECTORS_API_BASE_URL", "https://mirror.example.com/v2/");
    expect(sectorsBaseUrl()).toBe("https://mirror.example.com/v2");
    setEnv("SECTORS_API_BASE_URL", "   ");
    expect(sectorsBaseUrl()).toBe("https://api.sectors.app/v2"); // blank falls back
  });
});

/* ------------------------------------------------------------------ */
/*  Request shape / response schema                                    */
/* ------------------------------------------------------------------ */

describe("fetchDailyPrice — request shape and DailyPriceRow parsing", () => {
  it("sends the raw Authorization header (no Bearer), cache: no-store, and parses the row array", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(DAILY_ROWS));

    const result = await fetchDailyPrice("bbca.jk", "2026-01-01", "2026-01-31");

    expect(result).toEqual(DAILY_ROWS);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url).toBeInstanceOf(URL);
    expect(url.href).toBe("https://api.sectors.app/v2/daily/BBCA.JK/?start=2026-01-01&end=2026-01-31");
    expect(init.headers).toEqual({ Authorization: sectorsApiKey() });
    expect(init.cache).toBe("no-store");
  });

  it("drops undefined/null/empty params and stringifies numbers", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ results: [], pagination: { total_count: 0 } }),
    );
    await fetchCompanies({
      where: undefined,
      orderBy: "-market_cap",
      limit: 5,
      offset: null as unknown as number,
      includeQueryValues: false,
    });

    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/companies/");
    expect(url.search).toBe("?order_by=-market_cap&limit=5");
  });

  it("rejects on malformed JSON (response shape is validated by json parsing)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => "<html>gateway error</html>",
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });
    await expect(fetchDailyPrice("BBCA")).rejects.toThrow(SyntaxError);
  });
});

/* ------------------------------------------------------------------ */
/*  Rate limiting (429)                                                */
/* ------------------------------------------------------------------ */

describe("429 rate limiting", () => {
  it("retries four attempts honouring retry-after, then throws a retryable SectorsApiError", async () => {
    fetchMock.mockResolvedValue(errorResponse(429, { "retry-after": "2" }, "quota"));

    const promise = fetchDailyPrice("BBCA");
    const settled = promise.catch((err) => err); // handled since birth
    // 3 backoffs × 2 s = 6 s — the exponential 429 curve (5+10+20 s) needs 35 s,
    // so completing here proves the retry-after header wins.
    await jest.advanceTimersByTimeAsync(7_000);
    const err = (await settled) as SectorsApiError;

    expect(err).toBeInstanceOf(SectorsApiError);
    expect(err.status).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(2000);
    // `.JK` is a response-symbol suffix only — the request path is `/daily/BBCA/`
    expect(err.message).toMatch(/429 on \/daily\/BBCA\//);
    expect(fetchMock).toHaveBeenCalledTimes(4); // MAX_ATTEMPTS
  });

  it("recovers when a 429 is followed by a 200 and spends budget exactly once", async () => {
    creditBudget.remaining = 5;
    fetchMock
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(jsonResponse(DAILY_ROWS));

    const promise = fetchDailyPrice("BBCA");
    await jest.advanceTimersByTimeAsync(30_000); // header-less 429 → 5 s cooldown
    const result = await promise;

    expect(result).toEqual(DAILY_ROWS);
    expect(creditBudget.remaining).toBe(4); // decremented once, on success
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Timeouts and retry classification                                  */
/* ------------------------------------------------------------------ */

describe("timeout and retry classification", () => {
  it("maps AbortError to a retryable status-0 timeout error after 4 attempts", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValue(abortError);

    const promise = fetchDailyPrice("BBCA");
    const settled = promise.catch((err) => err); // handled since birth
    await jest.advanceTimersByTimeAsync(12_000); // 750 + 1500 + 3000 ms backoffs
    const err = (await settled) as SectorsApiError;

    expect(err.message).toMatch(/timeout/);
    expect(err.status).toBe(0);
    expect(err.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry 401 (non-retryable) — exactly one call", async () => {
    fetchMock.mockResolvedValue(errorResponse(401, {}, "invalid key"));

    await expect(fetchDailyPrice("BBCA")).rejects.toMatchObject({
      status: 401,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 503 with the exponential 750 ms curve and throws after the 4th attempt", async () => {
    fetchMock.mockResolvedValue(errorResponse(503));

    const promise = fetchDailyPrice("BBCA");
    const settled = promise.catch((err) => err); // handled since birth

    await jest.advanceTimersByTimeAsync(1_000); // crosses the 750 ms first backoff
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(2_000); // crosses the 1500 ms second backoff
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(4_000); // crosses the 3000 ms third backoff
    const err = (await settled) as SectorsApiError;
    expect(err.status).toBe(503);
    expect(err.retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

/* ------------------------------------------------------------------ */
/*  Credit budget                                                      */
/* ------------------------------------------------------------------ */

describe("credit budget guard", () => {
  it("refuses to call the API once the soft budget is exhausted", async () => {
    creditBudget.remaining = 0;
    await expect(fetchDailyPrice("BBCA")).rejects.toThrow(SectorsConfigError);
    await expect(fetchDailyPrice("BBCA")).rejects.toThrow(/Credit budget exhausted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the endpoint's credit cost — a 3-section report needs 3 credits up-front", async () => {
    creditBudget.remaining = 2;
    await expect(
      fetchCompanyReport("BBCA", ["financials", "dividend", "future"]),
    ).rejects.toThrow(/needed: 3/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  Screener paging                                                    */
/* ------------------------------------------------------------------ */

describe("fetchCompaniesAllPages", () => {
  const page = (results: CompanyScreenerRow[], extra: Record<string, unknown>) =>
    jsonResponse({
      results,
      pagination: {
        total_count: 3,
        showing: results.length,
        limit: 2,
        offset: 0,
        has_previous: false,
        previous_offset: null,
        ...extra,
      },
    });

  it("walks has_next/next_offset until the feed is exhausted", async () => {
    fetchMock
      .mockResolvedValueOnce(
        page(
          [
            { symbol: "AAAA.JK", company_name: "Alpha" },
            { symbol: "BBBB.JK", company_name: "Beta" },
          ],
          { has_next: true, next_offset: 2 },
        ),
      )
      .mockResolvedValueOnce(
        page([{ symbol: "CCCC.JK", company_name: "Gamma" }], {
          has_next: false,
          next_offset: null,
        }),
      );

    const seen: CompanyScreenerRow[] = [];
    await fetchCompaniesAllPages(
      { where: "sector = 'Bank'", orderBy: "-market_cap", pageSize: 2 },
      async (rows) => {
        seen.push(...rows);
      },
    );

    expect(seen.map((r) => r.symbol)).toEqual(["AAAA.JK", "BBBB.JK", "CCCC.JK"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [firstUrl, secondUrl] = fetchMock.mock.calls.map(([u]) => (u as URL).href);
    expect(firstUrl).toContain("/companies/?order_by=-market_cap&limit=2&offset=0");
    expect(secondUrl).toContain("offset=2"); // resumed from next_offset
    // the no-cache policy holds for every call in the walk
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).cache === "no-store")).toBe(true);
  });

  it("stops early when onPage returns false", async () => {
    fetchMock.mockResolvedValueOnce(
      page([{ symbol: "AAAA.JK", company_name: "Alpha" }], { has_next: true, next_offset: 1 }),
    );

    const seen: CompanyScreenerRow[] = [];
    await fetchCompaniesAllPages({}, async (rows) => {
      seen.push(...rows);
      return false;
    });

    expect(seen).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
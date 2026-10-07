/**
 * Sectors Financial API → Postgres sync.
 *
 *   npm run db:sync                watchlist prices + snapshots + intel scores (~1 credit/ticker)
 *   npm run db:sync -- --dry-run   print the watchlist selection and cost plan, 0 API calls
 *   npm run db:sync -- --full      also force fundamentals refresh (3 credits/company, watchlist only)
 *   npm run db:sync -- --flow=N    also pull net foreign flow for the top-N watchlist names
 *   npm run db:sync -- --index     force a full IHSG re-pull (~1 credit / 90 days)
 *
 * Idempotent and incremental:
 *   - First run replaces the seeded synthetic price series with real API data
 *     (trailing 90 days) and records state in `sync_state`.
 *   - Later runs only pull trading days after the last sync and upsert.
 *   - Snapshots and market-intel scores are recomputed locally from stored
 *     prices (0 credits) with the same formulas as seed.ts.
 *
 * Quota policy (lifetime budget, e.g. 1000 credits):
 *   - Only the watchlist (`src/db/watchlist.ts`, recomputed locally at 0
 *     credits) is pulled from the API; companies outside it keep their stored
 *     data and simply age.
 *   - The index sync runs FIRST as a trading-day probe: an incremental window
 *     with 0 new bars means the market was closed, and the per-ticker price
 *     stage is skipped (an empty 200 response still costs 1 credit/ticker).
 *   - Fundamentals refresh only when older than SECTORS_FUNDAMENTAL_MAX_AGE_DAYS.
 *   - Each stage's credit spend is recorded as a per-source delta in
 *     `sync_state`, and a run is refused up-front when its estimate exceeds
 *     the lifetime budget remaining.
 *
 * Without SECTORS_API_KEY the script exits early with a clear message and the
 * app keeps serving the seeded demonstration dataset.
 */
import "dotenv/config";
import { db, pool } from "./index";
import * as s from "./schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  creditBudget,
  fetchCompaniesAllPages,
  fetchCompanyReport,
  fetchDailyPrice,
  fetchForeignFlow,
  fetchIndexDaily,
  sectorsApiKey,
  stripJk,
  SectorsConfigError,
  type DailyPriceRow,
  type ForeignFlowRow,
  type IndexDailyRow,
} from "../lib/sectors";
import { detectSwingLow } from "../lib/gann";
import { computeMarketScore } from "../lib/scoring";
import { marketIntelligenceScore } from "../lib/marketIntel";
import { priceFloorBandFor } from "../lib/regime";
import { STAGE_META } from "../lib/system";
import { refreshWatchlist } from "./watchlist";

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (dateIso: string, days: number) =>
  iso(new Date(new Date(`${dateIso}T00:00:00Z`).getTime() + days * 86_400_000));

const UNIVERSE = (process.env.SECTORS_UNIVERSE || "curated").toLowerCase();
const FULL = process.argv.includes("--full");
const FLOW_ARG = process.argv.find((a) => a === "--flow" || a.startsWith("--flow="));
const FLOW = !!FLOW_ARG;
const FLOW_LIMIT = Math.max(
  1,
  FLOW_ARG && FLOW_ARG.includes("=") ? Number(FLOW_ARG.split("=")[1]) || 10 : 10,
);
const FORCE_INDEX = process.argv.includes("--index");
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 3;

/** Index code anchored for the Gann 432 cycle maths. */
const INDEX_CODE = (process.env.SECTORS_INDEX_CODE || "ihsg").toLowerCase();
/** How far back to keep index history. The API clamps each call to 90 days. */
const INDEX_HISTORY_DAYS = Number(process.env.SECTORS_INDEX_HISTORY_DAYS || 740);

/** Watchlist size — the dominant quota lever (1 credit per ticker per run). */
const WATCHLIST_LIMIT = Math.max(1, Number(process.env.SECTORS_WATCHLIST_LIMIT || 20));
/** Lifetime credit pool (the plan quota), not per-run. */
const LIFETIME_BUDGET = Number(process.env.SECTORS_TOTAL_CREDIT_BUDGET || 1000);
/** Credits spent before this accounting started (baseline from AGENTS.md). */
const CREDITS_PREUSED = Number(process.env.SECTORS_CREDITS_ALREADY_USED || 0);
/** Fundamentals older than this get refreshed (3 credits each). */
const FUNDAMENTAL_MAX_AGE_DAYS = Math.max(1, Number(process.env.SECTORS_FUNDAMENTAL_MAX_AGE_DAYS || 30));
/** Consecutive empty index probes before we stop trusting the probe and sync anyway. */
const MAX_PROBE_EMPTY_STREAK = 3;
/** Consecutive empty full-window pulls before a ticker stops costing credits. */
const MAX_TICKER_EMPTY_RUNS = 3;

let creditsUsed = 0;
const stageCredits = { prices: 0, fundamentals: 0, index: 0, flow: 0 };
function addCredits(n: number, stage: keyof typeof stageCredits) {
  creditsUsed += n;
  stageCredits[stage] += n;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Bounded-concurrency map over items, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ */
/*  1. Universe                                                        */
/* ------------------------------------------------------------------ */

interface CompanyRow { id: number; ticker: string; sector: string; companyName: string }

async function loadUniverse(): Promise<CompanyRow[]> {
  const inDb = await db
    .select({ id: s.companies.id, ticker: s.companies.ticker, sector: s.companies.sector, companyName: s.companies.companyName })
    .from(s.companies);

  if (UNIVERSE !== "all") {
    console.log(`Universe: curated — ${inDb.length} companies already in DB`);
    return inDb;
  }
  if (DRY_RUN) {
    console.log(`Universe: all — dry run works from the ${inDb.length} companies already in DB (screener not called).`);
    return inDb;
  }

  console.log(`Universe: all — pulling full IDX screener…`);
  const seen = new Map(inDb.map((c) => [c.ticker, c]));
  let offset = 0;
  await fetchCompaniesAllPages({ orderBy: "-market_cap", pageSize: 200 }, async (rows, page) => {
    const newcomers = rows.filter((r) => !seen.has(stripJk(r.symbol)));
    for (const r of newcomers) {
      const ticker = stripJk(r.symbol);
      const inserted = await db
        .insert(s.companies)
        .values({
          ticker,
          companyName: r.company_name,
          sector: "Unclassified",
          industry: "—",
          marketCapIdr: 0,
          basePrice: 1,
        })
        .onConflictDoNothing({ target: s.companies.ticker })
        .returning({ id: s.companies.id });
      const id = inserted[0]?.id;
      if (id) {
        const row: CompanyRow = { id, ticker, sector: "Unclassified", companyName: r.company_name };
        seen.set(ticker, row);
        inDb.push(row);
      }
    }
    offset = page.next_offset ?? offset;
    console.log(`  screener page: ${page.showing} rows (offset ${offset}/${page.total_count})`);
  });
  console.log(`Universe total: ${inDb.length} companies`);
  return inDb;
}

/* ------------------------------------------------------------------ */
/*  2. Prices (watchlist only)                                         */
/* ------------------------------------------------------------------ */

interface PriceSyncResult {
  rowsUpserted: number;
  lastTradingDate: string | null;
  tickersSynced: number;
  latestByCompany: Map<number, { close: number; marketCapIdr: number; series: { date: string; close: number; volume: number }[] }>;
  aborted: string | null;
}

async function syncPrices(companies: CompanyRow[], emptyRuns: Map<number, number>): Promise<PriceSyncResult> {
  const prior = await db.select().from(s.syncState).where(eq(s.syncState.source, "sectors.prices")).limit(1);
  const hasPriorSync = prior.length > 0;
  const lastTradingDate = prior[0]?.lastTradingDate ?? null;
  const today = iso(new Date());

  /* Tickers with no local rows at all (e.g. rate-limited in an earlier run)
     need the full trailing window, not just the incremental day. */
  const counts = await db
    .select({ companyId: s.marketPrices.companyId, rows: sql<number>`count(*)::int` })
    .from(s.marketPrices)
    .where(inArray(s.marketPrices.companyId, companies.map((c) => c.id)))
    .groupBy(s.marketPrices.companyId);
  const rowCount = new Map(counts.map((r) => [r.companyId, r.rows]));

  const fullWindowStart = addDays(today, -90);
  const incrementalStart = hasPriorSync ? addDays(lastTradingDate ?? addDays(today, -30), 1) : fullWindowStart;

  if (!hasPriorSync) {
    console.log(`First sync — replacing seeded synthetic price series with real API data (${fullWindowStart} → ${today}) for the watchlist only.`);
    await db.delete(s.marketPrices).where(
      inArray(s.marketPrices.companyId, companies.map((c) => c.id)),
    );
  } else {
    const missing = companies.filter((c) => (rowCount.get(c.id) ?? 0) === 0).length;
    console.log(
      `Incremental sync — trading days after ${lastTradingDate}` +
        (missing ? ` (+ full-window backfill for ${missing} empty tickers)` : "") +
        `.`,
    );
  }

  const byId = new Map(companies.map((c) => [c.id, c]));
  const result: PriceSyncResult = {
    rowsUpserted: 0,
    lastTradingDate: null,
    tickersSynced: 0,
    latestByCompany: new Map(),
    aborted: null,
  };

  let budgetAborted = false;
  await mapPool(companies, CONCURRENCY, async (c) => {
    if (budgetAborted) return;

    /* Circuit breaker: a ticker that stayed empty across MAX_TICKER_EMPTY_RUNS
       full-window pulls (delisted / permanently unavailable) stops costing a
       credit per run. It re-enters automatically if it ever returns data or is
       re-selected into the watchlist fresh. */
    const priorEmpty = emptyRuns.get(c.id) ?? 0;
    const wasEmpty = (rowCount.get(c.id) ?? 0) === 0;
    if (wasEmpty && priorEmpty >= MAX_TICKER_EMPTY_RUNS) {
      console.warn(`  ${c.ticker}: empty for ${priorEmpty} consecutive pulls — skipped to save credits`);
      return;
    }

    try {
      /* empty tickers always pull the full trailing window */
      const start = wasEmpty ? fullWindowStart : incrementalStart;
      const series = await fetchDailyPrice(c.ticker, start, today);
      addCredits(1, "prices");
      result.tickersSynced += 1;

      const rows = series
        .filter((r) => stripJk(r.symbol) === c.ticker)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r: DailyPriceRow) => ({
          companyId: c.id,
          tradingDate: r.date,
          close: r.close,
          volume: r.volume,
          marketCapIdr: Math.round(r.market_cap / 1e9), // API: full IDR → DB: billions
        }));

      if (rows.length === 0) {
        if (wasEmpty) {
          await db
            .update(s.watchlist)
            .set({ emptyRuns: sql`${s.watchlist.emptyRuns} + 1` })
            .where(eq(s.watchlist.companyId, c.id));
        }
        console.warn(`  ${c.ticker}: no data in window (skipped)`);
        return;
      }
      if (wasEmpty) {
        await db.update(s.watchlist).set({ emptyRuns: 0 }).where(eq(s.watchlist.companyId, c.id));
      }

      await db
        .insert(s.marketPrices)
        .values(rows.map(({ companyId, tradingDate, close, volume }) => ({ companyId, tradingDate, close, volume })))
        .onConflictDoUpdate({
          target: [s.marketPrices.companyId, s.marketPrices.tradingDate],
          set: { close: sql`excluded.close`, volume: sql`excluded.volume` },
        });
      result.rowsUpserted += rows.length;

      const last = rows[rows.length - 1];
      result.lastTradingDate = result.lastTradingDate && result.lastTradingDate > last.tradingDate
        ? result.lastTradingDate
        : last.tradingDate;

      /* real market cap + base price from the latest row */
      await db
        .update(s.companies)
        .set({ marketCapIdr: last.marketCapIdr, basePrice: last.close })
        .where(eq(s.companies.id, c.id));

      result.latestByCompany.set(c.id, {
        close: last.close,
        marketCapIdr: last.marketCapIdr,
        series: rows.map(({ tradingDate, close, volume }) => ({ date: tradingDate, close, volume })),
      });
    } catch (err) {
      if (err instanceof SectorsConfigError) {
        budgetAborted = true;
        result.aborted = err.message;
        return;
      }
      console.warn(`  ${c.ticker}: ${err instanceof Error ? err.message : err}`);
    }
  });

  console.log(
    `Prices: ${result.rowsUpserted} rows for ${result.tickersSynced}/${companies.length} tickers` +
      (result.lastTradingDate ? `, through ${result.lastTradingDate}` : "") +
      (result.aborted ? ` — ABORTED: ${result.aborted}` : ""),
  );
  return result;
}

/* ------------------------------------------------------------------ */
/*  3. Fundamentals (watchlist only, staleness-based)                  */
/* ------------------------------------------------------------------ */

async function fundamentalsTargets(companies: CompanyRow[]): Promise<CompanyRow[]> {
  const existing = await db
    .select({ companyId: s.companyFundamentals.companyId, reportDate: s.companyFundamentals.reportDate })
    .from(s.companyFundamentals);
  const has = new Map(existing.map((r) => [r.companyId, r.reportDate]));
  const staleBefore = addDays(iso(new Date()), -FUNDAMENTAL_MAX_AGE_DAYS);
  if (FULL) return companies;
  return companies.filter((c) => {
    const rd = has.get(c.id);
    return !rd || rd <= staleBefore;
  });
}

async function syncFundamentals(companies: CompanyRow[]): Promise<number> {
  const targets = await fundamentalsTargets(companies);

  if (targets.length === 0) {
    console.log(`Fundamentals: all watchlist reports younger than ${FUNDAMENTAL_MAX_AGE_DAYS}d (use \`npm run db:sync -- --full\` to force)`);
    return 0;
  }
  console.log(`Fundamentals: refreshing ${targets.length} watchlist companies (3 credits each)…`);

  let refreshed = 0;
  let budgetAborted = false;
  await mapPool(targets, CONCURRENCY, async (c) => {
    if (budgetAborted) return;
    try {
      const report = await fetchCompanyReport<{
        financials?: {
          yoy_quarter_earnings_growth?: number | null;
          yoy_quarter_revenue_growth?: number | null;
        };
        dividend?: { yield_ttm?: number | null };
      }>(c.ticker, ["financials", "dividend", "future"]);
      addCredits(3, "fundamentals");
      refreshed += 1;

      const epsGrowth = +((report.financials?.yoy_quarter_earnings_growth ?? 0) * 100).toFixed(2);
      const revenueGrowth = +((report.financials?.yoy_quarter_revenue_growth ?? 0) * 100).toFixed(2);
      const dividendYield = +((report.dividend?.yield_ttm ?? 0) * 100).toFixed(2);

      await db
        .insert(s.companyFundamentals)
        .values({
          companyId: c.id,
          reportDate: iso(new Date()),
          epsGrowth,
          revenueGrowth,
          dividendYield,
          note: "Sectors API company report — YoY quarterly growth + TTM dividend yield",
        })
        .onConflictDoUpdate({
          target: s.companyFundamentals.companyId,
          set: {
            reportDate: sql`excluded.report_date`,
            epsGrowth: sql`excluded.eps_growth`,
            revenueGrowth: sql`excluded.revenue_growth`,
            dividendYield: sql`excluded.dividend_yield`,
            note: sql`excluded.note`,
          },
        });
    } catch (err) {
      if (err instanceof SectorsConfigError) {
        budgetAborted = true;
        console.warn(`  ${c.ticker}: ${err.message}`);
        return;
      }
      console.warn(`  ${c.ticker} fundamentals: ${err instanceof Error ? err.message : err}`);
    }
  });

  console.log(`Fundamentals: ${refreshed}/${targets.length} refreshed`);
  return refreshed;
}

/* ------------------------------------------------------------------ */
/*  4. Snapshots + market-intel scores (0 credits, local recompute)    */
/* ------------------------------------------------------------------ */

async function recomputeDerived(companies: CompanyRow[]): Promise<{ snapshots: number; scores: number; snapshotDate: string | null }> {
  const allPrices = await db
    .select({ companyId: s.marketPrices.companyId, tradingDate: s.marketPrices.tradingDate, close: s.marketPrices.close, volume: s.marketPrices.volume })
    .from(s.marketPrices)
    .orderBy(s.marketPrices.companyId, s.marketPrices.tradingDate);

  /* Both snapshot_date and computed_on are NOT NULL, and every derived row is
     keyed off the newest stored trading day. With no stored prices there is
     nothing to recompute — bail out rather than write a null date. */
  const snapshotDate = allPrices.length ? allPrices[allPrices.length - 1].tradingDate : null;
  if (!snapshotDate) {
    console.log("Derived: no stored prices — skipping snapshot and intel recompute.");
    return { snapshots: 0, scores: 0, snapshotDate: null };
  }

  const byCompany = new Map<number, { date: string; close: number; volume: number }[]>();
  for (const r of allPrices) {
    const list = byCompany.get(r.companyId) ?? [];
    list.push({ date: r.tradingDate, close: r.close, volume: r.volume });
    byCompany.set(r.companyId, list);
  }

  const pctChange = (series: { close: number }[], back: number) =>
    (series[series.length - 1].close / series[series.length - 1 - back].close - 1) * 100;

  /* sector average of raw pc20 across all companies in DB */
  const rawPc20 = new Map<number, number>();
  for (const [cid, series] of byCompany) {
    if (series.length >= 21) rawPc20.set(cid, pctChange(series, 20));
  }
  const sectorMembers = new Map<string, number[]>();
  for (const c of companies) {
    const pc = rawPc20.get(c.id);
    if (pc === undefined) continue;
    const list = sectorMembers.get(c.sector) ?? [];
    list.push(pc);
    sectorMembers.set(c.sector, list);
  }
  const sectorAvg = new Map<string, number>();
  for (const [sector, list] of sectorMembers) {
    sectorAvg.set(sector, list.reduce((a, b) => a + b, 0) / list.length);
  }

  const snapByCompany = new Map<number, { volRatio: number; pc20: number; sectorRet: number; rs: number; lastClose: number; drawdown: number }>();
  let snapshots = 0;
  for (const c of companies) {
    const series = byCompany.get(c.id);
    if (!series || series.length < 31) continue; // pc30 needs 31 rows; keep previous snapshot otherwise

    const pc5 = +pctChange(series, 5).toFixed(2);
    const pc20 = +pctChange(series, 20).toFixed(2);
    const pc30 = +pctChange(series, 30).toFixed(2);
    const recent = series.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;
    const base = series.slice(-25, -5).reduce((a, b) => a + b.volume, 0) / 20;
    /* Suspended stocks sit at a constant close with zero volume — treat the
       ratio as neutral (1) instead of 0/0 = NaN, which would poison the scores. */
    const volRatio = base > 0 && Number.isFinite(recent / base) ? +(recent / base).toFixed(2) : 1;
    const sectorRet = +(sectorAvg.get(c.sector) ?? pc20).toFixed(2);
    const rs = +(pc20 - sectorRet).toFixed(2);
    const mkt = computeMarketScore({ volumeRatio20d: volRatio, priceChange20d: pc20, relativeStrength: rs });
    const lastClose = series[series.length - 1].close;
    const highClose = Math.max(...series.map((p) => p.close));
    const drawdown = +(((lastClose - highClose) / highClose) * 100).toFixed(1);
    snapByCompany.set(c.id, { volRatio, pc20, sectorRet, rs, lastClose, drawdown });

    await db
      .insert(s.marketSnapshots)
      .values({
        companyId: c.id,
        snapshotDate,
        priceChange5d: pc5,
        priceChange20d: pc20,
        priceChange30d: pc30,
        volumeRatio20d: volRatio,
        sectorReturn20d: sectorRet,
        relativeStrength: rs,
        marketSignalScore: mkt,
      })
      .onConflictDoUpdate({
        target: s.marketSnapshots.companyId,
        set: {
          snapshotDate: sql`excluded.snapshot_date`,
          priceChange5d: sql`excluded.price_change_5d`,
          priceChange20d: sql`excluded.price_change_20d`,
          priceChange30d: sql`excluded.price_change_30d`,
          volumeRatio20d: sql`excluded.volume_ratio_20d`,
          sectorReturn20d: sql`excluded.sector_return_20d`,
          relativeStrength: sql`excluded.relative_strength`,
          marketSignalScore: sql`excluded.market_signal_score`,
        },
      });
    snapshots += 1;
  }

  /* market-intel scores — same composition as seed.ts */
  const funds = await db.select().from(s.companyFundamentals);
  const fundByCompany = new Map(funds.map((f) => [f.companyId, f]));

  const eventRows = await db
    .select({
      companyId: s.businessEvents.companyId,
      stage: s.businessEvents.stage,
      sourceTier: s.businessEvents.sourceTier,
      extractionConfidence: s.businessEvents.extractionConfidence,
      investmentAmountIdr: s.businessEvents.investmentAmountIdr,
      timingScore: s.businessEvents.timingScore,
      evidence: s.eventSdgMappings.evidenceScore,
    })
    .from(s.businessEvents)
    .innerJoin(s.eventSdgMappings, eq(s.eventSdgMappings.eventId, s.businessEvents.id));

  const bestEventByCompany = new Map<number, (typeof eventRows)[number]>();
  for (const row of eventRows) {
    const current = bestEventByCompany.get(row.companyId);
    if (!current || row.evidence > current.evidence) bestEventByCompany.set(row.companyId, row);
  }

  const allPc20 = [...rawPc20.values()];
  const marketAvgPc20All = allPc20.length ? allPc20.reduce((a, b) => a + b, 0) / allPc20.length : 0;
  let scores = 0;
  for (const c of companies) {
    const snap = snapByCompany.get(c.id);
    if (!snap) continue;

    const { volRatio, pc20, sectorRet, rs, lastClose, drawdown } = snap;
    const fund = fundByCompany.get(c.id);
    const ev = bestEventByCompany.get(c.id);

    const miFinal = marketIntelligenceScore({
      priceDrawdownPct: drawdown,
      priceChange20d: pc20,
      volumeRatio20d: volRatio,
      relativeStrength: rs,
      revenueGrowth: fund?.revenueGrowth ?? 0,
      epsGrowth: fund?.epsGrowth ?? 0,
      dividendYield: fund?.dividendYield ?? 0,
      sectorReturn20d: sectorRet,
      marketAvg20d: marketAvgPc20All,
      hasEvent: !!ev,
      extractionConfidence: ev?.extractionConfidence ?? 0,
      sourceTier: ev?.sourceTier ?? 4,
      investmentIdrBn: ev?.investmentAmountIdr ?? null,
      stageIdx: ev ? (STAGE_META[ev.stage as keyof typeof STAGE_META]?.idx ?? 0) : 0,
      sdgEvidence: ev?.evidence ?? 0,
      timingScore: ev?.timingScore ?? 0,
    });

    const band = priceFloorBandFor(lastClose, iso(new Date()));
    await db
      .insert(s.marketIntelScores)
      .values({
        companyId: c.id,
        computedOn: iso(new Date()),
        methodologyVersion: miFinal.methodologyVersion,
        priceDislocation: Math.round(miFinal.priceDislocation),
        volumeAnomaly: Math.round(miFinal.volumeAnomaly),
        relativePerformance: Math.round(miFinal.relativePerformance),
        fundamentalContext: Math.round(miFinal.fundamentalContext),
        marketIndustryContext: Math.round(miFinal.marketIndustryContext),
        sectorsSubtotal: Math.round(miFinal.sectorsSubtotal),
        businessEventPts: Math.round(miFinal.businessEventPts),
        sourceQuality: Math.round(miFinal.sourceQuality),
        eventMateriality: Math.round(miFinal.eventMateriality),
        evidenceSubtotal: Math.round(miFinal.evidenceSubtotal),
        sdgTargetRelevance: Math.round(miFinal.sdgTargetRelevance),
        executionTiming2030: Math.round(miFinal.executionTiming2030),
        sdgSubtotal: Math.round(miFinal.sdgSubtotal),
        totalScore: miFinal.totalScore,
        marketCondition: miFinal.marketCondition,
        priceFloorBand: band.band,
        araLabel: band.ara,
        arbLabel: band.arb,
      })
      .onConflictDoUpdate({
        target: s.marketIntelScores.companyId,
        set: {
          computedOn: sql`excluded.computed_on`,
          methodologyVersion: sql`excluded.methodology_version`,
          priceDislocation: sql`excluded.price_dislocation`,
          volumeAnomaly: sql`excluded.volume_anomaly`,
          relativePerformance: sql`excluded.relative_performance`,
          fundamentalContext: sql`excluded.fundamental_context`,
          marketIndustryContext: sql`excluded.market_industry_context`,
          sectorsSubtotal: sql`excluded.sectors_subtotal`,
          businessEventPts: sql`excluded.business_event_pts`,
          sourceQuality: sql`excluded.source_quality`,
          eventMateriality: sql`excluded.event_materiality`,
          evidenceSubtotal: sql`excluded.evidence_subtotal`,
          sdgTargetRelevance: sql`excluded.sdg_target_relevance`,
          executionTiming2030: sql`excluded.execution_timing_2030`,
          sdgSubtotal: sql`excluded.sdg_subtotal`,
          totalScore: sql`excluded.total_score`,
          marketCondition: sql`excluded.market_condition`,
          priceFloorBand: sql`excluded.price_floor_band`,
          araLabel: sql`excluded.ara_label`,
          arbLabel: sql`excluded.arb_label`,
        },
      });
    scores += 1;
  }

  console.log(`Derived: ${snapshots} snapshots, ${scores} market-intel scores recomputed`);
  return { snapshots, scores, snapshotDate };
}

/* ------------------------------------------------------------------ */
/*  5. Index level series (trading-day probe + Gann anchor)            */
/* ------------------------------------------------------------------ */

interface IndexSyncResult {
  rows: number;
  lastDate: string | null;
  /** true when the incremental start was already past today (same-day re-run) */
  skippedCurrent: boolean;
  /** consecutive runs whose incremental window returned 0 bars */
  emptyStreak: number;
  aborted: string | null;
}

/**
 * Pulls the index level history in <=90-day chunks.
 *
 * The API clamps any wider request to the trailing 90 days ending at `end`
 * (live-verified 2026-10-04), so a naive `start=today-740` call would silently
 * return only 90 days and the older history would never arrive. Chunking is
 * therefore mandatory, not an optimisation.
 *
 * This stage also doubles as the trading-day probe: because it runs before
 * the per-ticker price stage, an incremental window with 0 new bars lets
 * main() skip the ~1-credit-per-ticker price pull on weekends and holidays
 * (empty 200 responses still consume credits).
 */
async function syncIndex(): Promise<IndexSyncResult> {
  const source = `sectors.index`;
  const today = iso(new Date());
  const prior = await db.select().from(s.syncState).where(eq(s.syncState.source, source)).limit(1);
  const hasPrior = prior.length > 0 && !FORCE_INDEX;
  const lastDate = prior[0]?.lastTradingDate ?? null;

  const stored = await db
    .select({ rows: sql<number>`count(*)::int`, min: sql<string | null>`min(trading_date)`, max: sql<string | null>`max(trading_date)` })
    .from(s.indexPrices)
    .where(eq(s.indexPrices.indexCode, INDEX_CODE.toUpperCase()));

  const start = hasPrior && lastDate ? addDays(lastDate, 1) : addDays(today, -INDEX_HISTORY_DAYS);

  if (hasPrior && lastDate && start > today) {
    console.log(`Index: already current through ${lastDate} — nothing to do.`);
    return { rows: 0, lastDate, skippedCurrent: true, emptyStreak: prior[0]?.emptyStreak ?? 0, aborted: null };
  }

  console.log(
    `Index: pulling ${INDEX_CODE.toUpperCase()} ${start} → ${today} in 90-day chunks` +
      (hasPrior ? " (incremental)" : FORCE_INDEX ? " (forced full re-pull)" : " (full history)"),
  );

  let rows = 0;
  let maxDate: string | null = null;
  let aborted: string | null = null;
  let cursor = start;

  while (cursor <= today) {
    const chunkEnd = addDays(cursor, 89) > today ? today : addDays(cursor, 89);
    try {
      const series = await fetchIndexDaily(INDEX_CODE, cursor, chunkEnd);
      addCredits(1, "index");
      const rowsToInsert: (typeof s.indexPrices.$inferInsert)[] = series
        .filter((r: IndexDailyRow) => r.date >= cursor && r.date <= chunkEnd)
        .map((r) => ({ indexCode: r.index_code.toUpperCase(), tradingDate: r.date, close: r.price }));

      if (rowsToInsert.length > 0) {
        await db
          .insert(s.indexPrices)
          .values(rowsToInsert)
          .onConflictDoUpdate({
            target: [s.indexPrices.indexCode, s.indexPrices.tradingDate],
            set: { close: sql`excluded.close` },
          });
        rows += rowsToInsert.length;
      }
      const chunkMax = rowsToInsert.length ? rowsToInsert[rowsToInsert.length - 1].tradingDate : null;
      if (chunkMax && (!maxDate || chunkMax > maxDate)) maxDate = chunkMax;
      console.log(`  ${cursor} → ${chunkEnd}: ${rowsToInsert.length} bars`);
    } catch (err) {
      if (err instanceof SectorsConfigError) {
        aborted = err.message;
        break;
      }
      console.warn(`  chunk ${cursor} → ${chunkEnd} failed: ${err instanceof Error ? err.message : err}`);
    }
    cursor = addDays(chunkEnd, 1);
  }

  const finalMax = maxDate ?? stored[0]?.max ?? null;
  console.log(`Index: ${rows} rows upserted${finalMax ? `, through ${finalMax}` : ""}${aborted ? ` — ABORTED: ${aborted}` : ""}`);

  /* The probe streak only counts runs that actually asked the API and got
     nothing back — a same-day re-run that was already current says nothing
     about whether the market traded. */
  const priorStreak = prior[0]?.emptyStreak ?? 0;
  const emptyStreak = rows === 0 && !aborted ? priorStreak + 1 : 0;

  /* Report the anchor the cycle maths will use, so a wrong detection is
     visible in the logs instead of silently producing wrong window dates. */
  if (finalMax) {
    const series = await db
      .select({ date: s.indexPrices.tradingDate, close: s.indexPrices.close })
      .from(s.indexPrices)
      .where(eq(s.indexPrices.indexCode, INDEX_CODE.toUpperCase()))
      .orderBy(s.indexPrices.tradingDate);
    const detected = detectSwingLow(series.map((r) => ({ date: r.date, close: r.close })), iso(new Date()));
    if (detected) {
      console.log(
        `Index: detected zero point ${detected.date} @ ${detected.close}` +
          ` (${detected.barsSearched} bars searched${detected.edgeConstrained ? ", EDGE-CONSTRAINED" : ""})`,
      );
    } else {
      console.log("Index: not enough history to detect a swing low (need >40 bars).");
    }
  }

  return { rows, lastDate: finalMax, skippedCurrent: false, emptyStreak, aborted };
}

/* ------------------------------------------------------------------ */
/*  6. Net foreign flow (opt-in: --flow=N, ~1 credit/ticker)           */
/* ------------------------------------------------------------------ */

async function syncForeignFlow(
  companies: CompanyRow[],
): Promise<{ rows: number; tickers: number; failed: number; aborted: string | null; lastDate: string | null }> {
  const source = `sectors.foreign_flow`;
  const today = iso(new Date());
  const prior = await db.select().from(s.syncState).where(eq(s.syncState.source, source)).limit(1);
  const lastDate = prior[0]?.lastTradingDate ?? null;
  const fullWindowStart = addDays(today, -90);
  const start = lastDate ? addDays(lastDate, 1) : fullWindowStart;

  if (start > today) {
    console.log(`Foreign flow: already current through ${lastDate} — nothing to do.`);
    return { rows: 0, tickers: 0, failed: 0, aborted: null, lastDate };
  }

  /* Tickers with no stored rows at all (rate-limited or empty on an earlier
     run) must get the full window, not just the incremental tail — otherwise
     the shared watermark permanently skips them. Mirrors syncPrices(). */
  const counts = await db
    .select({ companyId: s.foreignFlow.companyId, rows: sql<number>`count(*)::int` })
    .from(s.foreignFlow)
    .where(inArray(s.foreignFlow.companyId, companies.map((c) => c.id)))
    .groupBy(s.foreignFlow.companyId);
  const rowCount = new Map(counts.map((r) => [r.companyId, r.rows]));
  const empties = companies.filter((c) => (rowCount.get(c.id) ?? 0) === 0);

  console.log(
    `Foreign flow: pulling ${companies.length} tickers, ${start} → ${today} (~${companies.length} credits)` +
      (empties.length ? ` (+ full-window backfill for ${empties.length} empty tickers: ${empties.map((c) => c.ticker).join(", ")})` : "") +
      `.`,
  );

  let rows = 0;
  let tickers = 0;
  let failed = 0;
  let aborted: string | null = null;
  let budgetAborted = false;
  const maxDate: { value: string | null } = { value: null };

  await mapPool(companies, CONCURRENCY, async (c) => {
    if (budgetAborted) return;
    try {
      const tickStart = (rowCount.get(c.id) ?? 0) === 0 ? fullWindowStart : start;
      const res = await fetchForeignFlow(c.ticker, tickStart, today);
      addCredits(1, "flow");
      tickers += 1;
      const toInsert: (typeof s.foreignFlow.$inferInsert)[] = (res.data ?? [])
        .filter((r: ForeignFlowRow) => r.date >= tickStart && r.date <= today)
        .map((r) => ({ companyId: c.id, tradingDate: r.date, netForeignInflow: Math.round(r.net_foreign_inflow) }));

      if (toInsert.length === 0) {
        /* Zero rows is only a FAILURE for a ticker that still holds nothing in
           the table. On a weekend or a pre-listing window every ticker returns
           zero new rows, which is not an error. */
        const hadAny = (rowCount.get(c.id) ?? 0) > 0;
        if (!hadAny) {
          failed++;
          console.warn(`  ${c.ticker}: no flow rows at all (window ${tickStart} → ${today})`);
        } else {
          console.log(`  ${c.ticker}: no new flow rows (already current)`);
        }
        return;
      }
      await db
        .insert(s.foreignFlow)
        .values(toInsert)
        .onConflictDoUpdate({
          target: [s.foreignFlow.companyId, s.foreignFlow.tradingDate],
          set: { netForeignInflow: sql`excluded.net_foreign_inflow` },
        });
      rows += toInsert.length;
      const chunkMax = toInsert[toInsert.length - 1].tradingDate;
      if (!maxDate.value || chunkMax > maxDate.value) maxDate.value = chunkMax;
    } catch (err) {
      if (err instanceof SectorsConfigError) {
        budgetAborted = true;
        aborted = err.message;
        console.warn(`  ${c.ticker}: ${err.message}`);
        return;
      }
      failed++;
      console.warn(`  ${c.ticker} flow: ${err instanceof Error ? err.message : err}`);
    }
  });

  console.log(`Foreign flow: ${rows} rows for ${tickers}/${companies.length} tickers${failed ? ` (${failed} failed)` : ""}`);
  return { rows, tickers, failed, aborted, lastDate: maxDate.value };
}

/* ------------------------------------------------------------------ */
/*  7. Persist sync state                                              */
/* ------------------------------------------------------------------ */

/**
 * Persists one sync_state row. On conflict `credits_used` ACCUMULATES the
 * run stage delta (SUM across rows = true lifetime spend); the remaining
 * columns are per-run state and are replaced.
 */
async function upsertSyncState(fields: typeof s.syncState.$inferInsert) {
  await db
    .insert(s.syncState)
    .values(fields)
    .onConflictDoUpdate({
      target: s.syncState.source,
      set: {
        lastSyncAt: sql`excluded.last_sync_at`,
        lastTradingDate: sql`excluded.last_trading_date`,
        universe: sql`excluded.universe`,
        tickersSynced: sql`excluded.tickers_synced`,
        rowsUpserted: sql`excluded.rows_upserted`,
        creditsUsed: sql`${s.syncState.creditsUsed} + excluded.credits_used`,
        emptyStreak: sql`excluded.empty_streak`,
        note: sql`excluded.note`,
      },
    });
}

/**
 * Prices row credits = the price stage + the fundamentals stage (both belong
 * to the same `db:sync` invocation; fundamentals has no source row of its
 * own). Per-source deltas keep SUM(credits_used) across rows equal to the
 * true lifetime spend.
 */
async function saveSyncState(result: PriceSyncResult, universeLabel: string) {
  await upsertSyncState({
    source: "sectors.prices",
    lastSyncAt: new Date(),
    lastTradingDate: result.lastTradingDate,
    universe: universeLabel,
    tickersSynced: result.tickersSynced,
    rowsUpserted: result.rowsUpserted,
    creditsUsed: stageCredits.prices + stageCredits.fundamentals,
    emptyStreak: 0,
    note: result.aborted ? `Aborted: ${result.aborted}` : null,
  });
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function printWatchlist(picks: { rank: number; ticker: string; potentialScore: number; breakdown: { marketIntel: number; signal: number; sdgEvidence: number; marketCondition: number; suspendedPenalty: number } }[]) {
  console.log("Watchlist — sync targets ranked by local potential score:");
  for (const p of picks) {
    const b = p.breakdown;
    console.log(
      `  #${String(p.rank).padStart(2, "0")} ${p.ticker.padEnd(8)} score ${String(p.potentialScore).padStart(3)}` +
        `  [intel ${b.marketIntel} · signal ${b.signal} · sdg ${b.sdgEvidence} · cond ${b.marketCondition}` +
        `${b.suspendedPenalty ? ` · suspended ${b.suspendedPenalty}` : ""}]`,
    );
  }
  console.log("");
}

async function main() {
  console.log("=== Sectors API → Postgres sync ===");
  if (!DRY_RUN) {
    try {
      sectorsApiKey();
    } catch (err) {
      console.error(`✘ ${err instanceof Error ? err.message : err}`);
      console.error("  App keeps serving the seeded demonstration dataset.");
      process.exit(1);
    }
  }

  const budget = Number(process.env.SECTORS_DAILY_CREDIT_BUDGET || 200);
  creditBudget.remaining = budget;

  /* lifetime accounting — per-source deltas in sync_state sum to the truth */
  const [usedRow] = await db
    .select({ used: sql<number>`coalesce(sum(${s.syncState.creditsUsed}), 0)::int` })
    .from(s.syncState);
  const lifetimeUsed = CREDITS_PREUSED + usedRow.used;
  const lifetimeRemaining = LIFETIME_BUDGET - lifetimeUsed;

  const mode = DRY_RUN
    ? "DRY RUN (0 API calls)"
    : FULL
      ? "FULL (watchlist prices + fundamentals)"
      : FLOW
        ? `default + foreign flow (top ${FLOW_LIMIT})`
        : "default (watchlist prices + derived)";
  console.log(
    `Mode: ${mode} · universe: ${UNIVERSE} · watchlist: ${WATCHLIST_LIMIT} · index: ${INDEX_CODE.toUpperCase()}` +
      ` · daily budget: ${budget} · lifetime: ${lifetimeUsed}/${LIFETIME_BUDGET} (remaining ${Math.max(0, lifetimeRemaining)})`,
  );

  const companies = await loadUniverse();
  const picks = await refreshWatchlist(WATCHLIST_LIMIT);
  printWatchlist(picks);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const watchCompanies = picks
    .map((p) => byId.get(p.companyId))
    .filter((c): c is CompanyRow => c !== undefined);
  const emptyRuns = new Map(picks.map((p) => [p.companyId, p.emptyRuns]));

  /* cost estimate — consumed by the lifetime guard and printed by --dry-run */
  const today = iso(new Date());
  const [indexPrior] = await db
    .select()
    .from(s.syncState)
    .where(eq(s.syncState.source, "sectors.index"))
    .limit(1);
  const indexLast = indexPrior?.lastTradingDate ?? null;
  const indexDaysBehind = indexLast ? (Date.parse(today) - Date.parse(indexLast)) / 86_400_000 : INDEX_HISTORY_DAYS;
  const indexCredits = indexLast && indexLast >= today ? 0 : Math.max(1, Math.ceil(indexDaysBehind / 90));
  const fundamentalsCount = (await fundamentalsTargets(watchCompanies)).length;
  const flowCredits = FLOW ? Math.min(FLOW_LIMIT, watchCompanies.length) : 0;
  const estimated = watchCompanies.length + indexCredits + fundamentalsCount * 3 + flowCredits;

  console.log(
    `Estimated cost: ${estimated} credits` +
      ` (prices ${watchCompanies.length} + index ${indexCredits} + fundamentals ${fundamentalsCount * 3}${flowCredits ? ` + flow ${flowCredits}` : ""})`,
  );

  if (DRY_RUN) {
    console.log(`Lifetime after this run would be: ${lifetimeUsed + estimated}/${LIFETIME_BUDGET}`);
    console.log("Dry run complete — no API calls made. ✔");
    await pool.end();
    return;
  }

  if (estimated > lifetimeRemaining) {
    console.error(
      `✘ Estimated run cost (${estimated} credits) exceeds the remaining lifetime budget (${Math.max(0, lifetimeRemaining)}/${LIFETIME_BUDGET}).` +
        ` Raise SECTORS_TOTAL_CREDIT_BUDGET, lower SECTORS_WATCHLIST_LIMIT, or wait for a quota reset.`,
    );
    await pool.end();
    process.exit(1);
  }
  if (lifetimeRemaining - estimated < 14 * (WATCHLIST_LIMIT + 1)) {
    console.warn(
      `⚠ Lifetime budget running low: ${Math.max(0, lifetimeRemaining)} credits left (~2 weeks of daily runs).` +
        ` Consider a smaller SECTORS_WATCHLIST_LIMIT or a less frequent schedule.`,
    );
  }

  /* --- probe: index first, so a closed market costs 1 credit, not 21+ --- */
  let indexAborted: string | null = null;
  let skippedNonTrading = false;
  try {
    const indexResult = await syncIndex();
    indexAborted = indexResult.aborted;
    await upsertSyncState({
      source: "sectors.index",
      lastSyncAt: new Date(),
      lastTradingDate: indexResult.lastDate,
      universe: INDEX_CODE.toUpperCase(),
      tickersSynced: 1,
      rowsUpserted: indexResult.rows,
      creditsUsed: stageCredits.index,
      emptyStreak: indexResult.emptyStreak,
      note: indexResult.aborted ? `Aborted: ${indexResult.aborted}` : null,
    });

    const probeSaysClosed = indexResult.rows === 0 && !indexResult.skippedCurrent && !!indexPrior && !FORCE_INDEX;
    if (probeSaysClosed && indexResult.emptyStreak < MAX_PROBE_EMPTY_STREAK) {
      skippedNonTrading = true;
      console.log(
        `Index probe found no new bars (streak ${indexResult.emptyStreak}/${MAX_PROBE_EMPTY_STREAK}) — ` +
          `likely a non-trading day. Skipping the price/fundamental stages to save ~${watchCompanies.length} credits.`,
      );
    } else if (probeSaysClosed) {
      console.warn(
        `⚠ Index returned no bars for ${indexResult.emptyStreak} consecutive runs — syncing prices anyway ` +
          `(index data may be lagging).`,
      );
    }
  } catch (err) {
    indexAborted = err instanceof Error ? err.message : String(err);
    console.error("✘ Index sync failed:", indexAborted);
  }

  if (skippedNonTrading) {
    console.log(
      `Credits used this run: ${creditsUsed} (index probe only) — lifetime ${lifetimeUsed + creditsUsed}/${LIFETIME_BUDGET}`,
    );
    console.log("Sync complete (non-trading day) ✔");
    await pool.end();
    return;
  }

  const priceResult = await syncPrices(watchCompanies, emptyRuns);
  if (priceResult.tickersSynced === 0) {
    console.error("✘ No price data synced — leaving database and sync state untouched.");
    await pool.end();
    process.exit(1);
  }

  let derivedFailed = false;
  try {
    await syncFundamentals(watchCompanies);
    await recomputeDerived(companies);
  } catch (err) {
    derivedFailed = true;
    console.error("✘ Derived recompute failed:", err instanceof Error ? err.message : err);
  }

  /* Foreign flow costs ~1 credit/ticker, so it stays opt-in behind --flow=N
     and only covers the top-N watchlist names. */
  let flowAborted: string | null = null;
  if (FLOW) {
    try {
      const flowResult = await syncForeignFlow(watchCompanies.slice(0, FLOW_LIMIT));
      /* A completely empty flow pull is a failure, not a no-op — reporting
         "Sync complete" after every ticker errored hid a real breakage. */
      if (flowResult.rows === 0 && flowResult.tickers > 0) {
        flowAborted = `no foreign-flow rows written for ${flowResult.tickers} tickers`;
        console.error(`✘ Foreign flow produced no rows: ${flowAborted}`);
      }
      await upsertSyncState({
        source: "sectors.foreign_flow",
        lastSyncAt: new Date(),
        /* Only advance the watermark when rows were ACTUALLY written. Writing
           today's date after a 0-row run poisons the next incremental pull —
           the same failure mode that cost credits in the price sync. */
        lastTradingDate: flowResult.lastDate,
        universe: UNIVERSE,
        tickersSynced: flowResult.tickers,
        rowsUpserted: flowResult.rows,
        creditsUsed: stageCredits.flow,
        emptyStreak: 0,
        note: flowResult.failed
          ? `${flowResult.failed}/${watchCompanies.slice(0, FLOW_LIMIT).length} tickers returned no rows — re-run to backfill`
          : null,
      });
    } catch (err) {
      flowAborted = err instanceof Error ? err.message : String(err);
      console.error("✘ Foreign flow sync failed:", flowAborted);
    }
  } else {
    console.log("Foreign flow: skipped (pass --flow=N to enable, ~1 credit/ticker, top-N watchlist)");
  }

  /* Persist state even on partial failure so the next run continues
     incrementally instead of re-burning credits on the full window. */
  await saveSyncState(priceResult, UNIVERSE);

  console.log(
    `Credits used this run: ${creditsUsed} (prices ${stageCredits.prices}, fundamentals ${stageCredits.fundamentals},` +
      ` index ${stageCredits.index}, flow ${stageCredits.flow}) — lifetime ${lifetimeUsed + creditsUsed}/${LIFETIME_BUDGET}`,
  );
  if (derivedFailed || priceResult.aborted || indexAborted || flowAborted) {
    console.log("Sync finished with warnings — re-run `npm run db:sync` to retry the missing tickers.");
    await pool.end();
    process.exit(2);
  }
  console.log("Sync complete ✔");
  await pool.end();
}

main().catch(async (err) => {
  console.error("Sync failed:", err instanceof Error ? err.message : err);
  await pool.end().catch(() => {});
  process.exit(1);
});

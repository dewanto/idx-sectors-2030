import { db } from "./index";
import * as s from "./schema";
import { desc, asc, eq, sql, and, gte, inArray } from "drizzle-orm";
import { STAGE_META, type Stage, type TimingClass } from "@/lib/system";
import {
  confluenceScore,
  detectSwingLow,
  detectSwingHigh,
  fibLevels,
  focusWindow,
  gannWindowDates,
  nearestFib,
  priceTimeSquaring,
  rsiDivergence,
  rsiWithDates,
  seasonalDates,
  type ConfluenceInput,
  type GannWindow,
  type PricePoint,
} from "@/lib/gann";
import {
  computeCompanyEngine,
  marketRegime,
  scenarioConfirmation2026,
  newsWeight,
  matrixRowFor,
  matrixColFor,
  TIMING_MATRIX,
  type CompanyEngineResult,
  type AggregateMarket,
  type Regime,
} from "@/lib/regime";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SignalRow {
  id: number;
  signalType: string;
  signalStrength: number;
  sdgEvidenceScore: number;
  marketSignalScore: number;
  timingScore: number;
  executionStage: Stage;
  timingClass: TimingClass;
  headline: string;
  whyFlagged: string[];
  detectedAt: string;
  status: string;
  // company
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  // sdg
  goalNumber: number;
  goalTitle: string;
  goalColor: string;
  targetCode: string | null;
  targetTitle: string | null;
  // event
  eventId: number;
  eventType: string;
  eventTitle: string;
  eventDate: string;
  project: string | null;
  expectedCompletion: string | null;
  targetYear: number | null;
  investmentIdr: number | null;
  volumeRatio: number | null;
  relativeStrength: number | null;
}

const signalSelect = {
  id: s.signals.id,
  signalType: s.signals.signalType,
  signalStrength: s.signals.signalStrength,
  sdgEvidenceScore: s.signals.sdgEvidenceScore,
  marketSignalScore: s.signals.marketSignalScore,
  timingScore: s.signals.timingScore,
  executionStage: s.signals.executionStage,
  timingClass: s.signals.timingClass,
  headline: s.signals.headline,
  whyFlagged: s.signals.whyFlagged,
  detectedAt: s.signals.detectedAt,
  status: s.signals.status,
  ticker: s.companies.ticker,
  companyName: s.companies.companyName,
  sector: s.companies.sector,
  industry: s.companies.industry,
  goalNumber: s.sdgGoals.goalNumber,
  goalTitle: s.sdgGoals.title,
  goalColor: s.sdgGoals.color,
  targetCode: s.sdgTargets.targetCode,
  targetTitle: s.sdgTargets.title,
  eventId: s.businessEvents.id,
  eventType: s.businessEvents.eventType,
  eventTitle: s.businessEvents.title,
  eventDate: s.businessEvents.eventDate,
  project: s.businessEvents.project,
  expectedCompletion: s.businessEvents.expectedCompletionDate,
  targetYear: s.businessEvents.targetYear,
  investmentIdr: s.businessEvents.investmentAmountIdr,
  volumeRatio: s.marketSnapshots.volumeRatio20d,
  relativeStrength: s.marketSnapshots.relativeStrength,
};

function signalQuery() {
  return db
    .select(signalSelect)
    .from(s.signals)
    .innerJoin(s.companies, eq(s.signals.companyId, s.companies.id))
    .innerJoin(s.businessEvents, eq(s.signals.eventId, s.businessEvents.id))
    .innerJoin(s.sdgGoals, eq(s.signals.goalId, s.sdgGoals.id))
    .leftJoin(s.sdgTargets, eq(s.signals.targetId, s.sdgTargets.id))
    .leftJoin(s.marketSnapshots, eq(s.signals.companyId, s.marketSnapshots.companyId));
}

export async function getAllSignals(): Promise<SignalRow[]> {
  const rows = await signalQuery().orderBy(desc(s.signals.signalStrength));
  return rows as unknown as SignalRow[];
}

/* ------------------------------------------------------------------ */
/*  Onboarding tour                                                     */
/* ------------------------------------------------------------------ */

/**
 * Ticker used by the onboarding tour's "Company File" stop — the company
 * behind the strongest active signal, or any tracked company. Cheap query;
 * never throws (the tour degrades gracefully without a ticker).
 */
export async function getTourTicker(): Promise<string | null> {
  try {
    const [top] = await db
      .select({ ticker: s.companies.ticker })
      .from(s.signals)
      .innerJoin(s.companies, eq(s.signals.companyId, s.companies.id))
      .orderBy(desc(s.signals.signalStrength))
      .limit(1);
    if (top?.ticker) return top.ticker;
    const [any] = await db.select({ ticker: s.companies.ticker }).from(s.companies).limit(1);
    return any?.ticker ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardData {
  stats: {
    companies: number;
    trackedEventTypes: number;
    activeEvents: number;
    signals: number;
    highEvidence: number;
    deadlineSensitive: number;
    executionStage: number; // contracted+
    avgTiming: number;
    measuredOutcomes: number;
  };
  topSignals: SignalRow[];
  confirmations: SignalRow[];
  divergences: SignalRow[];
  timeline: SignalRow[];
  heatmap: { sector: string; goal: number; color: string; count: number; strong: number }[];
  heatSectors: string[];
  heatGoals: { n: number; color: string; short: string }[];
  recentEvents: EventRow[];
  momentum: { sector: string; signals: number; avgStrength: number }[];
}

export interface EventRow {
  id: number;
  ticker: string;
  companyName: string;
  sector: string;
  eventType: string;
  title: string;
  eventDate: string;
  stage: Stage;
  timingClass: TimingClass;
  timingScore: number;
  investmentIdr: number | null;
  expectedCompletion: string | null;
  sourceName: string;
  sourceTier: number;
  goalNumber: number | null;
  goalColor: string | null;
  targetCode: string | null;
  evidenceScore: number | null;
}

export async function getDashboard(): Promise<DashboardData> {
  const signals = await getAllSignals();

  const [companiesCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(s.companies);

  const eventRows = await db
    .select({
      id: s.businessEvents.id,
      ticker: s.companies.ticker,
      companyName: s.companies.companyName,
      sector: s.companies.sector,
      eventType: s.businessEvents.eventType,
      title: s.businessEvents.title,
      eventDate: s.businessEvents.eventDate,
      stage: s.businessEvents.stage,
      timingClass: s.businessEvents.timingClass,
      timingScore: s.businessEvents.timingScore,
      investmentIdr: s.businessEvents.investmentAmountIdr,
      expectedCompletion: s.businessEvents.expectedCompletionDate,
      sourceName: s.businessEvents.sourceName,
      sourceTier: s.businessEvents.sourceTier,
    })
    .from(s.businessEvents)
    .innerJoin(s.companies, eq(s.businessEvents.companyId, s.companies.id))
    .orderBy(desc(s.businessEvents.eventDate));

  /* attach primary mapping to events */
  const mappings = await db
    .select({
      eventId: s.eventSdgMappings.eventId,
      goalNumber: s.sdgGoals.goalNumber,
      goalColor: s.sdgGoals.color,
      targetCode: s.sdgTargets.targetCode,
      evidenceScore: s.eventSdgMappings.evidenceScore,
    })
    .from(s.eventSdgMappings)
    .innerJoin(s.sdgGoals, eq(s.eventSdgMappings.goalId, s.sdgGoals.id))
    .leftJoin(s.sdgTargets, eq(s.eventSdgMappings.targetId, s.sdgTargets.id))
    .orderBy(desc(s.eventSdgMappings.evidenceScore));

  const bestMapping = new Map<number, (typeof mappings)[number]>();
  for (const m of mappings) if (!bestMapping.has(m.eventId)) bestMapping.set(m.eventId, m);

  const recentEvents: EventRow[] = eventRows.map((e) => {
    const m = bestMapping.get(e.id);
    return {
      ...e,
      goalNumber: m?.goalNumber ?? null,
      goalColor: m?.goalColor ?? null,
      targetCode: m?.targetCode ?? null,
      evidenceScore: m?.evidenceScore ?? null,
    } as EventRow;
  });

  /* heatmap: sector × goal (distinct events via mappings) */
  const heatRows = await db
    .select({
      sector: s.companies.sector,
      goalNumber: s.sdgGoals.goalNumber,
      goalColor: s.sdgGoals.color,
      count: sql<number>`count(distinct ${s.eventSdgMappings.eventId})::int`,
      strong: sql<number>`count(distinct case when ${s.eventSdgMappings.evidenceScore} >= 80 then ${s.eventSdgMappings.eventId} end)::int`,
    })
    .from(s.eventSdgMappings)
    .innerJoin(s.businessEvents, eq(s.eventSdgMappings.eventId, s.businessEvents.id))
    .innerJoin(s.companies, eq(s.businessEvents.companyId, s.companies.id))
    .innerJoin(s.sdgGoals, eq(s.eventSdgMappings.goalId, s.sdgGoals.id))
    .groupBy(s.companies.sector, s.sdgGoals.goalNumber, s.sdgGoals.color);

  const heatSectors = Array.from(new Set(heatRows.map((r) => r.sector))).sort();
  const heatGoalSet = new Map<number, { n: number; color: string; short: string }>();
  for (const r of heatRows) heatGoalSet.set(r.goalNumber, { n: r.goalNumber, color: r.goalColor, short: `SDG ${r.goalNumber}` });
  const heatGoals = Array.from(heatGoalSet.values()).sort((a, b) => a.n - b.n);

  /* sector momentum */
  const momMap = new Map<string, { n: number; sum: number }>();
  for (const sig of signals) {
    const m = momMap.get(sig.sector) ?? { n: 0, sum: 0 };
    m.n++;
    m.sum += sig.signalStrength;
    momMap.set(sig.sector, m);
  }
  const momentum = Array.from(momMap.entries())
    .map(([sector, m]) => ({ sector, signals: m.n, avgStrength: Math.round(m.sum / m.n) }))
    .sort((a, b) => b.avgStrength - a.avgStrength)
    .slice(0, 6);

  const execStages = ["EXECUTING", "CONTRACTED", "OPERATIONAL", "MEASURED"];
  const stats = {
    companies: companiesCount.count,
    trackedEventTypes: 0,
    activeEvents: eventRows.length,
    signals: signals.length,
    highEvidence: signals.filter((x) => x.sdgEvidenceScore >= 85).length,
    deadlineSensitive: signals.filter((x) => x.timingClass === "CRITICAL" || x.timingClass === "LATE").length,
    executionStage: signals.filter((x) => execStages.includes(x.executionStage)).length,
    avgTiming: Math.round(signals.reduce((a, b) => a + b.timingScore, 0) / Math.max(1, signals.length)),
    measuredOutcomes: signals.filter((x) => x.executionStage === "MEASURED").length,
  };

  const confirmations = signals
    .filter((x) => x.marketSignalScore >= 70)
    .sort((a, b) => b.marketSignalScore - a.marketSignalScore)
    .slice(0, 5);

  const divergences = signals
    .filter((x) => x.sdgEvidenceScore >= 82 && x.marketSignalScore < 62)
    .sort((a, b) => b.sdgEvidenceScore - a.sdgEvidenceScore)
    .slice(0, 5);

  const timeline = signals
    .filter((x) => x.expectedCompletion)
    .sort((a, b) => (a.expectedCompletion! < b.expectedCompletion! ? -1 : 1))
    .slice(0, 12);

  return {
    stats,
    topSignals: signals.slice(0, 9),
    confirmations,
    divergences,
    timeline,
    heatmap: heatRows.map((r) => ({ sector: r.sector, goal: r.goalNumber, color: r.goalColor, count: r.count, strong: r.strong })),
    heatSectors,
    heatGoals,
    recentEvents: recentEvents.slice(0, 14),
    momentum,
  };
}

/* ------------------------------------------------------------------ */
/*  Signal detail                                                       */
/* ------------------------------------------------------------------ */

export async function getSignalDetail(id: number) {
  const [sig] = await db.select().from(s.signals).where(eq(s.signals.id, id));
  if (!sig) return null;

  const [company] = await db.select().from(s.companies).where(eq(s.companies.id, sig.companyId));
  const [event] = await db.select().from(s.businessEvents).where(eq(s.businessEvents.id, sig.eventId));
  const [goal] = await db.select().from(s.sdgGoals).where(eq(s.sdgGoals.id, sig.goalId));
  const [target] = sig.targetId
    ? await db.select().from(s.sdgTargets).where(eq(s.sdgTargets.id, sig.targetId))
    : [null];
  const mappings = await db
    .select({
      goalNumber: s.sdgGoals.goalNumber,
      goalColor: s.sdgGoals.color,
      targetCode: s.sdgTargets.targetCode,
      rel: s.eventSdgMappings.relationshipType,
      evidence: s.eventSdgMappings.evidenceScore,
      confidence: s.eventSdgMappings.mappingConfidence,
      reasoning: s.eventSdgMappings.reasoning,
    })
    .from(s.eventSdgMappings)
    .innerJoin(s.sdgGoals, eq(s.eventSdgMappings.goalId, s.sdgGoals.id))
    .leftJoin(s.sdgTargets, eq(s.eventSdgMappings.targetId, s.sdgTargets.id))
    .where(eq(s.eventSdgMappings.eventId, sig.eventId));
  const evidence = await db
    .select()
    .from(s.signalEvidence)
    .where(eq(s.signalEvidence.signalId, id));
  const snapshots = await db
    .select()
    .from(s.signalSnapshots)
    .where(eq(s.signalSnapshots.signalId, id));
  snapshots.sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : 1));
  const [brief] = await db
    .select()
    .from(s.researchBriefs)
    .where(eq(s.researchBriefs.signalId, id));
  const [market] = await db
    .select()
    .from(s.marketSnapshots)
    .where(eq(s.marketSnapshots.companyId, sig.companyId));
  const [fundamentals] = await db
    .select()
    .from(s.companyFundamentals)
    .where(eq(s.companyFundamentals.companyId, sig.companyId));
  const prices = await db
    .select({ date: s.marketPrices.tradingDate, close: s.marketPrices.close, volume: s.marketPrices.volume })
    .from(s.marketPrices)
    .where(eq(s.marketPrices.companyId, sig.companyId))
    .orderBy(asc(s.marketPrices.tradingDate));

  const companyEvents = await db
    .select({
      id: s.businessEvents.id,
      title: s.businessEvents.title,
      eventDate: s.businessEvents.eventDate,
      stage: s.businessEvents.stage,
      eventType: s.businessEvents.eventType,
    })
    .from(s.businessEvents)
    .where(eq(s.businessEvents.companyId, sig.companyId))
    .orderBy(asc(s.businessEvents.eventDate));

  /* days since the stored snapshot — non-watchlist companies stop refreshing */
  const staleDays = market
    ? Math.max(0, Math.round((Date.now() - Date.parse(`${market.snapshotDate}T00:00:00Z`)) / 86_400_000))
    : null;

  return {
    signal: sig,
    company,
    event,
    goal,
    target,
    mappings,
    evidence,
    snapshots,
    brief: brief ?? null,
    market: market ?? null,
    fundamentals: fundamentals ?? null,
    prices,
    companyEvents,
    staleDays,
  };
}

/* ------------------------------------------------------------------ */
/*  Company detail                                                      */
/* ------------------------------------------------------------------ */

export async function getCompanyDetail(ticker: string) {
  const [company] = await db.select().from(s.companies).where(eq(s.companies.ticker, ticker.toUpperCase()));
  if (!company) return null;
  const [fundamentals] = await db.select().from(s.companyFundamentals).where(eq(s.companyFundamentals.companyId, company.id));
  const [market] = await db.select().from(s.marketSnapshots).where(eq(s.marketSnapshots.companyId, company.id));
  const prices = await db
    .select({ date: s.marketPrices.tradingDate, close: s.marketPrices.close, volume: s.marketPrices.volume })
    .from(s.marketPrices)
    .where(eq(s.marketPrices.companyId, company.id))
    .orderBy(asc(s.marketPrices.tradingDate));

  const events = await db
    .select()
    .from(s.businessEvents)
    .where(eq(s.businessEvents.companyId, company.id))
    .orderBy(asc(s.businessEvents.eventDate));

  const mappings = await db
    .select({
      eventId: s.eventSdgMappings.eventId,
      goalNumber: s.sdgGoals.goalNumber,
      goalColor: s.sdgGoals.color,
      targetCode: s.sdgTargets.targetCode,
      rel: s.eventSdgMappings.relationshipType,
      evidence: s.eventSdgMappings.evidenceScore,
      reasoning: s.eventSdgMappings.reasoning,
    })
    .from(s.eventSdgMappings)
    .innerJoin(s.sdgGoals, eq(s.eventSdgMappings.goalId, s.sdgGoals.id))
    .leftJoin(s.sdgTargets, eq(s.eventSdgMappings.targetId, s.sdgTargets.id))
    .where(
      inArray(
        s.eventSdgMappings.eventId,
        events.length ? events.map((e) => e.id) : [-1],
      ),
    );

  const compsigs = await db
    .select()
    .from(s.signals)
    .where(eq(s.signals.companyId, company.id))
    .orderBy(desc(s.signals.signalStrength));

  /* days since the stored snapshot — non-watchlist companies stop refreshing */
  const staleDays = market
    ? Math.max(0, Math.round((Date.now() - Date.parse(`${market.snapshotDate}T00:00:00Z`)) / 86_400_000))
    : null;

  return { company, fundamentals: fundamentals ?? null, market: market ?? null, prices, events, mappings, compsigs, staleDays };
}

/* ------------------------------------------------------------------ */
/*  Goals                                                               */
/* ------------------------------------------------------------------ */

export async function getGoalSummaries() {
  const goals = await db.select().from(s.sdgGoals).orderBy(asc(s.sdgGoals.goalNumber));
  const targets = await db.select().from(s.sdgTargets).orderBy(asc(s.sdgTargets.targetCode));
  const signals = await getAllSignals();
  return goals.map((g) => {
    const gs = signals.filter((x) => x.goalNumber === g.goalNumber);
    const tickers = Array.from(new Set(gs.map((x) => x.ticker)));
    return {
      ...g,
      targets: targets.filter((t) => t.goalId === g.id),
      signalCount: gs.length,
      companyCount: tickers.length,
      tickers: tickers.slice(0, 4),
      topStrength: gs.length ? Math.max(...gs.map((x) => x.signalStrength)) : 0,
      executing: gs.filter((x) => ["EXECUTING", "CONTRACTED"].includes(x.executionStage)).length,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  2030 Market Regime & Timing Engine                                  */
/* ------------------------------------------------------------------ */

export interface EnginePageData {
  regime: Regime;
  aggregate: AggregateMarket;
  confirmation: ReturnType<typeof scenarioConfirmation2026>;
  companyResults: CompanyEngineResult[];
  deepValueList: (CompanyEngineResult & EngineExtra)[];
  lowNominalList: (CompanyEngineResult & EngineExtra)[];
  matrixCounts: Record<string, Record<string, number>>;
  newsWeighted: {
    id: number;
    ticker: string;
    title: string;
    eventDate: string;
    stage: string;
    weight: number;
    bucket: string;
  }[];
  matrixVerdicts: { ticker: string; col: string; row: string; label: string; strength: number }[];
}

interface EngineExtra {
  lastPrice: number;
  mcapBn: number;
  pc20: number;
  volRatio: number;
  sdgEvidence: number;
  timingMax: number;
  topSignalId: number | null;
  revenueGrowth: number;
  epsGrowth: number;
}

export async function getEngineData(): Promise<EnginePageData> {
  const companies = await db.select().from(s.companies);
  const snapshots = await db.select().from(s.marketSnapshots);
  const fundamentals = await db.select().from(s.companyFundamentals);
  const events = await db.select().from(s.businessEvents);
  const mappings = await db.select().from(s.eventSdgMappings);
  const signalsAll = await db.select().from(s.signals);
  const pricesAll = await db
    .select({
      companyId: s.marketPrices.companyId,
      date: s.marketPrices.tradingDate,
      close: s.marketPrices.close,
      volume: s.marketPrices.volume,
    })
    .from(s.marketPrices)
    .orderBy(asc(s.marketPrices.tradingDate));

  const pricesByCompany = new Map<number, { date: string; close: number; volume: number }[]>();
  for (const p of pricesAll) {
    const arr = pricesByCompany.get(p.companyId) ?? [];
    arr.push({ date: p.date, close: p.close, volume: p.volume });
    pricesByCompany.set(p.companyId, arr);
  }

  const snapBy = new Map(snapshots.map((x) => [x.companyId, x]));
  const fundBy = new Map(fundamentals.map((x) => [x.companyId, x]));
  const evidenceMax = new Map<number, number>();
  for (const m of mappings) {
    const ev = events.find((e) => e.id === m.eventId);
    if (!ev) continue;
    evidenceMax.set(ev.companyId, Math.max(evidenceMax.get(ev.companyId) ?? 0, m.evidenceScore));
  }
  const timingMaxBy = new Map<number, number>();
  const topSignalBy = new Map<number, number>();
  for (const sig of signalsAll.sort((a, b) => b.signalStrength - a.signalStrength)) {
    timingMaxBy.set(sig.companyId, Math.max(timingMaxBy.get(sig.companyId) ?? 0, sig.timingScore));
    if (!topSignalBy.has(sig.companyId)) topSignalBy.set(sig.companyId, sig.id);
  }

  const marketAvgPc20 =
    snapshots.reduce((a, b) => a + b.priceChange20d, 0) / Math.max(1, snapshots.length);

  const cutoff = "2026-04-01";
  const inputs = companies.map((c) => {
    const snap = snapBy.get(c.id)!;
    const fund = fundBy.get(c.id)!;
    const compEvents = events.filter((e) => e.companyId === c.id && e.eventDate >= cutoff);
    const last5 = pricesByCompany.get(c.id)?.slice(-1)[0];
    return {
      ticker: c.ticker,
      lastPrice: last5?.close ?? c.basePrice,
      mcapBn: c.marketCapIdr,
      sector: c.sector,
      prices: pricesByCompany.get(c.id) ?? [],
      pc20: snap?.priceChange20d ?? 0,
      volRatio20d: snap?.volumeRatio20d ?? 1,
      sectorRet20d: snap?.sectorReturn20d ?? 0,
      relativeStrength: snap?.relativeStrength ?? 0,
      revenueGrowth: fund?.revenueGrowth ?? 0,
      epsGrowth: fund?.epsGrowth ?? 0,
      dividendYield: fund?.dividendYield ?? 0,
      events180d: compEvents.length,
      hasExecutingEvent180d: compEvents.some((e) =>
        ["EXECUTING", "CONTRACTED", "OPERATIONAL", "MEASURED"].includes(e.stage),
      ),
      sdgEvidenceMax: evidenceMax.get(c.id) ?? 0,
      timingScoreMax: timingMaxBy.get(c.id) ?? 0,
      latestEventDate:
        events.filter((e) => e.companyId === c.id).sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))[0]
          ?.eventDate ?? null,
      marketAvgPc20,
    };
  });

  const resultsRaw = inputs.map(computeCompanyEngine);

  /* aggregates */
  const drawdowns = resultsRaw.map((r) => r.stats.drawdownPct);
  const volExp = resultsRaw.map((r) => (r.stats.stdevAll > 0 ? r.stats.stdev20 / r.stats.stdevAll : 1));
  const liqs = resultsRaw.map((r) => r.stats.liquidityRatio);
  const aggregate: AggregateMarket = {
    avgPc20: +marketAvgPc20.toFixed(2),
    avgDrawdown: +(drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length).toFixed(1),
    avgVolRatio: +(inputs.reduce((a, b) => a + b.volRatio20d, 0) / inputs.length).toFixed(2),
    avgStress: Math.round(resultsRaw.reduce((a, b) => a + b.stress.total, 0) / resultsRaw.length),
    breadthDown: +(
      snapshots.filter((x) => x.priceChange20d < 0).length / Math.max(1, snapshots.length)
    ).toFixed(2),
    avgLiqRatio: +(liqs.reduce((a, b) => a + b, 0) / liqs.length).toFixed(2),
    avgVolExpansion: +(volExp.reduce((a, b) => a + b, 0) / volExp.length).toFixed(2),
    n: inputs.length,
  };

  const regime = marketRegime(aggregate);
  const confirmation = scenarioConfirmation2026(aggregate);

  const extrasByTicker = new Map<string, EngineExtra>();
  for (const inp of inputs) {
    extrasByTicker.set(inp.ticker, {
      lastPrice: inp.lastPrice,
      mcapBn: inp.mcapBn,
      pc20: inp.pc20,
      volRatio: inp.volRatio20d,
      sdgEvidence: inp.sdgEvidenceMax,
      timingMax: inp.timingScoreMax,
      topSignalId: topSignalBy.get(companies.find((c) => c.ticker === inp.ticker)!.id) ?? null,
      revenueGrowth: inp.revenueGrowth,
      epsGrowth: inp.epsGrowth,
    });
  }

  const companyResults = resultsRaw.map((r) => {
    const inp = inputs.find((x) => x.ticker === r.ticker)!;
    const sigMax = signalsAll.filter((sg) => sg.companyId === companies.find((c) => c.ticker === r.ticker)!.id);
    const timingClassTop = sigMax.sort((a, b) => b.timingScore - a.timingScore)[0]?.timingClass ?? null;
    return { ...r, matrixCol: matrixColFor(timingClassTop) };
  });

  const withExtra = (r: CompanyEngineResult) => ({ ...r, ...extrasByTicker.get(r.ticker)! });
  const ranked = [...companyResults].sort((a, b) => b.deepValue.total - a.deepValue.total);
  const deepValueList = ranked.slice(0, 8).map(withExtra);
  const lowNominalList = companyResults
    .filter((r) => r.lowNominal)
    .sort((a, b) => extrasByTicker.get(a.ticker)!.lastPrice - extrasByTicker.get(b.ticker)!.lastPrice)
    .map(withExtra);

  /* matrix counts */
  const row = matrixRowFor(regime);
  const cols = ["EARLY", "ACTIVE", "CRITICAL"];
  const matrixCounts: Record<string, Record<string, number>> = {};
  for (const rr of Object.keys(TIMING_MATRIX)) {
    matrixCounts[rr] = Object.fromEntries(cols.map((c) => [c, 0]));
  }
  const matrixVerdicts = companyResults.map((r) => {
    matrixCounts[row][r.matrixCol]++;
    const sig = signalsAll.filter((x) => x.companyId === companies.find((c) => c.ticker === r.ticker)!.id);
    return {
      ticker: r.ticker,
      col: r.matrixCol,
      row,
      label: TIMING_MATRIX[row][r.matrixCol],
      strength: sig.sort((a, b) => b.signalStrength - a.signalStrength)[0]?.signalStrength ?? 0,
    };
  });

  const newsWeighted = events
    .sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1))
    .slice(0, 10)
    .map((e) => {
      const w = newsWeight(
        e.eventDate,
        !!e.expectedCompletionDate || ["CONTRACT", "INVESTMENT"].includes(e.eventType),
      );
      const comp = companies.find((c) => c.id === e.companyId)!;
      return {
        id: e.id,
        ticker: comp.ticker,
        title: e.title,
        eventDate: e.eventDate,
        stage: e.stage,
        weight: w.weight,
        bucket: w.bucket,
      };
    });

  return {
    regime,
    aggregate,
    confirmation,
    companyResults,
    deepValueList,
    lowNominalList,
    matrixCounts,
    newsWeighted,
    matrixVerdicts,
  };
}

/** Engine result for one company (company page §25 panel). */
export async function getCompanyEngine(ticker: string) {
  const data = await getEngineData();
  const r = data.companyResults.find((x) => x.ticker === ticker.toUpperCase());
  if (!r) return null;
  const input = data.matrixVerdicts.find((x) => x.ticker === r.ticker);
  const extras = (data.deepValueList.find((x) => x.ticker === r.ticker) ??
    data.lowNominalList.find((x) => x.ticker === r.ticker)) as EngineExtra | undefined;
  return {
    engine: r,
    regime: data.regime,
    matrixVerdict: input?.label ?? "WATCH",
    matrixRow: input?.row ?? "EARLY",
    confirmation: data.confirmation,
    extras: extras ?? null,
  };
}


/* ------------------------------------------------------------------ */
/*  Market Intelligence layer (70% Sectors / 20% evidence / 10% SDG)    */
/* ------------------------------------------------------------------ */

export interface CompanyMarketIntel {
  totalScore: number;
  marketCondition: string;
  methodologyVersion: string;
  sectorsSharePct: number;
  sectors: { label: string; value: number; max: number }[];
  evidence: { label: string; value: number; max: number }[];
  sdg: { label: string; value: number; max: number }[];
  subtotals: { sectors: number; evidence: number; sdg: number };
  priceFloorBand: string;
  araLabel: string;
  arbLabel: string;
}

export async function getMarketIntel(ticker: string): Promise<CompanyMarketIntel | null> {
  const [row] = await db
    .select({ mi: s.marketIntelScores, id: s.companies.id })
    .from(s.companies)
    .innerJoin(s.marketIntelScores, eq(s.marketIntelScores.companyId, s.companies.id))
    .where(eq(s.companies.ticker, ticker.toUpperCase()));
  if (!row) return null;
  const m = row.mi;
  return {
    totalScore: m.totalScore,
    marketCondition: m.marketCondition,
    methodologyVersion: m.methodologyVersion,
    sectorsSharePct: Math.round((m.sectorsSubtotal / 70) * 100),
    sectors: [
      { label: "priceDislocation", value: m.priceDislocation, max: 15 },
      { label: "volumeAnomaly", value: m.volumeAnomaly, max: 15 },
      { label: "relativePerformance", value: m.relativePerformance, max: 15 },
      { label: "fundamentalContext", value: m.fundamentalContext, max: 15 },
      { label: "marketIndustryContext", value: m.marketIndustryContext, max: 10 },
    ],
    evidence: [
      { label: "businessEvent", value: m.businessEventPts, max: 10 },
      { label: "sourceQuality", value: m.sourceQuality, max: 5 },
      { label: "eventMateriality", value: m.eventMateriality, max: 5 },
    ],
    sdg: [
      { label: "sdgTargetRelevance", value: m.sdgTargetRelevance, max: 5 },
      { label: "executionTiming", value: m.executionTiming2030, max: 5 },
    ],
    subtotals: { sectors: m.sectorsSubtotal, evidence: m.evidenceSubtotal, sdg: m.sdgSubtotal },
    priceFloorBand: m.priceFloorBand,
    araLabel: m.araLabel,
    arbLabel: m.arbLabel,
  };
}

/** WHY NOW? — the signature feature. */
export async function getWhyNow(ticker: string) {
  const [company] = await db.select().from(s.companies).where(eq(s.companies.ticker, ticker.toUpperCase()));
  if (!company) return null;
  const events = await db
    .select()
    .from(s.businessEvents)
    .where(eq(s.businessEvents.companyId, company.id))
    .orderBy(asc(s.businessEvents.eventDate));
  const [fund] = await db.select().from(s.companyFundamentals).where(eq(s.companyFundamentals.companyId, company.id));
  const [snap] = await db.select().from(s.marketSnapshots).where(eq(s.marketSnapshots.companyId, company.id));
  const prices = await db
    .select({ close: s.marketPrices.close })
    .from(s.marketPrices)
    .where(eq(s.marketPrices.companyId, company.id))
    .orderBy(asc(s.marketPrices.tradingDate));
  const closes = prices.map((x) => x.close);
  const drawdown = closes.length
    ? +(((closes[closes.length - 1] - Math.max(...closes)) / Math.max(...closes)) * 100).toFixed(1)
    : 0;

  const latest = events[events.length - 1] ?? null;
  const prev = events.length > 1 ? events[events.length - 2] : null;
  const stageIdx = latest ? STAGE_META[latest.stage as Stage].idx : 0;
  const eventAgeDays = latest
    ? Math.round((Date.parse("2026-09-28") - Date.parse(latest.eventDate)) / 86_400_000)
    : null;
  const transitionDays =
    latest && prev
      ? Math.round((Date.parse(latest.eventDate) - Date.parse(prev.eventDate)) / 86_400_000)
      : null;
  const monthsTo2030 = latest?.expectedCompletionDate
    ? Math.round(
        (Date.parse("2030-12-31") - Date.parse(latest.expectedCompletionDate)) / 86_400_000 / 30.44,
      )
    : null;

  const items = [
    { key: "event", met: !!latest && eventAgeDays !== null && eventAgeDays <= 120 },
    {
      key: "transition",
      met: transitionDays !== null && transitionDays <= 180 && stageIdx >= 3,
    },
    {
      key: drawdown <= -12 ? "dislocation" : "volume",
      met: (snap?.volumeRatio20d ?? 0) >= 1.3 || drawdown <= -12,
    },
    {
      key: "relative",
      met: (snap?.relativeStrength ?? -99) > 0 || ((fund?.revenueGrowth ?? -99) > 0 && (fund?.epsGrowth ?? -99) > -2),
    },
    { key: "runway", met: monthsTo2030 !== null && monthsTo2030 >= 6 },
  ];
  return { items, stageIdx, drawdown, monthsTo2030, eventAgeDays, transitionDays };
}

/** WHY NOT? — negative explainability. */
export async function getWhyNot(ticker: string) {
  const [company] = await db.select().from(s.companies).where(eq(s.companies.ticker, ticker.toUpperCase()));
  if (!company) return null;
  const events = await db.select().from(s.businessEvents).where(eq(s.businessEvents.companyId, company.id));
  const [fund] = await db.select().from(s.companyFundamentals).where(eq(s.companyFundamentals.companyId, company.id));
  const [snap] = await db.select().from(s.marketSnapshots).where(eq(s.marketSnapshots.companyId, company.id));
  const prices = await db
    .select({ close: s.marketPrices.close })
    .from(s.marketPrices)
    .where(eq(s.marketPrices.companyId, company.id))
    .orderBy(asc(s.marketPrices.tradingDate));
  const closes = prices.map((x) => x.close);
  const drawdown = closes.length
    ? +(((closes[closes.length - 1] - Math.max(...closes)) / Math.max(...closes)) * 100).toFixed(1)
    : 0;

  const best = events.slice().sort((a, b) => b.stage.localeCompare(a.stage))[0] ?? null;
  const stageIdx = best ? STAGE_META[best.stage as Stage].idx : 0;
  const evidenceMax = await db
    .select({ e: sql<number>`coalesce(max(${s.eventSdgMappings.evidenceScore}), 0)::int` })
    .from(s.eventSdgMappings)
    .where(
      inArray(
        s.eventSdgMappings.eventId,
        events.length ? events.map((x) => x.id) : [-1],
      ),
    );

  return [
    { key: "sdg", met: (evidenceMax[0]?.e ?? 0) >= 60 },
    { key: "revenue", met: (fund?.revenueGrowth ?? -99) > 0 },
    { key: "event", met: events.length > 0 && stageIdx >= 2 },
    { key: "market", met: (snap?.volumeRatio20d ?? 0) >= 1.25 || drawdown <= -12 },
    { key: "relative", met: (snap?.relativeStrength ?? -99) > 0 },
    { key: "transition", met: stageIdx >= 3 },
  ];
}

/* ------------------------------------------------------------------ */
/*  Picker                                                              */
/* ------------------------------------------------------------------ */

export interface PickerFilters {
  goal?: number;
  target?: string;
  stages?: string[];
  timing?: string[];
  sectors?: string[];
  minEvidence?: number;
  minTiming?: number;
  minStrength?: number;
}

export interface PickerParams extends PickerFilters {
  rightTime?: boolean;
  condition?: string;
  minSignal?: number;
}

export async function runPicker(p: PickerParams) {
  let rows = await getAllSignals();

  /* market-intelligence layer (70% Sectors-derived) */
  const miRows = await db
    .select({ ticker: s.companies.ticker, total: s.marketIntelScores.totalScore, cond: s.marketIntelScores.marketCondition })
    .from(s.marketIntelScores)
    .innerJoin(s.companies, eq(s.marketIntelScores.companyId, s.companies.id));
  const miByTicker = new Map(miRows.map((m) => [m.ticker, m]));
  const rowsWithMi = rows.map((r) => ({
    ...r,
    miScore: miByTicker.get(r.ticker)?.total ?? null,
    miCondition: miByTicker.get(r.ticker)?.cond ?? null,
  }));
  rows = rowsWithMi as typeof rows;

  if (p.goal) rows = rows.filter((r) => r.goalNumber === p.goal);
  if (p.target) rows = rows.filter((r) => r.targetCode === p.target);
  if (p.stages?.length) rows = rows.filter((r) => p.stages!.includes(r.executionStage));
  if (p.timing?.length) rows = rows.filter((r) => p.timing!.includes(r.timingClass));
  if (p.sectors?.length) rows = rows.filter((r) => p.sectors!.includes(r.sector));
  if (p.minEvidence) rows = rows.filter((r) => r.sdgEvidenceScore >= p.minEvidence!);
  if (p.minTiming) rows = rows.filter((r) => r.timingScore >= p.minTiming!);
  if (p.condition) rows = rows.filter((r) => (r as unknown as { miCondition: string | null }).miCondition === p.condition);
  if (p.minSignal) rows = rows.filter((r) => (r as unknown as { miScore: number | null }).miScore !== null && (r as unknown as { miScore: number | null }).miScore! >= p.minSignal!);

  /* one card per company: best composite */
  const byCompany = new Map<string, SignalRow[]>();
  for (const r of rows) {
    const arr = byCompany.get(r.ticker) ?? [];
    arr.push(r);
    byCompany.set(r.ticker, arr);
  }

  let results = Array.from(byCompany.values()).map((arr) => {
    const best = p.rightTime
      ? [...arr].sort((a, b) => b.timingScore * 0.6 + b.sdgEvidenceScore * 0.4 - (a.timingScore * 0.6 + a.sdgEvidenceScore * 0.4))[0]
      : arr.sort((a, b) => b.signalStrength - a.signalStrength)[0];
    return { best, count: arr.length };
  });

  if (p.minStrength) results = results.filter((r) => r.best.signalStrength >= p.minStrength!);

  results.sort((a, b) =>
    p.rightTime
      ? b.best.timingScore * 0.6 + b.best.sdgEvidenceScore * 0.4 - (a.best.timingScore * 0.6 + a.best.sdgEvidenceScore * 0.4)
      : b.best.signalStrength - a.best.signalStrength,
  );

  const flat = results.map((r) => r.best);
  const miOf = (x: typeof flat[number]) => miByTicker.get(x.ticker);
  const summary = {
    marketConfirmed: flat.filter((x) => miOf(x)?.cond === "CONFIRMATION").length,
    companies: flat.length,
    highEvidence: flat.filter((x) => x.sdgEvidenceScore >= 85).length,
    executing: flat.filter((x) => ["EXECUTING", "CONTRACTED", "OPERATIONAL", "MEASURED"].includes(x.executionStage)).length,
    deadlineSensitive: flat.filter((x) => ["CRITICAL", "LATE"].includes(x.timingClass)).length,
    activeWindow: flat.filter((x) => x.timingClass === "ACTIVE").length,
  };

  const enriched = results.map((r) => ({
    best: r.best,
    count: r.count,
    miScore: miByTicker.get(r.best.ticker)?.total ?? null,
    miCondition: miByTicker.get(r.best.ticker)?.cond ?? null,
  }));

  return { results: enriched, summary };
}

/* ------------------------------------------------------------------ */
/*  Gann 432 Reversal Window                                            */
/*                                                                     */
/*  Market anchor (index level) + per-ticker confirmation layer.       */
/*  See src/lib/gann.ts for why the zero point is detected rather      */
/*  than hard-coded, and why Fibonacci levels are derived.             */
/* ------------------------------------------------------------------ */

export interface GannWindowData {
  indexCode: string;
  /** latest stored index bar */
  latest: PricePoint;
  bars: number;
  /** detected zero point — the anchor every window is counted from */
  zeroPoint: PricePoint;
  zeroPointBarsSearched: number;
  /** true when the low sits too close to the search-window edge to trust */
  zeroPointEdgeConstrained: boolean;
  swingHigh: PricePoint;
  windows: GannWindow[];
  focus: GannWindow | null;
  fib: ReturnType<typeof fibLevels>;
  nearestFib: ReturnType<typeof nearestFib>;
  squaring: ReturnType<typeof priceTimeSquaring>;
  seasonal: ReturnType<typeof seasonalDates>;
  /** chart series, thinned for the sparkline (zero-point bar is retained) */
  series: PricePoint[];
  /** 0..100 position of the zero point within `series`, or null if absent */
  zeroPointX: number | null;
  syncedAt: string | null;
}

/**
 * Market-level half of the module.
 *
 * Window day-counts are measured against TODAY so "26 days away" stays
 * truthful as data goes stale, while swing detection is anchored to the newest
 * stored bar so the detected low always sits inside real data.
 */
export async function getGannWindow(): Promise<GannWindowData | null> {
  const indexCode = "IHSG";
  const rows = await db
    .select({ date: s.indexPrices.tradingDate, close: s.indexPrices.close })
    .from(s.indexPrices)
    .where(eq(s.indexPrices.indexCode, indexCode))
    .orderBy(asc(s.indexPrices.tradingDate));

  if (rows.length === 0) return null;
  const series: PricePoint[] = rows.map((r) => ({ date: r.date, close: r.close }));
  const latest = series[series.length - 1];

  const today = new Date().toISOString().slice(0, 10);
  const detected = detectSwingLow(series, latest.date, { minBarsEachSide: 3 });
  if (!detected) return null;

  const high = detectSwingHigh(series, latest.date, { minBarsEachSide: 3 }) ?? latest;
  const zeroPoint: PricePoint = { date: detected.date, close: detected.close };

  const windows = gannWindowDates(zeroPoint.date, undefined, today);
  const fib = fibLevels(zeroPoint.close, high.close, latest.close);
  const squaring = priceTimeSquaring(zeroPoint.close, [72, 144], latest.close);

  const [state] = await db
    .select({ lastSyncAt: s.syncState.lastSyncAt })
    .from(s.syncState)
    .where(eq(s.syncState.source, "sectors.index"))
    .limit(1);

  /* Thin the series so the sparkline stays light on the wire. The zero-point
     bar is force-retained: looking it up by index after the fact would fail
     whenever thinning skipped it, silently dropping the marker from the chart. */
  const maxPoints = 180;
  const stride = Math.max(1, Math.ceil(series.length / maxPoints));
  const zeroFullIdx = series.findIndex((p) => p.date === zeroPoint.date);
  const keep = new Set<number>();
  for (let i = 0; i < series.length; i += stride) keep.add(i);
  keep.add(series.length - 1);
  if (zeroFullIdx >= 0) keep.add(zeroFullIdx);
  const thinned = series.filter((_, i) => keep.has(i));
  const zeroThinnedIdx = zeroFullIdx >= 0 ? thinned.findIndex((p) => p.date === zeroPoint.date) : -1;

  return {
    indexCode,
    latest,
    bars: series.length,
    zeroPoint,
    zeroPointBarsSearched: detected.barsSearched,
    zeroPointEdgeConstrained: detected.edgeConstrained,
    swingHigh: high,
    windows,
    focus: focusWindow(windows),
    fib,
    nearestFib: nearestFib(fib, latest.close),
    squaring,
    seasonal: seasonalDates(today, Number(today.slice(0, 4))),
    series: thinned,
    zeroPointX:
      zeroThinnedIdx >= 0 && thinned.length > 1
        ? +((zeroThinnedIdx / (thinned.length - 1)) * 100).toFixed(3)
        : null,
    syncedAt: state?.lastSyncAt ? state.lastSyncAt.toISOString() : null,
  };
}

export interface GannTickerRow {
  ticker: string;
  companyName: string;
  sector: string;
  close: number;
  pc20: number;
  volumeRatio: number;
  rsi: number | null;
  divergence: "BULLISH" | "BEARISH" | null;
  /** net foreign flow in IDR over the trailing 20 trading days; null when --flow
   * has never been run for this ticker */
  netForeignFlowIdr: number | null;
  goalNumber: number | null;
  goalColor: string | null;
  goalShortTitle: string | null;
  sdgEvidence: number;
  /** % from this ticker's own 0.618 retracement level */
  fibDistancePct: number;
  confluence: ReturnType<typeof confluenceScore>;
}

/**
 * Per-ticker confirmation layer.
 *
 * NOTE ON FIBONACCI: the market anchor derives its ladder from the index, but an
 * index level says nothing about a stock price, so each ticker computes its own
 * 0.618 retracement from its own trailing range. With ~90 days of stored history
 * these are range levels, not multi-year swings, and are labelled as such in
 * the UI rather than dressed up as Ganched swings.
 */
export async function getGannTickers(limit = 34): Promise<GannTickerRow[]> {
  const window = await getGannWindow();
  const companies = await db.select().from(s.companies);
  const snapshots = await db.select().from(s.marketSnapshots);
  const mappings = await db
    .select({
      companyId: s.businessEvents.companyId,
      goalNumber: s.sdgGoals.goalNumber,
      goalColor: s.sdgGoals.color,
      goalShortTitle: s.sdgGoals.shortTitle,
      evidence: s.eventSdgMappings.evidenceScore,
    })
    .from(s.eventSdgMappings)
    .innerJoin(s.businessEvents, eq(s.eventSdgMappings.eventId, s.businessEvents.id))
    .innerJoin(s.sdgGoals, eq(s.eventSdgMappings.goalId, s.sdgGoals.id));

  const snapBy = new Map(snapshots.map((x) => [x.companyId, x]));

  /* strongest SDG mapping per company */
  const bestMapping = new Map<number, (typeof mappings)[number]>();
  for (const m of mappings) {
    const cur = bestMapping.get(m.companyId);
    if (!cur || m.evidence > cur.evidence) bestMapping.set(m.companyId, m);
  }

  /* Net foreign flow over the TRAILING 20 TRADING DAYS, not every stored row.
     The sync pulls a rolling 90-day window, so an unbounded sum would mix in
     flow from months earlier and stop responding to current positioning. */
  const recentFlowDates = db
    .selectDistinct({ date: s.foreignFlow.tradingDate })
    .from(s.foreignFlow)
    .orderBy(desc(s.foreignFlow.tradingDate))
    .limit(20);

  const flowRows = await db
    .select({
      companyId: s.foreignFlow.companyId,
      net: sql<number>`coalesce(sum(${s.foreignFlow.netForeignInflow}), 0)::float8`,
    })
    .from(s.foreignFlow)
    .where(inArray(s.foreignFlow.tradingDate, recentFlowDates))
    .groupBy(s.foreignFlow.companyId);
  const flowBy = new Map(flowRows.map((r) => [r.companyId, r.net]));

  /* close series per company */
  const priceRows = await db
    .select({
      companyId: s.marketPrices.companyId,
      date: s.marketPrices.tradingDate,
      close: s.marketPrices.close,
      volume: s.marketPrices.volume,
    })
    .from(s.marketPrices)
    .orderBy(asc(s.marketPrices.tradingDate));

  const byCompany = new Map<number, { date: string; close: number; volume: number }[]>();
  for (const p of priceRows) {
    const arr = byCompany.get(p.companyId) ?? [];
    arr.push({ date: p.date, close: p.close, volume: p.volume });
    byCompany.set(p.companyId, arr);
  }

  const daysToWindow = window?.focus?.daysAway ?? 0;
  const rows: GannTickerRow[] = [];

  for (const c of companies) {
    const prices = byCompany.get(c.id);
    if (!prices || prices.length < 31) continue; // need 30-day change + RSI pivots

    const closes = prices.map((p) => p.close);
    const close = closes[closes.length - 1];
    const snap = snapBy.get(c.id);

    const rsiPoints = rsiWithDates(
      prices.map((p) => ({ date: p.date, close: p.close })),
      14,
    );
    const divergence = rsiDivergence(rsiPoints);
    const rsiValue = rsiPoints[rsiPoints.length - 1].rsi;

    const rangeLow = Math.min(...closes);
    const rangeHigh = Math.max(...closes);
    const tickerFib = fibLevels(rangeLow, rangeHigh, close);
    const pivotLevel = tickerFib.find((f) => f.ratio === 0.618)!;

    const mapping = bestMapping.get(c.id);
    const net = flowBy.get(c.id) ?? null;

    const input: ConfluenceInput = {
      daysToWindow,
      toleranceDays: 15,
      fibDistancePct: pivotLevel.distancePct,
      rsiValue,
      divergence: divergence.kind,
      volumeRatio: snap?.volumeRatio20d ?? 1,
      netForeignFlowIdr: net,
    };

    rows.push({
      ticker: c.ticker,
      companyName: c.companyName,
      sector: c.sector,
      close,
      pc20: snap?.priceChange20d ?? 0,
      volumeRatio: snap?.volumeRatio20d ?? 1,
      rsi: rsiValue,
      divergence: divergence.kind,
      netForeignFlowIdr: net,
      goalNumber: mapping?.goalNumber ?? null,
      goalColor: mapping?.goalColor ?? null,
      goalShortTitle: mapping?.goalShortTitle ?? null,
      sdgEvidence: mapping?.evidence ?? 0,
      fibDistancePct: pivotLevel.distancePct,
      confluence: confluenceScore(input),
    });
  }

  rows.sort((a, b) => b.confluence.score - a.confluence.score);
  return rows.slice(0, limit);
}

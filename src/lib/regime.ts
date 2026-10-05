/**
 * 2030 Market Regime & Timing Engine — deterministic implementation.
 * The internal 2026–2030 macro scenario is a CONTEXT LAYER, never a prediction.
 * Actual data always outranks scenario. All labels are research labels — never
 * buy/sell recommendations.
 */

export const ENGINE_SYSTEM_DATE = "2026-09-28";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PriceBar {
  date: string;
  close: number;
  volume: number;
}

export interface EngineCompanyInput {
  ticker: string;
  lastPrice: number;
  mcapBn: number; // billions IDR
  sector: string;
  prices: PriceBar[];
  pc20: number;
  volRatio20d: number;
  sectorRet20d: number;
  relativeStrength: number;
  revenueGrowth: number;
  epsGrowth: number;
  dividendYield: number;
  events180d: number;
  hasExecutingEvent180d: boolean;
  sdgEvidenceMax: number; // 0 when none
  timingScoreMax: number; // 0 when none
  latestEventDate: string | null;
  /** universe aggregates */
  marketAvgPc20: number;
}

export interface ScoreParts {
  label: string;
  points: number;
  max: number;
}

/* ------------------------------------------------------------------ */
/*  §10 — Price floor / market microstructure (time-versioned config)  */
/* ------------------------------------------------------------------ */

export interface PriceFloorBand {
  band: string;
  min: number;
  max: number | null;
  ara: string;
  arb: string;
  araPct: number | null;
  arbPct: number | null;
}

export interface PriceFloorVersion {
  effectiveFrom: string;
  note: string;
  bands: PriceFloorBand[];
}

export const PRICE_FLOOR_CONFIG: PriceFloorVersion[] = [
  {
    effectiveFrom: "2026-09-28",
    note: "Time-versioned configuration — stored, not hard-coded into scoring. ARA/ARB describe daily price-movement mechanics and downside asymmetry only.",
    bands: [
      { band: "Rp1–Rp10", min: 1, max: 10, ara: "Rp1", arb: "Rp1", araPct: null, arbPct: null },
      { band: ">Rp10–Rp200", min: 10, max: 200, ara: "35%", arb: "15%", araPct: 0.35, arbPct: -0.15 },
      { band: ">Rp200–Rp5,000", min: 200, max: 5000, ara: "25%", arb: "15%", araPct: 0.25, arbPct: -0.15 },
      { band: ">Rp5,000", min: 5000, max: null, ara: "20%", arb: "15%", araPct: 0.2, arbPct: -0.15 },
    ],
  },
  {
    effectiveFrom: "2027-01-01",
    note: "Symmetric auto-rejection bands from 1 January 2027 (configuration version 2).",
    bands: [
      { band: "Rp1–Rp10", min: 1, max: 10, ara: "Rp1", arb: "Rp1", araPct: null, arbPct: null },
      { band: ">Rp10–Rp200", min: 10, max: 200, ara: "35%", arb: "35%", araPct: 0.35, arbPct: -0.35 },
      { band: ">Rp200–Rp5,000", min: 200, max: 5000, ara: "25%", arb: "25%", araPct: 0.25, arbPct: -0.25 },
      { band: ">Rp5,000", min: 5000, max: null, ara: "20%", arb: "20%", araPct: 0.2, arbPct: -0.2 },
    ],
  },
];

export function priceFloorVersionFor(dateIso: string): PriceFloorVersion {
  let chosen = PRICE_FLOOR_CONFIG[0];
  for (const v of PRICE_FLOOR_CONFIG) if (v.effectiveFrom <= dateIso) chosen = v;
  return chosen;
}

export function priceFloorBandFor(price: number, dateIso: string): PriceFloorBand {
  const v = priceFloorVersionFor(dateIso);
  const band = v.bands.find((b) => price >= b.min && (b.max === null ? true : price <= b.max));
  return band ?? v.bands[v.bands.length - 1];
}

/* ------------------------------------------------------------------ */
/*  Series statistics                                                  */
/* ------------------------------------------------------------------ */

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export interface SeriesStats {
  drawdownPct: number; // % below trailing high (≤0)
  highClose: number;
  stdev20: number;
  stdevAll: number;
  liquidityRatio: number; // avg vol last 20 vs baseline
  pcFromHigh: number;
}

export function seriesStats(prices: PriceBar[]): SeriesStats {
  const closes = prices.map((p) => p.close);
  const highClose = Math.max(...closes);
  const last = closes[closes.length - 1];
  const drawdownPct = +(((last - highClose) / highClose) * 100).toFixed(1);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const stdev20 = rets.length > 21 ? stdev(rets.slice(-20)) : stdev(rets);
  const stdevAll = stdev(rets);
  const vols = prices.map((p) => p.volume);
  const recent = vols.slice(-20);
  const base = vols.slice(0, Math.max(20, vols.length - 20));
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const liquidityRatio = +(avg(recent) / Math.max(1, avg(base))).toFixed(2);
  return { drawdownPct, highClose, stdev20, stdevAll, liquidityRatio, pcFromHigh: drawdownPct };
}

/* ------------------------------------------------------------------ */
/*  §12 — Market Stress Score (per company)                            */
/* ------------------------------------------------------------------ */

export function marketStressScore(c: EngineCompanyInput, s: SeriesStats): { total: number; parts: ScoreParts[] } {
  const dd = s.drawdownPct; // ≤ 0
  const pDraw = Math.min(25, Math.max(0, (-dd / 45) * 25));
  const pVol = Math.min(20, Math.max(0, ((c.volRatio20d - 1) / 2) * 20));
  const pSector = Math.min(15, Math.max(0, (Math.min(0, c.sectorRet20d) / -20) * 15));
  const pMarket = Math.min(15, Math.max(0, (Math.min(0, c.marketAvgPc20) / -18) * 15));
  const pLiq = Math.min(15, Math.max(0, ((0.85 - s.liquidityRatio) / 0.45) * 15));
  const volExpansion = s.stdevAll > 0 ? s.stdev20 / s.stdevAll : 1;
  const pVolExp = Math.min(10, Math.max(0, ((volExpansion - 1.1) / 0.55) * 10));
  const parts: ScoreParts[] = [
    { label: "Price drawdown", points: +pDraw.toFixed(1), max: 25 },
    { label: "Volume shock", points: +pVol.toFixed(1), max: 20 },
    { label: "Sector weakness", points: +pSector.toFixed(1), max: 15 },
    { label: "Market weakness", points: +pMarket.toFixed(1), max: 15 },
    { label: "Liquidity deterioration", points: +pLiq.toFixed(1), max: 15 },
    { label: "Volatility expansion", points: +pVolExp.toFixed(1), max: 10 },
  ];
  const total = Math.round(parts.reduce((a, b) => a + b.points, 0));
  return { total, parts };
}

export function stressBand(total: number): "NORMAL" | "ELEVATED" | "STRESS" | "HIGH_STRESS" | "EXTREME_STRESS" {
  if (total >= 85) return "EXTREME_STRESS";
  if (total >= 70) return "HIGH_STRESS";
  if (total >= 50) return "STRESS";
  if (total >= 30) return "ELEVATED";
  return "NORMAL";
}

/* ------------------------------------------------------------------ */
/*  §13 — Fundamental Resilience Score                                 */
/* ------------------------------------------------------------------ */

const SECTOR_CASH_PROXY: Record<string, number> = {
  Financials: 15,
  Healthcare: 13,
  Technology: 12,
  "Consumer Non-Cyclicals": 13,
  Infrastructure: 10,
  Energy: 11,
  "Basic Materials": 9,
  Industrials: 9,
  "Properties & Real Estate": 8,
  "Consumer Cyclicals": 9,
  "Transportation & Logistic": 8,
};

export function resilienceScore(c: EngineCompanyInput): { total: number; parts: ScoreParts[] } {
  const mapGrowth = (g: number, lo: number, hi: number, max: number) =>
    Math.min(max, Math.max(0, ((g - lo) / (hi - lo)) * max));
  const pRev = mapGrowth(c.revenueGrowth, -8, 18, 20);
  const pEps = mapGrowth(c.epsGrowth, -8, 22, 20);
  const bothPos = c.revenueGrowth > 0 && c.epsGrowth > 0;
  const pProfStab = Math.min(20, Math.max(0, (c.dividendYield / 5) * 14 + (bothPos ? 6 : 0)));
  const mcapT = c.mcapBn / 1000; // trillions IDR
  const pBalance = mcapT >= 500 ? 15 : mcapT >= 100 ? 13 : mcapT >= 30 ? 11 : mcapT >= 10 ? 8 : 5;
  const pCash = SECTOR_CASH_PROXY[c.sector] ?? 9;
  const pBiz = c.hasExecutingEvent180d ? 10 : c.events180d >= 2 ? 8 : c.events180d >= 1 ? 5 : 0;
  const parts: ScoreParts[] = [
    { label: "Revenue trend", points: +pRev.toFixed(1), max: 20 },
    { label: "EPS trend", points: +pEps.toFixed(1), max: 20 },
    { label: "Profitability stability", points: +pProfStab.toFixed(1), max: 20 },
    { label: "Balance-sheet context", points: pBalance, max: 15 },
    { label: "Cash / operating context", points: pCash, max: 15 },
    { label: "Business activity", points: pBiz, max: 10 },
  ];
  const total = Math.round(parts.reduce((a, b) => a + b.points, 0));
  return { total, parts };
}

/* ------------------------------------------------------------------ */
/*  §14 — Deep-Value Confluence                                        */
/* ------------------------------------------------------------------ */

export interface DeepValueResult {
  total: number;
  parts: ScoreParts[];
  qualifies: boolean;
  missing: string[]; // dimension codes A..F that fail
}

export function deepValueConfluence(
  c: EngineCompanyInput,
  s: SeriesStats,
  stress: { total: number },
  resilience: { total: number },
): DeepValueResult {
  const pStress = (stress.total / 100) * 25;
  const pRes = (resilience.total / 100) * 25;
  const disl = -s.drawdownPct; // ≥ 0
  const pDisl = Math.min(20, Math.max(0, (disl / 45) * 20));
  const pLiq = Math.min(10, Math.max(0, ((c.volRatio20d - 1) / 1.4) * 10));
  const recency = c.latestEventDate ? weightForEventAge(ageDays(c.latestEventDate)) : 0;
  const pEvent = c.latestEventDate ? 4 + recency * 6 : 0;
  const pSdg = (Math.min(100, c.sdgEvidenceMax) / 100) * 5;
  const pTiming = (Math.min(100, c.timingScoreMax) / 100) * 5;

  const parts: ScoreParts[] = [
    { label: "Market stress", points: +pStress.toFixed(1), max: 25 },
    { label: "Fundamental resilience", points: +pRes.toFixed(1), max: 25 },
    { label: "Price dislocation", points: +pDisl.toFixed(1), max: 20 },
    { label: "Liquidity evidence", points: +pLiq.toFixed(1), max: 10 },
    { label: "Business event", points: +pEvent.toFixed(1), max: 10 },
    { label: "SDG execution evidence", points: +pSdg.toFixed(1), max: 5 },
    { label: "2030 timing", points: +pTiming.toFixed(1), max: 5 },
  ];
  const total = Math.round(parts.reduce((a, b) => a + b.points, 0));

  /* §9 — required dimensions A–F */
  const dimA = pDisl >= 4; // ≥ ~9% dislocation
  const dimB = resilience.total >= 60;
  const dimC = c.volRatio20d >= 1.1;
  const dimD = disl >= 8; // historical dislocation context
  const dimE = c.latestEventDate !== null;
  const dimF = c.revenueGrowth > -5 && c.epsGrowth > -5; // no critical fundamental break
  const missing = [
    ...(dimA ? [] : ["A"]),
    ...(dimB ? [] : ["B"]),
    ...(dimC ? [] : ["C"]),
    ...(dimD ? [] : ["D"]),
    ...(dimE ? [] : ["E"]),
    ...(dimF ? [] : ["F"]),
  ];
  const qualifies = total >= 55 && dimA && dimB && dimC && dimD && dimE && dimF;
  return { total, parts, qualifies, missing };
}

/* ------------------------------------------------------------------ */
/*  §19 — time-weighted news                                           */
/* ------------------------------------------------------------------ */

export function ageDays(iso: string): number {
  const ms = Date.parse(`${ENGINE_SYSTEM_DATE}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export type NewsBucket = "FULL" | "HIGH" | "REDUCED" | "HISTORICAL" | "ARCHIVE";

export function newsWeight(iso: string, longDuration: boolean): { weight: number; bucket: NewsBucket } {
  const d = ageDays(iso);
  if (d <= 7) return { weight: 1, bucket: "FULL" };
  if (d <= 30) return { weight: 0.85, bucket: "HIGH" };
  if (d <= 90) return { weight: 0.6, bucket: "REDUCED" };
  if (d <= 180) return { weight: longDuration ? 0.5 : 0.35, bucket: "HISTORICAL" };
  return { weight: longDuration ? 0.3 : 0.15, bucket: "ARCHIVE" };
}

function weightForEventAge(days: number): number {
  if (days <= 30) return 1;
  if (days <= 90) return 0.7;
  if (days <= 180) return 0.5;
  return 0.3;
}

/* ------------------------------------------------------------------ */
/*  §21/§22 — Scenario confirmation + market regime (aggregate)        */
/* ------------------------------------------------------------------ */

export interface AggregateMarket {
  avgPc20: number;
  avgDrawdown: number;
  avgVolRatio: number;
  avgStress: number;
  breadthDown: number; // % of universe with pc20 < 0
  avgLiqRatio: number;
  avgVolExpansion: number;
  n: number;
}

export type Regime =
  | "NORMAL"
  | "EARLY_STRESS"
  | "STRESS"
  | "CAPITULATION"
  | "STABILIZATION"
  | "RECOVERY"
  | "RE_RATING"
  | "LATE_CYCLE";

export function marketRegime(a: AggregateMarket): Regime {
  if (a.avgStress >= 65 || (a.breadthDown >= 0.85 && a.avgDrawdown <= -35)) return "CAPITULATION";
  if (a.avgStress >= 48 || (a.breadthDown >= 0.65 && a.avgPc20 <= -6)) return "STRESS";
  if (a.avgStress >= 34 || (a.breadthDown >= 0.55 && a.avgPc20 <= -3)) return "EARLY_STRESS";
  if (a.avgStress >= 26 && a.avgPc20 < 0) return "STABILIZATION";
  if (a.breadthDown <= 0.35 && a.avgPc20 > 2 && a.avgVolRatio >= 1.15) return "RECOVERY";
  if (a.breadthDown <= 0.3 && a.avgPc20 > 4) return "RE_RATING";
  if (a.breadthDown <= 0.45 && a.avgPc20 > 0.5) return "LATE_CYCLE";
  return "NORMAL";
}

export interface ConfirmationResult {
  score: number; // 0..100
  label: "NOT_CONFIRMED" | "PARTIALLY_CONFIRMED" | "SUPPORTED" | "STRONGLY_SUPPORTED";
  indicators: { name: string; expected: string; actual: string; points: number; max: number }[];
}

/** 2026 scenario: STRESS / PRICE DISCOVERY — tested against actual seeded data. */
export function scenarioConfirmation2026(a: AggregateMarket): ConfirmationResult {
  const rows = [
    {
      name: "Broad drawdowns",
      expected: "Universe-wide drawdown beyond −15%",
      actual: `avg drawdown ${a.avgDrawdown.toFixed(1)}%`,
      max: 25,
      pts: Math.min(25, Math.max(0, (-a.avgDrawdown / 20) * 25)),
    },
    {
      name: "Breadth of decline",
      expected: ">60% of universe negative over 20D",
      actual: `${Math.round(a.breadthDown * 100)}% down over 20D`,
      max: 25,
      pts: Math.min(25, Math.max(0, ((a.breadthDown - 0.3) / 0.4) * 25)),
    },
    {
      name: "Volume shock",
      expected: "Universe volume ≥ 1.6× baseline",
      actual: `avg ${a.avgVolRatio.toFixed(2)}× 20D`,
      max: 20,
      pts: Math.min(20, Math.max(0, ((a.avgVolRatio - 1) / 0.6) * 20)),
    },
    {
      name: "Liquidity deterioration",
      expected: "Trading liquidity contracting",
      actual: `liquidity ratio ${a.avgLiqRatio.toFixed(2)}`,
      max: 15,
      pts: Math.min(15, Math.max(0, ((0.95 - a.avgLiqRatio) / 0.4) * 15)),
    },
    {
      name: "Volatility expansion",
      expected: "Volatility ≥ 1.25× baseline",
      actual: `avg expansion ${a.avgVolExpansion.toFixed(2)}×`,
      max: 15,
      pts: Math.min(15, Math.max(0, ((a.avgVolExpansion - 1) / 0.5) * 15)),
    },
  ].map((r) => ({ ...r, points: +r.pts.toFixed(1) }));

  const score = Math.round(rows.reduce((x, r) => x + r.points, 0));
  const label: ConfirmationResult["label"] =
    score >= 75 ? "STRONGLY_SUPPORTED" : score >= 50 ? "SUPPORTED" : score >= 25 ? "PARTIALLY_CONFIRMED" : "NOT_CONFIRMED";
  return { score, label, indicators: rows };
}

/* ------------------------------------------------------------------ */
/*  §23 — Company timing matrix                                        */
/* ------------------------------------------------------------------ */

export type MatrixRegimeRow = "STRESS" | "STABILIZATION" | "RECOVERY" | "RE_RATING";
export type MatrixCol = "EARLY" | "ACTIVE" | "CRITICAL";
export type MatrixVerdict = "WATCH" | "PRIORITY" | "HIGH_PRIORITY" | "MONITOR";

export const TIMING_MATRIX: Record<MatrixRegimeRow, Record<MatrixCol, MatrixVerdict>> = {
  STRESS: { EARLY: "WATCH", ACTIVE: "PRIORITY", CRITICAL: "HIGH_PRIORITY" },
  STABILIZATION: { EARLY: "WATCH", ACTIVE: "PRIORITY", CRITICAL: "PRIORITY" },
  RECOVERY: { EARLY: "WATCH", ACTIVE: "MONITOR", CRITICAL: "PRIORITY" },
  RE_RATING: { EARLY: "MONITOR", ACTIVE: "MONITOR", CRITICAL: "MONITOR" },
};

export function matrixRowFor(regime: Regime): MatrixRegimeRow {
  if (regime === "STRESS" || regime === "CAPITULATION" || regime === "EARLY_STRESS") return "STRESS";
  if (regime === "STABILIZATION") return "STABILIZATION";
  if (regime === "RECOVERY") return "RECOVERY";
  return "RE_RATING";
}

export function matrixColFor(timingClass: string | null): MatrixCol {
  if (timingClass === "CRITICAL" || timingClass === "LATE") return "CRITICAL";
  if (timingClass === "ACTIVE") return "ACTIVE";
  return "EARLY";
}

/* ------------------------------------------------------------------ */
/*  §11 — Low-nominal-price (separate from deep-value)                 */
/* ------------------------------------------------------------------ */

export function isLowNominal(price: number): boolean {
  return price <= 250;
}

/* ------------------------------------------------------------------ */
/*  §24 — Research labels (allowed outputs only)                       */
/* ------------------------------------------------------------------ */

export type ResearchLabel =
  | "WATCH"
  | "DEEP_VALUE_WATCH"
  | "RECOVERY_WATCH"
  | "RECOVERY_CONFIRMATION"
  | "SDG_EXECUTION_WATCH"
  | "EXECUTION_WATCH_2030"
  | "MARKET_CONFIRMATION"
  | "MARKET_DIVERGENCE"
  | "STAGE_TRANSITION"
  | "LOW_NOMINAL_PRICE";

export interface CompanyEngineResult {
  ticker: string;
  stress: { total: number; parts: ScoreParts[] };
  stressBand: ReturnType<typeof stressBand>;
  resilience: { total: number; parts: ScoreParts[] };
  deepValue: DeepValueResult;
  lowNominal: boolean;
  priceFloorBand: PriceFloorBand;
  stats: SeriesStats;
  researchLabel: ResearchLabel;
  matrixCol: MatrixCol;
}

export function computeCompanyEngine(c: EngineCompanyInput): CompanyEngineResult {
  const s = seriesStats(c.prices);
  const stress = marketStressScore(c, s);
  const resilience = resilienceScore(c);
  const deepValue = deepValueConfluence(c, s, stress, resilience);
  const lowNominal = isLowNominal(c.lastPrice) && !deepValue.qualifies;

  /* §24 label precedence */
  let researchLabel: ResearchLabel = "WATCH";
  if (deepValue.qualifies) researchLabel = "DEEP_VALUE_WATCH";
  else if (c.pc20 > 0 && c.volRatio20d >= 1.2 && s.drawdownPct <= -8) researchLabel = "RECOVERY_CONFIRMATION";
  else if (c.pc20 < 0 && c.pc20 > -8 && resilience.total >= 60 && c.volRatio20d >= 1.1)
    researchLabel = "RECOVERY_WATCH";
  else if (lowNominal) researchLabel = "LOW_NOMINAL_PRICE";
  if (researchLabel === "WATCH" && c.sdgEvidenceMax >= 80 && c.timingScoreMax >= 60)
    researchLabel = "SDG_EXECUTION_WATCH";

  return {
    ticker: c.ticker,
    stress,
    stressBand: stressBand(stress.total),
    resilience,
    deepValue,
    lowNominal,
    priceFloorBand: priceFloorBandFor(c.lastPrice, ENGINE_SYSTEM_DATE),
    stats: s,
    researchLabel,
    matrixCol: "EARLY",
  };
}

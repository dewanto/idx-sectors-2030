/**
 * Market Intelligence Score — the core Track-03 engine.
 *
 * Repositioning: SECTORS is the primary engine (70%), news/business events are
 * evidence enrichment (20%), SDG/2030 is the research + timing dimension (10%).
 *
 * The signal engine runs on Sectors market data alone; news evidence enriches it.
 * This is a product methodology we designed ourselves — it is NOT an official
 * Sectors formula, and it never emits buy/sell recommendations.
 */

export const METHODOLOGY_VERSION = "2026.1";

export interface MarketIntelInput {
  /* --- Sectors market data --- */
  priceDrawdownPct: number; // % below trailing high (<= 0)
  priceChange20d: number;
  volumeRatio20d: number;
  relativeStrength: number; // % vs sector, 20D
  revenueGrowth: number;
  epsGrowth: number;
  dividendYield: number;
  sectorReturn20d: number;
  marketAvg20d: number;
  /* --- business-event evidence (GPT-5.6 Luna enrichment) --- */
  hasEvent: boolean;
  extractionConfidence: number; // 0..1
  sourceTier: number; // 1..4
  investmentIdrBn: number | null;
  stageIdx: number; // 0..6 (SIGNAL..MEASURED)
  /* --- SDG / 2030 layer --- */
  sdgEvidence: number; // 0..100
  timingScore: number; // 0..100
}

export interface MarketIntelResult {
  methodologyVersion: string;
  /* Sectors-derived block (70) */
  priceDislocation: number;
  volumeAnomaly: number;
  relativePerformance: number;
  fundamentalContext: number;
  marketIndustryContext: number;
  sectorsSubtotal: number;
  /* Evidence block (20) */
  businessEventPts: number;
  sourceQuality: number;
  eventMateriality: number;
  evidenceSubtotal: number;
  /* SDG / 2030 block (10) */
  sdgTargetRelevance: number;
  executionTiming2030: number;
  sdgSubtotal: number;
  totalScore: number;
  marketCondition: MarketCondition;
  sectorsSharePct: number; // how much of the score came from Sectors data
}

export type MarketCondition = "DISLOCATION" | "CONFIRMATION" | "DIVERGENCE" | "NEUTRAL";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const map = (v: number, inLo: number, inHi: number, max: number) =>
  +clamp(((v - inLo) / (inHi - inLo)) * max, 0, max).toFixed(1);

/**
 * Composite market-intelligence score. Every Sectors-derived component is
 * computed from raw market data; nothing is imputed when data is missing.
 */
export function marketIntelligenceScore(i: MarketIntelInput): MarketIntelResult {
  /* ---------- 70 pts · SECTORS-DERIVED ---------- */

  // Price dislocation (15) — magnitude of repricing from the trailing high.
  const priceDislocation = map(-i.priceDrawdownPct, 4, 40, 15);

  // Volume anomaly (15) — deviation of trading activity from its baseline.
  const volumeAnomaly = i.volumeRatio20d >= 1
    ? map(i.volumeRatio20d, 1, 3, 15)
    : map(i.volumeRatio20d, 0.6, 1, 8);

  // Relative performance (15) — company vs its own sector.
  const relativePerformance = map(i.relativeStrength, -6, 10, 15);

  // Fundamental context (15) — reported growth + distribution stability.
  const revPts = map(i.revenueGrowth, -5, 20, 7);
  const epsPts = map(i.epsGrowth, -5, 25, 5);
  const divPts = map(i.dividendYield, 0, 5, 3);
  const fundamentalContext = +(revPts + epsPts + divPts).toFixed(1);

  // Market / industry context (10) — how the surrounding market is behaving.
  const sectorPts = i.sectorReturn20d <= 0 ? map(-i.sectorReturn20d, 0, 12, 6) : map(i.sectorReturn20d, 0, 8, 4);
  const marketPts = i.marketAvg20d <= 0 ? map(-i.marketAvg20d, 0, 10, 4) : 1;
  const marketIndustryContext = +(sectorPts + marketPts).toFixed(1);

  const sectorsSubtotal = +(
    priceDislocation +
    volumeAnomaly +
    relativePerformance +
    fundamentalContext +
    marketIndustryContext
  ).toFixed(1);

  /* ---------- 20 pts · NEWS / BUSINESS-EVENT EVIDENCE ---------- */

  const businessEventPts = i.hasEvent ? +(4 + (i.stageIdx / 6) * 4 + i.extractionConfidence * 2).toFixed(1) : 0;
  const sourceQuality = i.hasEvent ? [5, 4, 3, 2][clamp(i.sourceTier, 1, 4) - 1] : 0;
  const eventMateriality = i.hasEvent
    ? i.investmentIdrBn && i.investmentIdrBn > 0
      ? map(Math.log10(i.investmentIdrBn), 1.5, 4, 5)
      : 2
    : 0;

  const evidenceSubtotal = +(businessEventPts + sourceQuality + eventMateriality).toFixed(1);

  /* ---------- 10 pts · SDG / 2030 DIMENSION ---------- */

  const sdgTargetRelevance = i.hasEvent ? map(i.sdgEvidence, 40, 95, 5) : 0;
  const executionTiming2030 = i.hasEvent ? map(i.timingScore, 40, 95, 5) : 0;
  const sdgSubtotal = +(sdgTargetRelevance + executionTiming2030).toFixed(1);

  const totalScore = Math.round(
    Math.min(100, Math.max(0, sectorsSubtotal + evidenceSubtotal + sdgSubtotal)),
  );

  /* ---------- derived market condition ---------- */
  const fundamentalsResilient = i.revenueGrowth > 0 && i.epsGrowth > -2;
  const strongEvidence = evidenceSubtotal >= 12;
  const marketResponsive = i.volumeRatio20d >= 1.25 || i.relativeStrength > 1;

  let marketCondition: MarketCondition = "NEUTRAL";
  if (i.priceDrawdownPct <= -12 && fundamentalsResilient) marketCondition = "DISLOCATION";
  else if (marketResponsive && i.relativeStrength > 0.5) marketCondition = "CONFIRMATION";
  else if (strongEvidence && !marketResponsive) marketCondition = "DIVERGENCE";

  const sectorsSharePct = Math.round((sectorsSubtotal / 70) * 100);

  return {
    methodologyVersion: METHODOLOGY_VERSION,
    priceDislocation,
    volumeAnomaly,
    relativePerformance,
    fundamentalContext,
    marketIndustryContext,
    sectorsSubtotal,
    businessEventPts,
    sourceQuality,
    eventMateriality,
    evidenceSubtotal,
    sdgTargetRelevance,
    executionTiming2030,
    sdgSubtotal,
    totalScore,
    marketCondition,
    sectorsSharePct,
  };
}

/* ------------------------------------------------------------------ */
/*  Hero signal type                                                   */
/* ------------------------------------------------------------------ */

/** The flagship derived insight: real execution + measurable repricing. */
export function heroSignalType(marketCondition: MarketCondition, stageIdx: number): string {
  if (marketCondition === "DISLOCATION" && stageIdx >= 3) return "SDG EXECUTION + MARKET DISLOCATION";
  if (marketCondition === "DISLOCATION") return "PRICE DISLOCATION WATCH";
  if (marketCondition === "CONFIRMATION" && stageIdx >= 4) return "MARKET-CONFIRMED EXECUTION";
  if (marketCondition === "CONFIRMATION") return "MARKET CONFIRMATION";
  if (marketCondition === "DIVERGENCE") return "SDG–MARKET DIVERGENCE";
  return "SDG EXECUTION SIGNAL";
}

/* ------------------------------------------------------------------ */
/*  WHY NOW? — signature feature                                       */
/* ------------------------------------------------------------------ */

export interface WhyNowItem {
  kind: "event" | "transition" | "volume" | "resilience" | "runway" | "dislocation" | "relative" | "none";
  met: boolean;
}

export interface WhyNowInput {
  hasEvent: boolean;
  eventAgeDays: number | null;
  transitionDays: number | null;
  volumeRatio: number;
  revenueGrowth: number;
  epsGrowth: number;
  monthsTo2030: number | null;
  priceDrawdownPct: number;
  relativeStrength: number;
  stageIdx: number;
}

/**
 * The five questions every signal must answer: what changed, why this company,
 * why this signal, why now, and what to investigate next.
 */
export function whyNow(i: WhyNowInput): WhyNowItem[] {
  return [
    /* 1 · WHAT CHANGED — new business event detected */
    {
      kind: "event",
      met: i.hasEvent && i.eventAgeDays !== null && i.eventAgeDays <= 120,
    },
    /* 2 · WHY THIS COMPANY — execution commitment moved forward */
    {
      kind: "transition",
      met: i.transitionDays !== null && i.transitionDays <= 180 && i.stageIdx >= 3,
    },
    /* 3 · WHY THIS SIGNAL — market activity changed */
    {
      kind: i.priceDrawdownPct <= -12 ? "dislocation" : "volume",
      met: i.volumeRatio >= 1.3 || i.priceDrawdownPct <= -12,
    },
    /* 4 · relative performance / resilience */
    {
      kind: "relative",
      met: i.relativeStrength > 0 || (i.revenueGrowth > 0 && i.epsGrowth > -2),
    },
    /* 5 · WHY NOW — documented runway before the 2030 horizon */
    {
      kind: "runway",
      met: i.monthsTo2030 !== null && i.monthsTo2030 >= 6,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  WHY NOT? — negative explainability (proves this is not keyword search) */
/* ------------------------------------------------------------------ */

export interface WhyNotInput {
  hasEvent: boolean;
  sdgEvidence: number;
  revenueGrowth: number;
  volumeRatio: number;
  relativeStrength: number;
  priceDrawdownPct: number;
  stageIdx: number;
}

export interface WhyNotItem {
  label: "sdg" | "revenue" | "event" | "market" | "relative" | "transition";
  met: boolean;
}

export function whyNot(i: WhyNotInput): WhyNotItem[] {
  return [
    { label: "sdg", met: i.sdgEvidence >= 60 },
    { label: "revenue", met: i.revenueGrowth > 0 },
    { label: "event", met: i.hasEvent && i.stageIdx >= 2 },
    {
      label: "market",
      met: i.volumeRatio >= 1.25 || i.priceDrawdownPct <= -12,
    },
    { label: "relative", met: i.relativeStrength > 0 },
    { label: "transition", met: i.stageIdx >= 3 },
  ];
}

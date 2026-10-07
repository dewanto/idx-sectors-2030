/**
 * Unit tests — signal engine maths.
 *
 * Covers three real modules (template mapping, per the accepted plan):
 *   - `src/lib/marketIntel.ts`  → marketIntelligenceScore component maps
 *   - `src/lib/scoring.ts`      → computeMarketScore, computeConfluence,
 *                                 computeTimingScore, deriveTimingClass
 *   - `src/lib/regime.ts`       → seriesStats (the template's "Z-score" item
 *     maps to the stdev-of-log-returns statistic here; the codebase has no
 *     separately named Z-score function)
 *
 * Every expected number is hand-derived from the formulas in the code:
 *   map(v, inLo, inHi, max) = clamp((v − inLo) / (inHi − inLo) × max, 0, max)
 */
import {
  computeConfluence,
  computeMarketScore,
  computeTimingScore,
  deriveTimingClass,
} from "@/lib/scoring";
import { marketIntelligenceScore, type MarketIntelInput } from "@/lib/marketIntel";
import { seriesStats, type PriceBar } from "@/lib/regime";

/* ------------------------------------------------------------------ */
/*  Shared fixture — a fully "neutral" market-intel input              */
/*  Hand-derived result: dislocation 0 + volume 4.0 + relative 5.6 +   */
/*  fundamentals 2.2 + context 5.0 = sectorsSubtotal 16.8 → total 17   */
/* ------------------------------------------------------------------ */

const NEUTRAL_INPUT: MarketIntelInput = {
  priceDrawdownPct: -3,
  priceChange20d: 0,
  volumeRatio20d: 0.8,
  relativeStrength: 0,
  revenueGrowth: 0,
  epsGrowth: 0,
  dividendYield: 0,
  sectorReturn20d: -6,
  marketAvg20d: -5,
  hasEvent: false,
  extractionConfidence: 0,
  sourceTier: 4,
  investmentIdrBn: null,
  stageIdx: 0,
  sdgEvidence: 0,
  timingScore: 0,
};

function inputWith(patch: Partial<MarketIntelInput>): MarketIntelInput {
  return { ...NEUTRAL_INPUT, ...patch };
}

function bars(closes: number[], volumes?: number[]): PriceBar[] {
  return closes.map((close, i) => ({
    date: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    close,
    volume: volumes?.[i] ?? 1000,
  }));
}

/* ------------------------------------------------------------------ */
/*  marketIntelligenceScore — Sectors-derived component maps           */
/* ------------------------------------------------------------------ */

describe("marketIntelligenceScore — price dislocation (map(−dd, 4, 40, 15))", () => {
  it("scores a −12% drawdown as 3.3 and ≥40% drawdowns at the 15-point cap", () => {
    expect(marketIntelligenceScore(inputWith({ priceDrawdownPct: -12 })).priceDislocation).toBe(3.3);
    expect(marketIntelligenceScore(inputWith({ priceDrawdownPct: -40 })).priceDislocation).toBe(15);
    expect(marketIntelligenceScore(inputWith({ priceDrawdownPct: -50 })).priceDislocation).toBe(15); // clamped
  });

  it("scores nothing below the 4% dislocation threshold", () => {
    expect(marketIntelligenceScore(inputWith({ priceDrawdownPct: -3 })).priceDislocation).toBe(0);
    expect(marketIntelligenceScore(inputWith({ priceDrawdownPct: 0 })).priceDislocation).toBe(0);
  });
});

describe("marketIntelligenceScore — volume anomaly (branch at ratio 1)", () => {
  it("uses the ≥1 branch: ratio 1.5 → 3.8, saturated at ratio ≥3 → 15", () => {
    expect(marketIntelligenceScore(inputWith({ volumeRatio20d: 1.5 })).volumeAnomaly).toBe(3.8);
    expect(marketIntelligenceScore(inputWith({ volumeRatio20d: 3.2 })).volumeAnomaly).toBe(15);
    expect(marketIntelligenceScore(inputWith({ volumeRatio20d: 10 })).volumeAnomaly).toBe(15); // clamped
  });

  it("uses the <1 branch with the lower 8-point cap: ratio 0.8 → 4.0", () => {
    expect(marketIntelligenceScore(inputWith({ volumeRatio20d: 0.8 })).volumeAnomaly).toBe(4);
    expect(marketIntelligenceScore(inputWith({ volumeRatio20d: 0.6 })).volumeAnomaly).toBe(0);
    // ratio exactly 1 enters the ≥1 branch with zero deviation
    expect(marketIntelligenceScore(inputWith({ volumeRatio20d: 1 })).volumeAnomaly).toBe(0);
  });
});

describe("marketIntelligenceScore — relative performance (map(rs, −6, 10, 15))", () => {
  it("maps −6% → 0, 0% → 5.6 and caps at +10% → 15", () => {
    const rs = (relativeStrength: number) =>
      marketIntelligenceScore(inputWith({ relativeStrength })).relativePerformance;
    expect(rs(-6)).toBe(0);
    expect(rs(0)).toBe(5.6);
    expect(rs(10)).toBe(15);
    expect(rs(30)).toBe(15); // clamped
  });
});

describe("marketIntelligenceScore — fundamental context (rev 7 + eps 5 + div 3)", () => {
  it("scores zero growth as 1.4 + 0.8 + 0 = 2.2", () => {
    expect(marketIntelligenceScore(inputWith({})).fundamentalContext).toBe(2.2);
  });

  it("caps at 15.0 once revenue/eps/dividend reach their mapping ceilings", () => {
    expect(
      marketIntelligenceScore(
        inputWith({ revenueGrowth: 20, epsGrowth: 25, dividendYield: 5 }),
      ).fundamentalContext,
    ).toBe(15);
    // far beyond the ceilings stays clamped at the same cap
    expect(
      marketIntelligenceScore(
        inputWith({ revenueGrowth: 50, epsGrowth: 40, dividendYield: 9 }),
      ).fundamentalContext,
    ).toBe(15);
  });
});

describe("marketIntelligenceScore — market / industry context", () => {
  it("credits a falling sector and market with defensive points (3.0 + 2.0 = 5.0)", () => {
    expect(marketIntelligenceScore(inputWith({})).marketIndustryContext).toBe(5);
  });

  it("gives a rising market the flat 1-point bonus (2.0 + 1 = 3.0)", () => {
    expect(
      marketIntelligenceScore(inputWith({ sectorReturn20d: 4, marketAvg20d: 3 })).marketIndustryContext,
    ).toBe(3);
  });
});

describe("marketIntelligenceScore — evidence block (no imputation)", () => {
  it("keeps evidence and SDG subtotals at exactly 0 when no event exists", () => {
    const result = marketIntelligenceScore(inputWith({}));
    expect(result.businessEventPts).toBe(0);
    expect(result.sourceQuality).toBe(0);
    expect(result.eventMateriality).toBe(0);
    expect(result.evidenceSubtotal).toBe(0);
    expect(result.sdgTargetRelevance).toBe(0);
    expect(result.executionTiming2030).toBe(0);
    expect(result.sdgSubtotal).toBe(0);
  });

  it("scores event maturity as 4 + stageIdx/6×4 + confidence×2 (stage 3, conf 0.5 → 7.0)", () => {
    const result = marketIntelligenceScore(
      inputWith({ hasEvent: true, stageIdx: 3, extractionConfidence: 0.5, sourceTier: 1 }),
    );
    expect(result.businessEventPts).toBe(7);
    expect(result.sourceQuality).toBe(5); // tier 1
    // event maturity ceiling: stageIdx 6 + confidence 1 → 10
    const maxed = marketIntelligenceScore(
      inputWith({ hasEvent: true, stageIdx: 6, extractionConfidence: 1, sourceTier: 1 }),
    );
    expect(maxed.businessEventPts).toBe(10);
  });

  it("maps event materiality from log10(investment): null → 2, 100Bn → 1.0, ≥10T → 5.0 cap", () => {
    expect(marketIntelligenceScore(inputWith({ hasEvent: true })).eventMateriality).toBe(2);
    expect(marketIntelligenceScore(inputWith({ hasEvent: true, investmentIdrBn: 100 })).eventMateriality).toBe(1);
    expect(marketIntelligenceScore(inputWith({ hasEvent: true, investmentIdrBn: 10_000 })).eventMateriality).toBe(5);
    // a zero amount is falsy → falls back to the 2-point baseline
    expect(marketIntelligenceScore(inputWith({ hasEvent: true, investmentIdrBn: 0 })).eventMateriality).toBe(2);
  });

  it("maps source tiers [5,4,3,2] and clamps out-of-range tiers", () => {
    const quality = (sourceTier: number) =>
      marketIntelligenceScore(inputWith({ hasEvent: true, sourceTier })).sourceQuality;
    expect(quality(1)).toBe(5);
    expect(quality(2)).toBe(4);
    expect(quality(3)).toBe(3);
    expect(quality(4)).toBe(2);
    expect(quality(9)).toBe(2); // clamped to tier 4
    expect(quality(0)).toBe(5); // clamped to tier 1
  });
});

/* ------------------------------------------------------------------ */
/*  seriesStats — log-return stdev, drawdown, liquidity                */
/* ------------------------------------------------------------------ */

describe("seriesStats", () => {
  it("computes the sample stdev of log-returns — [100,200,100] ≈ 0.9803", () => {
    const stats = seriesStats(bars([100, 200, 100]));
    // rets = [ln2, ln0.5]; sample variance = 2×(ln2)² → stdev ≈ 0.98026
    expect(stats.stdev20).toBeCloseTo(0.9803, 3);
    expect(stats.stdevAll).toBeCloseTo(0.9803, 3);
  });

  it("returns zero stdev for a flat series (no dispersion)", () => {
    const stats = seriesStats(bars([100, 100, 100, 100]));
    expect(stats.stdev20).toBe(0);
    expect(stats.stdevAll).toBe(0);
    expect(stats.drawdownPct).toBe(0);
  });

  it("separates the 20-bar window from the full series on a 40-bar fixture", () => {
    // early half oscillates 100/120 (i<19, odd index → 120), tail is flat 100
    const closes = Array.from({ length: 40 }, (_, i) => (i % 2 === 1 && i < 19 ? 120 : 100));
    const volumes = Array.from({ length: 40 }, (_, i) => (i < 20 ? 1000 : 2000));
    const stats = seriesStats(bars(closes, volumes));
    expect(stats.stdev20).toBe(0); // last 20 log-returns are all 0
    expect(stats.stdevAll).toBeGreaterThan(0);
    expect(stats.highClose).toBe(120);
    expect(stats.drawdownPct).toBe(-16.7); // (100 − 120)/120 → toFixed(1)
    expect(stats.liquidityRatio).toBe(2.0); // avg(last 20) / avg(first 20)
    expect(stats.pcFromHigh).toBe(stats.drawdownPct);
  });

  it("measures drawdown from the trailing high — −25% on [80, 100, 100, 75]", () => {
    const stats = seriesStats(bars([80, 100, 100, 75]));
    expect(stats.drawdownPct).toBe(-25);
    expect(stats.highClose).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  computeMarketScore — composite normalisation 0..100                */
/* ------------------------------------------------------------------ */

describe("computeMarketScore", () => {
  it("scores a neutral market (ratio 1, flat price, sector-neutral) as 26", () => {
    // 3.75 (vol) + 10 (price) + 12.5 (rs) = 26.25 → round → 26
    expect(computeMarketScore({ volumeRatio20d: 1, priceChange20d: 0, relativeStrength: 0 })).toBe(26);
  });

  it("saturates at 0 on the downside and 100 on the upside", () => {
    expect(computeMarketScore({ volumeRatio20d: 0, priceChange20d: -6, relativeStrength: -8 })).toBe(0);
    expect(computeMarketScore({ volumeRatio20d: 100, priceChange20d: 100, relativeStrength: 100 })).toBe(100);
  });

  it("never leaves the 0..100 band for extreme inputs", () => {
    expect(computeMarketScore({ volumeRatio20d: 1e6, priceChange20d: 1e6, relativeStrength: 1e6 })).toBeLessThanOrEqual(100);
    expect(computeMarketScore({ volumeRatio20d: -1e6, priceChange20d: -1e6, relativeStrength: -1e6 })).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/*  computeConfluence — weighted composite                             */
/* ------------------------------------------------------------------ */

describe("computeConfluence", () => {
  const MAXED = {
    sdgEvidence: 100,
    businessEvent: 100,
    stage: "MEASURED" as const,
    timing: 100,
    market: 100,
    relativeStrength: 8,
    sourceTier: 1,
  };

  it("distributes exactly 100 points across the seven weighted components", () => {
    const { rows } = computeConfluence(MAXED);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.weight)).toEqual([25, 20, 15, 15, 10, 10, 5]);
    expect(rows.reduce((sum, r) => sum + r.weight, 0)).toBe(100);
  });

  it("caps a fully saturated input at strength 100", () => {
    // MEASURED → stageNorm 100; rs 8 → relPerf 100; tier 1 → 5 source pts
    expect(computeConfluence(MAXED).strength).toBe(100);
  });

  it("clamps an out-of-range source tier to the tier-4 weight (2 pts)", () => {
    const { strength, rows } = computeConfluence({ ...MAXED, sourceTier: 9 });
    const sourceRow = rows.find((r) => r.component === "Source Quality");
    expect(sourceRow?.contribution).toBe(2);
    expect(sourceRow?.metricValue).toBe("Tier 9"); // raw value stays visible
    expect(strength).toBe(97); // 100 − 5 (tier-1 max) + 2 (tier-4 clamp)
  });
});

/* ------------------------------------------------------------------ */
/*  2030 execution timing (scoring.ts)                                 */
/* ------------------------------------------------------------------ */

describe("computeTimingScore", () => {
  it("produces a deterministic breakdown — EXECUTING, 0.9 confidence, 2028-01-15 completion → 96", () => {
    const result = computeTimingScore({
      stage: "EXECUTING",
      stageConfidence: 0.9,
      expectedCompletionDate: "2028-01-15", // 474 days out ≈ 15.6 months
      plannedStartDate: null,
      eventDate: "2026-09-28", // zero age → full recency
      targetYear: null,
    });
    expect(result).toEqual({
      total: 96, // 23 stage + 20 time + 18 commitment + 15 lead + 10 proximity + 10 recency
      stagePoints: 23,
      timePoints: 20,
      commitmentPoints: 18,
      leadTimePoints: 15,
      proximityPoints: 10,
      recencyPoints: 10,
    });
  });

  it("never leaves the 0..100 band", () => {
    const result = computeTimingScore({
      stage: "MEASURED",
      stageConfidence: 1,
      expectedCompletionDate: "2029-06-01",
      plannedStartDate: null,
      eventDate: "2026-09-28",
      targetYear: 2030,
    });
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.total).toBeGreaterThanOrEqual(0);
  });
});

describe("deriveTimingClass", () => {
  it("classifies EXECUTING inside 15 months of completion as CRITICAL (score ≥ 55) or LATE", () => {
    expect(deriveTimingClass("EXECUTING", "2027-05-01", 60)).toBe("CRITICAL");
    expect(deriveTimingClass("EXECUTING", "2027-05-01", 40)).toBe("LATE");
  });

  it("short-circuits OPERATIONAL/MEASURED stages to COMPLETED", () => {
    expect(deriveTimingClass("OPERATIONAL", null, 0)).toBe("COMPLETED");
    expect(deriveTimingClass("MEASURED", "2025-01-01", 10)).toBe("COMPLETED");
  });
});
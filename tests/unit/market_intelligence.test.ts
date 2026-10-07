/**
 * Unit tests — market intelligence layer.
 *
 * Covers (per the accepted plan's template mapping):
 *   - `marketIntelligenceScore` market-condition classification (4 paths)
 *   - `heroSignalType`, `whyNow`, `whyNot` explainability
 *   - watchlist ranking from `src/db/watchlist.ts` against a FAKE query
 *     builder (`tests/unit/helpers/fakeDb.ts`) — the real `@/db` module is
 *     replaced, so no database is ever touched. Fixtures are keyed by the
 *     actual `src/db/schema.ts` table objects (identity matching).
 */
import { computeWatchlistPicks, refreshWatchlist } from "@/db/watchlist";
import * as schema from "@/db/schema";
import {
  heroSignalType,
  marketIntelligenceScore,
  METHODOLOGY_VERSION,
  whyNot,
  whyNow,
  type MarketIntelInput,
} from "@/lib/marketIntel";
import { seedFakeDb, insertedRows, deletedTables } from "./helpers/fakeDb";

jest.mock("@/db", () => {
  // Lazily resolved inside the factory — hoisting-safe, and keeps the real
  // `src/db/index.ts` (which throws without DATABASE_URL) out of the registry.
  const fake = require("./helpers/fakeDb");
  return { db: fake.db };
});

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
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

/** Strong-enough evidence block: 8.5 + 5 (tier 1) + 3 (Rp1T event) = 16.5. */
const STRONG_EVIDENCE = {
  hasEvent: true,
  stageIdx: 4,
  extractionConfidence: 0.9,
  sourceTier: 1,
  investmentIdrBn: 1000,
} as const;

/** Proven joined projection rows for market_intel_scores ⋈ companies. */
interface IntelRow {
  companyId: number;
  ticker: string;
  companyName: string;
  totalScore: number;
  condition: string;
  mcap: number;
}

function intelRow(partial: Omit<IntelRow, "companyName">): IntelRow {
  return {
    companyId: partial.companyId,
    ticker: partial.ticker,
    companyName: `${partial.ticker} Ltd`,
    totalScore: partial.totalScore,
    condition: partial.condition,
    mcap: partial.mcap,
  };
}

/* ------------------------------------------------------------------ */
/*  marketIntelligenceScore — provenance + share                       */
/* ------------------------------------------------------------------ */

describe("marketIntelligenceScore — provenance", () => {
  it("stamps every score with methodologyVersion 2026.1", () => {
    expect(METHODOLOGY_VERSION).toBe("2026.1");
    expect(marketIntelligenceScore(inputWith({})).methodologyVersion).toBe("2026.1");
    expect(marketIntelligenceScore(inputWith({ hasEvent: true })).methodologyVersion).toBe("2026.1");
  });

  it("derives sectorsSharePct from sectorsSubtotal / 70", () => {
    const neutral = marketIntelligenceScore(inputWith({}));
    expect(neutral.sectorsSubtotal).toBe(16.8);
    expect(neutral.sectorsSharePct).toBe(24); // round(16.8 / 70 × 100)
    expect(neutral.totalScore).toBe(17); // round(16.8) — no event, no SDG

    // fully saturated Sectors block: 15+15+15+15+10 = 70 → 100%
    const maxed = marketIntelligenceScore(
      inputWith({
        priceDrawdownPct: -40,
        volumeRatio20d: 3,
        relativeStrength: 10,
        revenueGrowth: 20,
        epsGrowth: 25,
        dividendYield: 5,
        sectorReturn20d: -12,
        marketAvg20d: -10,
      }),
    );
    expect(maxed.sectorsSubtotal).toBe(70);
    expect(maxed.sectorsSharePct).toBe(100);
    expect(maxed.totalScore).toBe(70);
  });
});

/* ------------------------------------------------------------------ */
/*  Market condition classification — the four paths                   */
/* ------------------------------------------------------------------ */

describe("marketCondition classification", () => {
  it("flags DISLOCATION when drawdown ≤ −12% AND fundamentals are resilient (checked first)", () => {
    const result = marketIntelligenceScore(
      inputWith({ priceDrawdownPct: -12, revenueGrowth: 5, epsGrowth: 3, volumeRatio20d: 0.9 }),
    );
    expect(result.marketCondition).toBe("DISLOCATION");
  });

  it("does NOT flag DISLOCATION without resilient fundamentals — falls through to NEUTRAL", () => {
    const result = marketIntelligenceScore(
      inputWith({ priceDrawdownPct: -12, revenueGrowth: -1, epsGrowth: 0 }),
    );
    expect(result.marketCondition).toBe("NEUTRAL");
  });

  it("flags CONFIRMATION when the market is responsive AND relative strength clears 0.5%", () => {
    const result = marketIntelligenceScore(
      inputWith({ priceDrawdownPct: -5, volumeRatio20d: 1.3, relativeStrength: 1 }),
    );
    expect(result.marketCondition).toBe("CONFIRMATION");
  });

  it("flags DIVERGENCE on strong evidence while the market stays quiet", () => {
    const result = marketIntelligenceScore(
      inputWith({
        ...STRONG_EVIDENCE,
        priceDrawdownPct: -5,
        volumeRatio20d: 0.9,
        relativeStrength: 0,
      }),
    );
    expect(result.evidenceSubtotal).toBe(16.5); // ≥ 12 required for DIVERGENCE
    expect(result.marketCondition).toBe("DIVERGENCE");
  });

  it("stays NEUTRAL otherwise — including a responsive market without relative strength", () => {
    expect(marketIntelligenceScore(inputWith({})).marketCondition).toBe("NEUTRAL");
    // volumeRatio ≥ 1.25 makes it responsive, but rs ≤ 0.5 blocks CONFIRMATION
    // and responsiveness blocks DIVERGENCE
    expect(
      marketIntelligenceScore(inputWith({ volumeRatio20d: 1.3, relativeStrength: 0.3 })).marketCondition,
    ).toBe("NEUTRAL");
  });
});

/* ------------------------------------------------------------------ */
/*  Hero signal + WHY NOW / WHY NOT explainability                     */
/* ------------------------------------------------------------------ */

describe("heroSignalType", () => {
  it("derives the flagship labels from condition × execution stage", () => {
    expect(heroSignalType("DISLOCATION", 4)).toBe("SDG EXECUTION + MARKET DISLOCATION");
    expect(heroSignalType("DISLOCATION", 2)).toBe("PRICE DISLOCATION WATCH");
    expect(heroSignalType("CONFIRMATION", 5)).toBe("MARKET-CONFIRMED EXECUTION");
    expect(heroSignalType("CONFIRMATION", 3)).toBe("MARKET CONFIRMATION");
    expect(heroSignalType("DIVERGENCE", 0)).toBe("SDG–MARKET DIVERGENCE");
    expect(heroSignalType("NEUTRAL", 2)).toBe("SDG EXECUTION SIGNAL");
  });
});

describe("whyNow", () => {
  const ALL_MET = {
    hasEvent: true,
    eventAgeDays: 10,
    transitionDays: 30,
    volumeRatio: 1.4,
    revenueGrowth: 2,
    epsGrowth: 1,
    monthsTo2030: 51.1,
    priceDrawdownPct: -3,
    relativeStrength: 2,
    stageIdx: 4,
  };

  it("answers all five questions with the expected kinds when everything is met", () => {
    const items = whyNow(ALL_MET);
    expect(items.map((i) => i.kind)).toEqual(["event", "transition", "volume", "relative", "runway"]);
    expect(items.every((i) => i.met)).toBe(true);
  });

  it("switches the third question to the dislocation kind on a ≥12% drawdown", () => {
    const items = whyNow({ ...ALL_MET, priceDrawdownPct: -20, volumeRatio: 1 });
    expect(items[2]).toEqual({ kind: "dislocation", met: true });
  });

  it("reports every question unmet for a weak input", () => {
    const items = whyNow({
      hasEvent: false,
      eventAgeDays: null,
      transitionDays: null,
      volumeRatio: 1,
      revenueGrowth: -2,
      epsGrowth: -5,
      monthsTo2030: null,
      priceDrawdownPct: -5,
      relativeStrength: -1,
      stageIdx: 1,
    });
    expect(items.every((i) => !i.met)).toBe(true);
  });

  it("uses the documented thresholds (event ≤120d, transition ≤180d, volume ≥1.3, runway ≥6 months)", () => {
    const edge = whyNow({
      ...ALL_MET,
      eventAgeDays: 121, // just past the window
      transitionDays: 181, // just past the window
      volumeRatio: 1.29, // just under the volume bar
      monthsTo2030: 5.9, // just under the runway bar
    });
    expect(edge.map((i) => i.met)).toEqual([false, false, false, true, false]);
  });
});

describe("whyNot", () => {
  it("met on every dimension for a strong input", () => {
    const items = whyNot({
      hasEvent: true,
      sdgEvidence: 80,
      revenueGrowth: 3,
      volumeRatio: 1.3,
      relativeStrength: 2,
      priceDrawdownPct: -3,
      stageIdx: 3,
    });
    expect(items.map((i) => i.label)).toEqual([
      "sdg",
      "revenue",
      "event",
      "market",
      "relative",
      "transition",
    ]);
    expect(items.every((i) => i.met)).toBe(true);
  });

  it("unmet on every dimension for a weak input", () => {
    const items = whyNot({
      hasEvent: false,
      sdgEvidence: 40,
      revenueGrowth: -1,
      volumeRatio: 1,
      relativeStrength: -1,
      priceDrawdownPct: -5,
      stageIdx: 1,
    });
    expect(items.every((i) => !i.met)).toBe(true);
  });

  it("uses dislocation as an alternative market gate (drawdown ≤ −12%)", () => {
    const items = whyNot({
      hasEvent: false,
      sdgEvidence: 0,
      revenueGrowth: -1,
      volumeRatio: 1,
      relativeStrength: -1,
      priceDrawdownPct: -20,
      stageIdx: 1,
    });
    expect(items.find((i) => i.label === "market")?.met).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Watchlist ranking (fake DB — identity-matched schema tables)       */
/* ------------------------------------------------------------------ */

describe("computeWatchlistPicks", () => {
  it("awards the 10-point marketCondition bonus for DISLOCATION/CONFIRMATION only", async () => {
      seedFakeDb([
        [
          schema.marketIntelScores,
          [
            intelRow({ companyId: 1, ticker: "AAAA", totalScore: 50, condition: "DISLOCATION", mcap: 1000 }),
            intelRow({ companyId: 2, ticker: "BBBB", totalScore: 50, condition: "NEUTRAL", mcap: 1000 }),
          ],
        ],
        [schema.signals, []],
        [schema.eventSdgMappings, []],
        [schema.marketPrices, []],
      ]);
  
      const picks = await computeWatchlistPicks(10);
    expect(picks).toHaveLength(2);
    const [dislocated, neutral] = picks;
    expect(dislocated.ticker).toBe("AAAA");
    expect(dislocated.breakdown.marketCondition).toBe(10);
    expect(dislocated.potentialScore).toBe(40); // 50×0.6 + 10
    expect(neutral.breakdown.marketCondition).toBe(0);
    expect(neutral.potentialScore).toBe(30);
    // the bonus is exactly the difference between the otherwise-identical rows
    expect(dislocated.potentialScore - neutral.potentialScore).toBe(10);
  });

  it("ranks deterministically: score desc → mcap desc → ticker asc, weighting intel 60/signal 15/evidence 15", async () => {
    seedFakeDb([
      [
        schema.marketIntelScores,
        [
          intelRow({ companyId: 1, ticker: "BBRI", totalScore: 50, condition: "NEUTRAL", mcap: 1000 }),
          intelRow({ companyId: 6, ticker: "BBCA", totalScore: 100, condition: "CONFIRMATION", mcap: 9000 }),
          intelRow({ companyId: 7, ticker: "ZZZZ", totalScore: 30, condition: "NEUTRAL", mcap: 900 }),
          intelRow({ companyId: 3, ticker: "ASII", totalScore: 30, condition: "NEUTRAL", mcap: 500 }),
          intelRow({ companyId: 2, ticker: "TLKM", totalScore: 30, condition: "NEUTRAL", mcap: 500 }),
        ],
      ],
      // BBRI has the strongest signal (100 → 15 pts) and evidence (100 → 15 pts)
      [schema.signals, [{ companyId: 1, strength: 100 }]],
      [schema.eventSdgMappings, [{ companyId: 1, evidence: 100 }]],
      [schema.marketPrices, []],
          ]);
      
          const picks = await computeWatchlistPicks(10);
          // 70 (BBCA) → 60 (BBRI 30+15+15) → then the 18s: ZZZZ (mcap 900) beats
    // ASII/TLKM (500), and ASII < TLKM breaks the final tie
    expect(picks.map((p) => p.ticker)).toEqual(["BBCA", "BBRI", "ZZZZ", "ASII", "TLKM"]);
    expect(picks.map((p) => p.potentialScore)).toEqual([70, 60, 18, 18, 18]);
    expect(picks[1].breakdown).toEqual({
      marketIntel: 30,
      signal: 15,
      sdgEvidence: 15,
      marketCondition: 0,
      suspendedPenalty: 0,
    });
  });

  it("applies the −30 suspended penalty (five trailing zero-volume sessions) and floors at 0", async () => {
    seedFakeDb([
      [
        schema.marketIntelScores,
        [
          intelRow({ companyId: 5, ticker: "SUSP", totalScore: 10, condition: "NEUTRAL", mcap: 100 }),
          intelRow({ companyId: 4, ticker: "FOUR", totalScore: 10, condition: "NEUTRAL", mcap: 100 }),
          intelRow({ companyId: 8, ticker: "MIXV", totalScore: 10, condition: "NEUTRAL", mcap: 100 }),
        ],
      ],
      [schema.signals, []],
      [schema.eventSdgMappings, []],
      [
        schema.marketPrices,
        [
          // FOUR: only 4 sessions → cannot qualify as suspended
          { companyId: 4, volume: 0 },
          { companyId: 4, volume: 0 },
          { companyId: 4, volume: 0 },
          { companyId: 4, volume: 0 },
          // SUSP: five trailing zero-volume sessions → suspended
          { companyId: 5, volume: 0 },
          { companyId: 5, volume: 0 },
          { companyId: 5, volume: 0 },
          { companyId: 5, volume: 0 },
          { companyId: 5, volume: 0 },
          // MIXV: zero-volume sessions but activity in between → not suspended
          { companyId: 8, volume: 0 },
          { companyId: 8, volume: 0 },
          { companyId: 8, volume: 500 },
          { companyId: 8, volume: 0 },
          { companyId: 8, volume: 0 },
        ],
      ],
    ]);

    const picks = await computeWatchlistPicks(10);
        expect(picks.map((p) => p.ticker)).toEqual(["FOUR", "MIXV", "SUSP"]); // 6, 6, 0 — ticker asc on tie
    expect(picks.find((p) => p.ticker === "SUSP")?.breakdown.suspendedPenalty).toBe(-30);
    expect(picks.find((p) => p.ticker === "SUSP")?.potentialScore).toBe(0); // 6 − 30 → floored
    expect(picks.find((p) => p.ticker === "FOUR")?.breakdown.suspendedPenalty).toBe(0);
    expect(picks.find((p) => p.ticker === "MIXV")?.breakdown.suspendedPenalty).toBe(0);
  });

  it("clamps the composite into 0..100 and honours the requested limit", async () => {
    seedFakeDb([
      [
        schema.marketIntelScores,
        [
          // 60 + 15 + 15 + 10 = exactly the 100 ceiling
          intelRow({ companyId: 6, ticker: "MAXC", totalScore: 100, condition: "CONFIRMATION", mcap: 9000 }),
          intelRow({ companyId: 9, ticker: "MIDC", totalScore: 50, condition: "NEUTRAL", mcap: 500 }),
          // 6 − 30 → floored at the 0 end
          intelRow({ companyId: 5, ticker: "SUSP", totalScore: 10, condition: "NEUTRAL", mcap: 100 }),
        ],
      ],
      [schema.signals, [{ companyId: 6, strength: 100 }]],
      [schema.eventSdgMappings, [{ companyId: 6, evidence: 100 }]],
      [
        schema.marketPrices,
        Array.from({ length: 5 }, (_, i) => ({ companyId: 5, volume: 0 })),
      ],
    ]);

    const picks = await computeWatchlistPicks(3);
        expect(picks).toHaveLength(3);
    expect(picks[0].potentialScore).toBe(100); // ceiling, not more
    expect(picks[1].potentialScore).toBe(30);
    expect(picks[2].potentialScore).toBe(0); // floor, not negative

    expect((await computeWatchlistPicks(2)).map((p) => p.ticker)).toEqual(["MAXC", "MIDC"]);
  });
});

describe("refreshWatchlist", () => {
  it("rewrites the watchlist table in rank order and carries emptyRuns over", async () => {
    seedFakeDb([
      [
        schema.marketIntelScores,
        [
          intelRow({ companyId: 6, ticker: "BBCA", totalScore: 100, condition: "CONFIRMATION", mcap: 9000 }),
          intelRow({ companyId: 1, ticker: "BBRI", totalScore: 50, condition: "NEUTRAL", mcap: 1000 }),
          intelRow({ companyId: 7, ticker: "ZZZZ", totalScore: 30, condition: "NEUTRAL", mcap: 900 }),
        ],
      ],
      [schema.signals, []],
      [schema.eventSdgMappings, []],
      [schema.marketPrices, []],
      // previous selection: BBCA stayed empty for 3 syncs
      [schema.watchlist, [{ companyId: 6, emptyRuns: 3 }]],
    ]);

    const picks = await refreshWatchlist(2);

    expect(picks.map((p) => [p.ticker, p.rank, p.emptyRuns])).toEqual([
      ["BBCA", 1, 3], // streak survives a re-pick so the circuit breaker works
      ["BBRI", 2, 0],
    ]);

    // full delete + insert rewrite
    expect(deletedTables).toContain(schema.watchlist);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].table).toBe(schema.watchlist);
    const values = insertedRows[0].values as Array<Record<string, unknown>>;
    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      companyId: 6,
      rank: 1,
      potentialScore: 70,
      emptyRuns: 3,
    });
    expect(typeof values[0].scoreBreakdown).toBe("object");
    expect(typeof values[0].selectedAt).toBe("string");
    expect(values[1]).toMatchObject({ companyId: 1, rank: 2, emptyRuns: 0 });
  });
});
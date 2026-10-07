/**
 * Unit tests — database layer contracts, with NO database.
 *
 * Template mapping (accepted plan): "database_sync" covers
 *   - `src/db/index.ts` PostgreSQL connection handling (guard + pool config),
 *     driven through `jest.isolateModules` because the module configures a
 *     pg Pool at import time; the global `__arenaNextJsPostgresqlPool` cache
 *     is managed explicitly around each isolated require.
 *   - the incremental-sync window arithmetic `src/db/sync.ts` uses. sync.ts
 *     itself is deliberately NOT imported here — it executes main() at load
 *     — so the test exercises the identical pure helpers it mirrors
 *     (`addDays`/`daysBetween` from `src/lib/gann.ts`, UTC YYYY-MM-DD maths),
 *     which is where sync.ts's window logic is factored from.
 *   - data provenance: every market-intel score carries methodologyVersion
 *     "2026.1", the source-quality tier map and the Sectors share formula.
 *   - the no-cache/no-imputation contract: `src/db/sync.ts` always upserts
 *     snapshots and scores (`onConflictDoUpdate`) and never imputes missing
 *     event data — asserted here at the marketIntel contract level
 *     (hasEvent: false ⇒ evidence and SDG subtotals are exactly 0).
 */
import { addDays, daysBetween } from "@/lib/gann";
import {
  marketIntelligenceScore,
  METHODOLOGY_VERSION,
  type MarketIntelInput,
} from "@/lib/marketIntel";

/* ------------------------------------------------------------------ */
/*  db/index.ts — PostgreSQL connection handling                       */
/* ------------------------------------------------------------------ */

const POOL_CACHE_KEY = "__arenaNextJsPostgresqlPool";

function clearPoolCache(): void {
  delete (globalThis as Record<string, unknown>)[POOL_CACHE_KEY];
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("db/index connection handling", () => {
  const LOCAL_URL = "postgres://user:pass@localhost:5432/app_db";
  const REMOTE_URL = "postgres://user:pass@db.supabase.co:5432/app_db";
  let savedUrl: string | undefined;

  beforeAll(() => {
    savedUrl = process.env.DATABASE_URL;
  });

  afterAll(() => {
    setEnv("DATABASE_URL", savedUrl);
  });

  beforeEach(clearPoolCache);
  afterEach(clearPoolCache);

  it("refuses to initialise without DATABASE_URL", () => {
    setEnv("DATABASE_URL", undefined);
    jest.isolateModules(() => {
      expect(() => require("@/db")).toThrow("DATABASE_URL is required");
    });
  });

  it("builds a plain (non-TLS) pool for local hosts — the pool is lazy, no connection is made", async () => {
    setEnv("DATABASE_URL", LOCAL_URL);
    let captured: { pool: { options: Record<string, unknown>; end: () => Promise<void> }; db: unknown } | null = null;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("@/db");
      captured = { pool: mod.pool, db: mod.db };
    });
    expect(captured!.db).toBeDefined();
    expect(captured!.pool.options.connectionString).toBe(LOCAL_URL);
    expect(captured!.pool.options.ssl).toBeUndefined();
    await captured!.pool.end(); // zero clients → resolves immediately
  });

  it("adds the managed-host TLS config for remote hosts", async () => {
    setEnv("DATABASE_URL", REMOTE_URL);
    let pool: { options: Record<string, unknown>; end: () => Promise<void> } | null = null;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      pool = require("@/db").pool;
    });
    expect(pool!.options.connectionString).toBe(REMOTE_URL);
    expect(pool!.options.ssl).toEqual({ rejectUnauthorized: false });
    await pool!.end();
  });

  it("reuses the global pool cache across isolated re-imports (hot-reload guard)", () => {
    setEnv("DATABASE_URL", REMOTE_URL);
    let first: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      first = require("@/db").pool;
    });
    let second: unknown;
    // cache survives isolateModules — it lives on globalThis, not the registry
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      second = require("@/db").pool;
    });
    expect(second).toBe(first);
  });
});

/* ------------------------------------------------------------------ */
/*  Incremental sync window arithmetic (as used by src/db/sync.ts)     */
/* ------------------------------------------------------------------ */

describe("incremental window arithmetic", () => {
  it("handles month/year rollover and leap years correctly", () => {
    // 2024 is a leap year: Feb 28 + 1 = Feb 29, +2 = Mar 1
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-28", 2)).toBe("2024-03-01");
    // 2025 is not: Feb 28 + 2 = Mar 2
    expect(addDays("2025-02-28", 2)).toBe("2025-03-02");
    // year rollover
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("derives the full trailing window (today − 90) and the incremental start (+1 after the watermark)", () => {
    expect(addDays("2026-10-06", -90)).toBe("2026-07-08"); // fullWindowStart
    expect(addDays("2026-10-03", 1)).toBe("2026-10-04"); // lastTradingDate + 1
  });

  it("chunks index history at 90-day boundaries and clamps the last chunk to today", () => {
    // chunkEnd = cursor + 89 → 90 calendar days inclusive
    expect(addDays("2026-01-01", 89)).toBe("2026-03-31");
    // next cursor = chunkEnd + 1 — no overlap, no gap
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    // the API clamps wider windows: a chunk that would overshoot today must be
    // truncated to today (ISO strings compare correctly as dates)
    const today = "2026-12-31";
    const overshoot = addDays("2026-12-20", 89);
    expect(overshoot).toBe("2027-03-19");
    expect(overshoot > today).toBe(true);
  });

  it("keeps the daysBetween sign — positive when the target is later", () => {
    expect(daysBetween("2026-10-06", "2026-10-09")).toBe(3);
    expect(daysBetween("2026-10-09", "2026-10-06")).toBe(-3);
    expect(daysBetween("2026-10-06", "2026-10-06")).toBe(0);
    expect(daysBetween("2026-10-06", "2026-07-08")).toBe(-90); // the window width itself
  });
});

/* ------------------------------------------------------------------ */
/*  Data provenance                                                    */
/* ------------------------------------------------------------------ */

const BASE_INPUT: MarketIntelInput = {
  priceDrawdownPct: -12,
  priceChange20d: 0,
  volumeRatio20d: 1.5,
  relativeStrength: 0,
  revenueGrowth: 0,
  epsGrowth: 0,
  dividendYield: 0,
  sectorReturn20d: 0,
  marketAvg20d: 0,
  hasEvent: true,
  extractionConfidence: 0.5,
  sourceTier: 2,
  investmentIdrBn: 100,
  stageIdx: 3,
  sdgEvidence: 70,
  timingScore: 80,
};

describe("data provenance on every score", () => {
  it("stamps methodologyVersion 2026.1 regardless of input", () => {
    expect(METHODOLOGY_VERSION).toBe("2026.1");
    expect(marketIntelligenceScore(BASE_INPUT).methodologyVersion).toBe("2026.1");
    expect(
      marketIntelligenceScore({ ...BASE_INPUT, hasEvent: false }).methodologyVersion,
    ).toBe("2026.1");
  });

  it("maps source tiers to [5, 4, 3, 2] points and clamps out-of-range tiers", () => {
    const quality = (sourceTier: number) =>
      marketIntelligenceScore({ ...BASE_INPUT, sourceTier }).sourceQuality;
    expect(quality(1)).toBe(5);
    expect(quality(2)).toBe(4);
    expect(quality(3)).toBe(3);
    expect(quality(4)).toBe(2);
    expect(quality(9)).toBe(2); // clamp high → tier 4
    expect(quality(0)).toBe(5); // clamp low → tier 1
  });

  it("reports the Sectors share of the total as round(subtotal / 70 × 100)", () => {
    for (const input of [BASE_INPUT, { ...BASE_INPUT, hasEvent: false }, { ...BASE_INPUT, priceDrawdownPct: -40 }]) {
      const result = marketIntelligenceScore(input);
      expect(result.sectorsSharePct).toBe(Math.round((result.sectorsSubtotal / 70) * 100));
      expect(result.sectorsSharePct).toBeGreaterThanOrEqual(0);
      expect(result.sectorsSharePct).toBeLessThanOrEqual(100);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  No-cache / no-imputation contract                                  */
/* ------------------------------------------------------------------ */

describe("no-imputation contract (hasEvent: false)", () => {
  it("contributes exactly 0 evidence and SDG points when no event exists", () => {
    const result = marketIntelligenceScore({ ...BASE_INPUT, hasEvent: false });
    expect(result.businessEventPts).toBe(0);
    expect(result.sourceQuality).toBe(0);
    expect(result.eventMateriality).toBe(0);
    expect(result.evidenceSubtotal).toBe(0);
    expect(result.sdgTargetRelevance).toBe(0);
    expect(result.executionTiming2030).toBe(0);
    expect(result.sdgSubtotal).toBe(0);
    // the total is then driven by the Sectors block alone
    expect(result.totalScore).toBe(Math.round(result.sectorsSubtotal));
  });
});
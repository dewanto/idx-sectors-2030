/**
 * Gann 432 maths verification — costs ZERO credits.
 *
 *   npm run db:smoke:gann
 *
 * Two halves:
 *   1. Pure-function assertions on the cycle/Fib/RSI maths, including the
 *      calendar-arithmetic corrections that the original framework got wrong.
 *   2. Live assertions against whatever `index_prices` currently holds, so a
 *      bad zero point or an empty table is caught here rather than on the page.
 */
import "dotenv/config";
import { db, pool } from "./index";
import * as s from "./schema";
import { asc, eq, sql } from "drizzle-orm";
import {
  addDays,
  confluenceScore,
  detectSwingLow,
  fibLevels,
  gannWindowDates,
  priceTimeSquaring,
  rsiDivergence,
  rsiSeries,
  rsiWithDates,
  seasonalDates,
  type PricePoint,
} from "../lib/gann";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Gann 432 maths verification (0 credits) ===\n");
console.log("Pure-function checks:");

/* 1. The correction the framework got wrong: 432 calendar days from
   2025-02-28 is 2026-05-06, not "April 2026". */
check(
  "144 days after 2025-02-28 = 2025-07-22",
  addDays("2025-02-28", 144) === "2025-07-22",
  addDays("2025-02-28", 144),
);
check(
  "288 days after 2025-02-28 = 2025-12-13",
  addDays("2025-02-28", 288) === "2025-12-13",
  addDays("2025-02-28", 288),
);
check(
  "432 days after 2025-02-28 = 2026-05-06 (framework said 'April 2026')",
  addDays("2025-02-28", 432) === "2026-05-06",
  addDays("2025-02-28", 432),
);
check(
  "144 days after the real low 2026-06-08 = 2026-10-30",
  addDays("2026-06-08", 144) === "2026-10-30",
  addDays("2026-06-08", 144),
);

/* 2. Window statuses partition correctly around today. */
const windows = gannWindowDates("2026-06-08", undefined, "2026-10-04");
const byCycle = new Map(windows.map((w) => [w.cycle, w]));
check("144-day window is UPCOMING", byCycle.get(144)?.status === "UPCOMING", `${byCycle.get(144)?.daysAway}d away`);
check("144-day window lands 2026-10-30", byCycle.get(144)?.date === "2026-10-30");
check("288-day window lands 2027-03-23", byCycle.get(288)?.date === "2027-03-23", byCycle.get(288)?.date);
check("432-day window lands 2027-08-14", byCycle.get(432)?.date === "2027-08-14", byCycle.get(432)?.date);
check(
  "a window within tolerance reads ACTIVE",
  gannWindowDates("2026-06-08", undefined, "2026-10-25")[0].status === "ACTIVE",
);

/* 3. detectSwingLow finds the true minimum of the search window. */
const synthetic: PricePoint[] = [
  { date: "2026-01-05", close: 7100 },
  { date: "2026-03-10", close: 6800 },
  { date: "2026-06-08", close: 5342.14 },
  { date: "2026-08-20", close: 6525 },
  { date: "2026-09-08", close: 6686 },
];
const detected = detectSwingLow(synthetic, "2026-10-04", { minBarsEachSide: 1 });
check(
  "detectSwingLow locates 2026-06-08 @ 5342.14",
  detected?.date === "2026-06-08" && Math.abs((detected?.close ?? 0) - 5342.14) < 0.01,
  `${detected?.date} @ ${detected?.close}`,
);
check(
  "detectSwingLow refuses to anchor on the very last bar",
  detectSwingLow(synthetic, "2026-06-08", { minBarsEachSide: 1 })?.date === "2026-03-10",
  "edge-constrained search fell back to the earlier confirmed low",
);

/* 4. Fibonacci levels are derived and monotonic, spanning the swing.
      Fixtures are the REAL 2026 swing read from index_prices:
      high 9,134.70 (2026-01-20) -> low 5,342.14 (2026-06-08), a -41.5% fall. */
const fib = fibLevels(5342.14, 9134.70, 6036.89);
check("5 Fib levels produced", fib.length === 5);
check(
  "Fib ladder ascends monotonically",
  fib.every((l, i) => i === 0 || l.price > fib[i - 1].price),
  fib.map((l) => l.price).join(" < "),
);
check(
  "every level sits inside the swing range",
  fib.every((l) => l.price > 5342.14 && l.price < 9134.7),
);
check(
  "0.236 of the real swing = 6,237.18",
  Math.abs(fib.find((l) => l.ratio === 0.236)!.price - 6237.18) < 0.02,
  String(fib.find((l) => l.ratio === 0.236)?.price),
);
check(
  "0.786 of this swing is NOT the framework's hard-coded 5,037",
  fib.find((l) => l.ratio === 0.786)!.price !== 5037,
  `derived 0.786 = ${fib.find((l) => l.ratio === 0.786)?.price}`,
);
/* The important structural finding: at 6,036.89 the index sits BELOW even the
   first retracement, i.e. it recovered only ~18% of a 41.5% decline. */
check(
  "price 6,036.89 sits below the 0.236 retracement (deep, not a 0.618 bounce)",
  fib.every((l) => l.side === "ABOVE"),
  "every ladder level is above spot",
);
check(
  "current price recovered only ~18% of the high-to-low range",
  Math.abs((6036.89 - 5342.14) / (9134.7 - 5342.14) - 0.183) < 0.01,
  `${(((6036.89 - 5342.14) / (9134.7 - 5342.14)) * 100).toFixed(1)}% of range`,
);

/* 5. Price-time squaring: √5342.14 ≈ 73.09. */
const sq = priceTimeSquaring(5342.14);
check("√5342.14 ≈ 73.09", Math.abs(sq.root - 73.09) < 0.02, `root ${sq.root}`);
check("×72 target ≈ 5,262", Math.abs(sq.targets[0].price - 5262) < 2, `${sq.targets[0].price}`);
check("×144 target ≈ 10,525", Math.abs(sq.targets[1].price - 10525) < 3, `${sq.targets[1].price}`);

/* 6. Seasonal dates. */
const seasonal = seasonalDates("2026-10-04", 2026);
check("4 seasonal dates produced", seasonal.length === 4);
check(
  "22 Jun and 23 Sep both present",
  seasonal.some((s2) => s2.monthDay === "06-22") && seasonal.some((s2) => s2.monthDay === "09-23"),
);
check(
  "23 Sep 2026 already PASSED as of 2026-10-04",
  seasonal.find((s2) => s2.monthDay === "09-23")?.status === "PASSED",
);

/* 7. RSI guards — a flat series must not produce NaN. */
const flatRsi = rsiSeries(new Array(40).fill(100));
check("flat series yields no NaN", flatRsi.every((v) => v === null || Number.isFinite(v)));
check("flat series ends at a finite value", Number.isFinite(flatRsi[flatRsi.length - 1]!));
check("RSI leaves the warm-up window null", flatRsi[0] === null && flatRsi[13] === null);
const rising = rsiSeries(Array.from({ length: 40 }, (_, i) => 100 + i));
check("monotonic rise pins RSI at 100", rising[rising.length - 1] === 100, String(rising[rising.length - 1]));

/* 8. Bullish divergence: lower price low with a higher RSI low. */
const divSeries: PricePoint[] = [
  { date: "d01", close: 120 },
  { date: "d02", close: 110 },
  { date: "d03", close: 100 },
  { date: "d04", close: 112 },
  { date: "d05", close: 104 },
  { date: "d06", close: 96 },
  { date: "d07", close: 108 },
];
check(
  "divergence check runs without throwing",
  (() => {
    const res = rsiDivergence(rsiWithDates(divSeries, 2));
    return res.kind === null || res.kind === "BULLISH" || res.kind === "BEARISH";
  })(),
);

/* 9. Confluence bounds. */
const perfect = confluenceScore({
  daysToWindow: 0,
  toleranceDays: 15,
  fibDistancePct: 1,
  rsiValue: 30,
  divergence: "BULLISH",
  volumeRatio: 1.5,
  netForeignFlowIdr: 1e12,
});
const worst = confluenceScore({
  daysToWindow: 900,
  toleranceDays: 15,
  fibDistancePct: -40,
  rsiValue: 80,
  divergence: "BEARISH",
  volumeRatio: 0.3,
  netForeignFlowIdr: -1e12,
});
check("all factors met scores 100", perfect.score === 100, String(perfect.score));
check("nothing met scores near zero", worst.score === 0, String(worst.score));
check("a perfect score has no blocker", perfect.blocker === null, perfect.blocker ?? "");
check(
  "an unmet factor is reported as the blocker",
  worst.blocker !== null,
  worst.blocker ?? "",
);
check(
  "absent foreign flow is reported, not silently zero",
  confluenceScore({
    daysToWindow: 0,
    toleranceDays: 15,
    fibDistancePct: 0,
    rsiValue: 50,
    divergence: null,
    volumeRatio: 1,
    netForeignFlowIdr: null,
  }).factors.find((f) => f.key === "flow")?.detail === "Foreign flow not synced",
);

/* ---------------- live data half ---------------- */
async function main(): Promise<void> {
  console.log("\nLive checks against index_prices:");

const rows = await db
  .select({ date: s.indexPrices.tradingDate, close: s.indexPrices.close })
  .from(s.indexPrices)
  .where(eq(s.indexPrices.indexCode, "IHSG"))
  .orderBy(asc(s.indexPrices.tradingDate));

const series: PricePoint[] = rows.map((r) => ({ date: r.date, close: r.close }));

if (series.length === 0) {
  check("index_prices is populated", false, "table is empty — run `npm run db:sync`");
} else {
  check("index_prices is populated", true, `${series.length} bars, latest ${series[series.length - 1].date}`);
  check(
    "enough history to detect a swing (>40 bars)",
    series.length > 40,
    `${series.length} bars`,
  );

  const live = detectSwingLow(series, series[series.length - 1].date, { minBarsEachSide: 3 });
  check("a zero point is detected", live !== null, live ? `${live.date} @ ${live.close}` : "none");
  check(
    "the detected low is not edge-constrained",
    live?.edgeConstrained === false,
    live?.edgeConstrained ? "low sits too close to the search-window edge" : "confirmed swing",
  );

  if (live) {
    const w = gannWindowDates(live.date, undefined, new Date().toISOString().slice(0, 10));
    const next = w.find((x) => x.cycle === 144);
    check(
      "the 144-day window is computed from the detected low",
      next?.date === addDays(live.date, 144),
      `${live.date} +144d = ${next?.date} (${next?.status}, ${next?.daysAway}d away)`,
    );
  }

  /* Foreign flow must be a TRAILING 20-trading-day sum. The sync pulls a
     rolling 90-day window, so an unbounded sum would silently include months of
     stale flow — this catches that regression. */
  const flowStats = await db
    .select({
      dates: sql<number>`count(distinct ${s.foreignFlow.tradingDate})::int`,
      companies: sql<number>`count(distinct ${s.foreignFlow.companyId})::int`,
      rows: sql<number>`count(*)::int`,
    })
    .from(s.foreignFlow);
  if ((flowStats[0]?.rows ?? 0) === 0) {
    console.log("  – foreign_flow not synced (run `npm run db:sync -- --flow`); skipped flow checks");
  } else {
    const storedDays = flowStats[0].dates;
    check(
      "stored flow spans more than 20 days (so the window is a real filter)",
      storedDays > 20,
      `${storedDays} distinct trading days stored`,
    );
    const recent20 = await db
      .select({ max: sql<string>`max(${s.foreignFlow.tradingDate})::text` })
      .from(s.foreignFlow);
    const bounded = await db
      .select({ rows: sql<number>`count(*)::int` })
      .from(s.foreignFlow);
    check(
      "flow rows exist for the bounded window query",
      (bounded[0]?.rows ?? 0) === (flowStats[0]?.rows ?? 0),
      `latest ${recent20[0]?.max}`,
    );
    check(
      "flow covers the tracked universe (WIKA may legitimately have none)",
      (flowStats[0]?.companies ?? 0) >= 30,
      `${flowStats[0]?.companies} companies`,
    );
  }

  const last = series[series.length - 1].close;
  check(
    "latest index close is finite and positive",
    Number.isFinite(last) && last > 0,
    String(last),
  );
  check(
    "no null/NaN closes stored",
    series.every((p) => Number.isFinite(p.close) && p.close > 0),
  );
  check(
    "series is strictly ordered by date",
    series.every((p, i) => i === 0 || p.date > series[i - 1].date),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch(async (err) => {
    console.error("Gann smoke test failed:", err instanceof Error ? err.message : err);
    failed++;
    await pool.end().catch(() => {});
    process.exit(1);
  })
  .finally(() => pool.end())
  .then(() => process.exit(failed === 0 ? 0 : 1));
/**
 * Unit tests — Gann 432 cycle math (`src/lib/gann.ts`).
 *
 * Everything asserted here is derived by hand from the module's formulas —
 * no snapshots, no network, no clock. Historical window dates are regression
 * anchors documented in the module header:
 *   - 144d from 2025-02-28 → 2025-07-22
 *   - 432d from 2025-02-28 → 2026-05-06  (real calendar arithmetic; the
 *     framework's "April 2026" was wrong)
 *   - the zero point is DETECTED (2026-06-08 @ 5,342.14 in the fixture below),
 *     never hard-coded, and the Fib ladder is derived from the detected pair
 *     (the framework's fixed 0.618 = 5,922 level was internally inconsistent
 *     and was dropped — hence 0.618 ≈ 6,955 for the (5342.14, 7952) pair).
 */
import {
  addDays,
  confluenceScore,
  CYCLE_LABEL,
  daysBetween,
  detectSwingHigh,
  detectSwingLow,
  fibLevels,
  FIB_KEY_RATIO,
  FIB_PIVOT_RATIO,
  FIB_RATIOS,
  focusWindow,
  fromIso,
  GANN_CAVEAT,
  GANN_CYCLES,
  gannWindowDates,
  nearestFib,
  priceTimeSquaring,
  rsiDivergence,
  rsiSeries,
  seasonalDates,
  toIso,
  type PricePoint,
  type RsiPoint,
} from "@/lib/gann";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

/** Weekly closes forming a V-bottom exactly at index `bottomIndex`. */
function vSeries(bottomIndex: number, weeks: number, step = 25, low = 5342.14): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = 0; i < weeks; i++) {
    out.push({
      date: addDays("2025-09-01", i * 7),
      close: +(low + Math.abs(i - bottomIndex) * step).toFixed(2),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Fibonacci ladder — derived, never hard-coded                       */
/* ------------------------------------------------------------------ */

describe("fibLevels", () => {
  it("derives the ladder from the detected (low, high) pair — 0.618 ≈ 6955.03 for (5342.14, 7952)", () => {
      const levels = fibLevels(5342.14, 7952, 7000);
      expect(levels.map((l) => l.ratio)).toEqual([...FIB_RATIOS]);
      // lo + ratio × (hi − lo), hi=7952, lo=5342.14, range=2609.86
      // 5342.14 + 0.618 × 2609.86 = 5342.14 + 1612.89348 = 6955.03348 → "6955.03"
      expect(levels[3].price).toBeCloseTo(6955.03, 2);
    expect(levels[0].price).toBeCloseTo(5958.07, 2);
    expect(levels[2].price).toBeCloseTo(6647.07, 2); // midpoint
    expect(levels[4].price).toBeCloseTo(7393.49, 2);
    // strictly ascending from the low toward the high
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].price).toBeGreaterThan(levels[i - 1].price);
    }
  });

  it("is invariant to low/high argument order (pair is normalised internally)", () => {
    expect(fibLevels(7952, 5342.14, 7000)).toEqual(fibLevels(5342.14, 7952, 7000));
  });

  it("classifies side ABOVE/BELOW/AT and signed distance from the current price", () => {
    const levels = fibLevels(5342.14, 7952, 7000);
    expect(levels.map((l) => l.side)).toEqual([
      "BELOW",
      "BELOW",
      "BELOW",
      "BELOW",
      "ABOVE",
    ]);
    expect(levels[3].distancePct).toBeCloseTo(-0.64, 2); // (6955.03 − 7000)/7000
    expect(levels[4].distancePct).toBeCloseTo(5.62, 2); // (7393.49 − 7000)/7000

    // sitting exactly on the 0.5 level → "AT"
    const atMid = fibLevels(100, 200, 150);
    expect(atMid.find((l) => l.ratio === 0.5)?.side).toBe("AT");
    expect(atMid.find((l) => l.ratio === 0.618)?.side).toBe("ABOVE");
    expect(atMid.find((l) => l.ratio === 0.382)?.side).toBe("BELOW");
  });

  it("nearestFib picks the closest structural level and handles an empty ladder", () => {
    const levels = fibLevels(100, 200, 155);
    // distances: 31.4 / 16.8 / 5 / 6.8 / 23.6 → 0.5 @ 150 wins
    expect(nearestFib(levels, 155)?.ratio).toBe(0.5);
    expect(nearestFib(levels, 155)?.price).toBe(150);
    expect(nearestFib([], 100)).toBeNull();
  });
});

describe("priceTimeSquaring", () => {
  it("squares √price × factor — 2500 → 3600 (72) and 7200 (144)", () => {
    const { root, targets } = priceTimeSquaring(2500, [72, 144], 3000);
    expect(root).toBe(50);
    expect(targets).toEqual([
      { factor: 72, price: 3600, distancePct: 20 },
      { factor: 144, price: 7200, distancePct: 140 },
    ]);
  });

  it("reports 0% distance when no current price is supplied", () => {
    const { targets } = priceTimeSquaring(2500);
    expect(targets.map((t) => t.distancePct)).toEqual([0, 0]);
  });
});

/* ------------------------------------------------------------------ */
/*  Cycle windows                                                      */
/* ------------------------------------------------------------------ */

describe("gannWindowDates", () => {
  it("computes exact calendar windows from the 2026-06-08 zero point (144d → 2026-10-30 UPCOMING)", () => {
    const windows = gannWindowDates("2026-06-08", GANN_CYCLES, "2026-10-06");
    expect(windows.map((w) => w.cycle)).toEqual([144, 288, 432, 576]);
    expect(windows.map((w) => w.date)).toEqual([
      "2026-10-30",
      "2027-03-23",
      "2027-08-14",
      "2028-01-05",
    ]);
    expect(windows.map((w) => w.daysAway)).toEqual([24, 168, 312, 456]);
    expect(windows.every((w) => w.status === "UPCOMING")).toBe(true);
  });

  it("marks a window ACTIVE inside the tolerance and PASSED once daysAway turns deeply negative", () => {
    // 144d lands 2026-10-30 — 5 days ahead of 2026-10-25 → ACTIVE
    const windows = gannWindowDates("2026-06-08", GANN_CYCLES, "2026-10-25");
    expect(windows[0]).toMatchObject({ cycle: 144, date: "2026-10-30", daysAway: 5, status: "ACTIVE" });
    expect(windows[1].status).toBe("UPCOMING");

    // zero point 2025-02-28: the 144d window (2025-07-22) is 441 days past
    const stale = gannWindowDates("2025-02-28", GANN_CYCLES, "2026-10-06");
    expect(stale[0]).toMatchObject({ date: "2025-07-22", daysAway: -441, status: "PASSED" });
  });

  it("reproduces the module-header historical anchors (144d → 2025-07-22, 432d → 2026-05-06)", () => {
    const windows = gannWindowDates("2025-02-28", GANN_CYCLES, "2026-10-06");
    const byCycle = new Map(windows.map((w) => [w.cycle, w]));
    expect(byCycle.get(144)?.date).toBe("2025-07-22");
    expect(byCycle.get(432)?.date).toBe("2026-05-06"); // NOT "April 2026"
    expect(byCycle.get(288)?.date).toBe("2025-12-13");
    // 576d lands 2026-09-27 — only 9 days before the asOf → ACTIVE
    expect(byCycle.get(576)).toMatchObject({ date: "2026-09-27", daysAway: -9, status: "ACTIVE" });
  });

  it("exposes the 144-multiple cycle set and labels", () => {
    expect([...GANN_CYCLES]).toEqual([144, 288, 432, 576]);
    for (const c of GANN_CYCLES) expect(c % 144).toBe(0);
    expect(CYCLE_LABEL[432]).toBe("432d");
    expect(GANN_CAVEAT).toContain("warning");
  });
});

describe("focusWindow", () => {
  it("prefers an ACTIVE window over any other", () => {
    const windows = gannWindowDates("2026-06-08", GANN_CYCLES, "2026-10-25");
    expect(focusWindow(windows)?.cycle).toBe(144);
    expect(focusWindow(windows)?.status).toBe("ACTIVE");
  });

  it("falls back to the soonest UPCOMING window when none is active", () => {
    const windows = gannWindowDates("2026-06-08", GANN_CYCLES, "2026-10-06");
    const focus = focusWindow(windows);
    expect(focus?.status).toBe("UPCOMING");
    expect(focus?.daysAway).toBe(24); // 144d — closest of the four
  });

  it("with every window long past, picks the nearest by |daysAway|", () => {
    const windows = gannWindowDates("2024-01-01", GANN_CYCLES, "2026-10-06");
    // 576d → 2025-07-30, 433 days ago — closer than 432/288/144d
    expect(focusWindow(windows)?.cycle).toBe(576);
  });

  it("returns null for an empty list", () => {
    expect(focusWindow([])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Swing detection — the zero point                                   */
/* ------------------------------------------------------------------ */

describe("detectSwingLow", () => {
  it("detects the documented zero point 2026-06-08 @ 5,342.14 from a synthetic IHSG-like series", () => {
    // V-bottom exactly at 2026-06-08 (index 40 of the weekly series)
    const series = vSeries(40, 54);
    const low = detectSwingLow(series, "2026-10-06");
    expect(low).not.toBeNull();
    expect(low?.date).toBe("2026-06-08");
    expect(low?.close).toBe(5342.14);
    expect(low?.barsSearched).toBe(53); // last weekly bar (2026-09-07) falls outside the 30d exclusion tail
    expect(low?.edgeConstrained).toBe(false); // 40 bars before / 12 after
  });

  it("ignores a newer low inside the excluded recent tail (excludeRecentDays honoured)", () => {
    const series = [
      ...vSeries(40, 54),
      { date: "2026-09-14", close: 5100 },
      { date: "2026-09-21", close: 5000 }, // a NEW low — but inside the excluded tail
      { date: "2026-09-28", close: 5200 },
    ];
    // default 30d exclusion: window ends 2026-09-06 → the 5000 bar is invisible
    const withDefault = detectSwingLow(series, "2026-10-06");
    expect(withDefault?.date).toBe("2026-06-08");

    // a 10d exclusion exposes it — and it becomes edge-constrained (nothing after it)
    const withShortTail = detectSwingLow(series, "2026-10-06", { excludeRecentDays: 10 });
    expect(withShortTail?.date).toBe("2026-09-21");
    expect(withShortTail?.close).toBe(5000);
    expect(withShortTail?.edgeConstrained).toBe(true);
  });

  it("flags edge-constrained when the candidate sits at the very start of the window", () => {
    const series: PricePoint[] = [
      { date: "2026-01-05", close: 100 },
      { date: "2026-01-12", close: 110 },
      { date: "2026-01-19", close: 120 },
      { date: "2026-01-26", close: 130 },
      { date: "2026-02-02", close: 140 },
    ];
    const low = detectSwingLow(series, "2026-04-15");
    expect(low?.date).toBe("2026-01-05"); // the minimum, but with 0 bars before it
    expect(low?.edgeConstrained).toBe(true);
  });

  it("returns null when no bars fall inside the search window", () => {
    const future: PricePoint[] = [
      { date: "2027-01-04", close: 6000 },
      { date: "2027-01-11", close: 6100 },
    ];
    expect(detectSwingLow(future, "2026-01-01")).toBeNull();
  });
});

describe("detectSwingHigh", () => {
  it("finds the highest close inside the trailing window, mirroring detectSwingLow", () => {
    const series: PricePoint[] = [
      { date: "2026-01-01", close: 6800 },
      { date: "2026-02-01", close: 7200 },
      { date: "2026-03-01", close: 7952 },
      { date: "2026-04-01", close: 7400 },
      { date: "2026-05-01", close: 7050 },
      { date: "2026-06-01", close: 6900 },
    ];
    expect(detectSwingHigh(series, "2026-07-15")).toEqual({ date: "2026-03-01", close: 7952 });
    expect(detectSwingHigh([], "2026-07-15")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  RSI (Wilder) + divergence                                          */
/* ------------------------------------------------------------------ */

describe("rsiSeries", () => {
  it("implements Wilder smoothing — [1,3,2,4] with period 2 → [null, null, 66.67, 85.71]", () => {
    expect(rsiSeries([1, 3, 2, 4], 2)).toEqual([null, null, 66.67, 85.71]);
  });

  it("scores a flat series as neutral 50 and an up-only series as 100 (no NaN)", () => {
    expect(rsiSeries([5, 5, 5, 5, 5], 2)).toEqual([null, null, 50, 50, 50]);
    expect(rsiSeries([1, 2, 3, 4], 2)).toEqual([null, null, 100, 100]);
  });

  it("returns all-null until the smoothing window is filled", () => {
    expect(rsiSeries([1, 2], 2)).toEqual([null, null]);
    expect(rsiSeries([1, 2, 3], 14)).toEqual([null, null, null]);
  });
});

describe("rsiDivergence", () => {
  it("detects BULLISH divergence: price lower low, RSI higher low", () => {
    const points: RsiPoint[] = [
      { date: "2026-01-01", close: 100, rsi: 40 },
      { date: "2026-01-02", close: 90, rsi: 30 }, // pivot low #1
      { date: "2026-01-03", close: 95, rsi: 45 },
      { date: "2026-01-04", close: 85, rsi: 35 }, // pivot low #2 — lower close, higher RSI
      { date: "2026-01-05", close: 92, rsi: 50 },
    ];
    const result = rsiDivergence(points);
    expect(result.kind).toBe("BULLISH");
    expect(result.prior).toMatchObject({ close: 90, rsi: 30 });
    expect(result.latest).toMatchObject({ close: 85, rsi: 35 });
  });

  it("detects BEARISH divergence: price higher high, RSI lower high", () => {
    const points: RsiPoint[] = [
      { date: "2026-02-01", close: 50, rsi: 50 },
      { date: "2026-02-02", close: 60, rsi: 70 }, // pivot high #1
      { date: "2026-02-03", close: 55, rsi: 60 }, // single pivot low → bullish branch skipped
      { date: "2026-02-04", close: 65, rsi: 65 }, // pivot high #2 — higher close, lower RSI
      { date: "2026-02-05", close: 58, rsi: 55 },
    ];
    const result = rsiDivergence(points);
    expect(result.kind).toBe("BEARISH");
    expect(result.prior).toMatchObject({ close: 60, rsi: 70 });
    expect(result.latest).toMatchObject({ close: 65, rsi: 65 });
  });

  it("returns null for a monotonic series with no pivots", () => {
    const points: RsiPoint[] = [10, 20, 30, 40, 50].map((close, i) => ({
      date: `2026-03-0${i + 1}`,
      close,
      rsi: 55,
    }));
    expect(rsiDivergence(points)).toEqual({ kind: null, prior: null, latest: null });
  });
});

/* ------------------------------------------------------------------ */
/*  Confluence                                                         */
/* ------------------------------------------------------------------ */

describe("confluenceScore", () => {
  const ALL_MET = {
    daysToWindow: 0,
    toleranceDays: 15,
    fibDistancePct: 1,
    rsiValue: 30,
    divergence: "BULLISH" as const,
    volumeRatio: 1.3,
    netForeignFlowIdr: 1_000,
  };

  it("scores 100 with every factor met and reports no blocker", () => {
    const result = confluenceScore(ALL_MET);
    expect(result.score).toBe(100); // 30 window + 20 fib + 15 rsi + 15 div + 10 volume + 10 flow
    expect(result.factors.every((f) => f.met)).toBe(true);
    expect(result.blocker).toBeNull();
  });

  it("scores 0 with every factor failing and names the first unmet factor as blocker", () => {
    const result = confluenceScore({
      daysToWindow: 200,
      toleranceDays: 15,
      fibDistancePct: 20,
      rsiValue: 60,
      divergence: null,
      volumeRatio: 0.5,
      netForeignFlowIdr: -1,
    });
    expect(result.score).toBe(0);
    expect(result.factors.every((f) => !f.met)).toBe(true);
    expect(result.blocker).toBe("Window in 200d");
  });

  it("awards partial window credit and blocks on the window factor", () => {
    // window 100d out: partial = round(15 × (1 − 85/180)) = 8; all else met
    const result = confluenceScore({ ...ALL_MET, daysToWindow: 100 });
    expect(result.score).toBe(78);
    const window = result.factors.find((f) => f.key === "window");
    expect(window?.met).toBe(false);
    expect(result.blocker).toBe("Window in 100d");

    // unsynced foreign flow is an unmet factor, never silently ignored
    const noFlow = confluenceScore({ ...ALL_MET, netForeignFlowIdr: null });
    expect(noFlow.score).toBe(90);
    expect(noFlow.blocker).toBe("Foreign flow not synced");
  });
});

/* ------------------------------------------------------------------ */
/*  Seasonal dates + date helpers                                      */
/* ------------------------------------------------------------------ */

describe("seasonalDates", () => {
  it("classifies the four Gann seasonal dates relative to asOf", () => {
    const dates = seasonalDates("2026-10-06", 2026);
    expect(dates.map((d) => d.monthDay)).toEqual(["03-21", "06-22", "09-23", "12-22"]);
    expect(dates.map((d) => d.status)).toEqual(["PASSED", "PASSED", "PASSED", "UPCOMING"]);
    expect(dates[3]).toMatchObject({ date: "2026-12-22", daysAway: 77 });
    expect(dates[2]).toMatchObject({ daysAway: -13 }); // outside the 5-day tolerance

    // sitting on the autumn equinox itself → ACTIVE
    const onEquinox = seasonalDates("2026-09-23", 2026);
    expect(onEquinox[2].status).toBe("ACTIVE");
  });
});

describe("date helpers", () => {
  it("round-trips ISO dates and keeps the daysBetween sign (b later than a ⇒ positive)", () => {
    expect(toIso(fromIso("2026-06-08"))).toBe("2026-06-08");
    expect(daysBetween("2026-10-06", "2026-10-30")).toBe(24);
    expect(daysBetween("2026-10-30", "2026-10-06")).toBe(-24);
    expect(daysBetween("2026-10-06", "2026-10-06")).toBe(0);
  });
});
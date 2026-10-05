/**
 * Gann 432 cycle math for the IHSG anchor.
 *
 * Everything here is pure: it takes dates/prices and returns derived values.
 * No DB access and no Sectors calls — `src/db/sync.ts` fills `index_prices`,
 * and `src/db/queries.ts` feeds those rows in.
 *
 * ---------------------------------------------------------------------------
 * Why the zero point is DETECTED rather than hard-coded
 * ---------------------------------------------------------------------------
 * The original framework anchored the cycle on IHSG 6,270 (2025-02-28) as an
 * "absolute swing low". Live Sectors data (2026-10-04) contradicts that: IHSG
 * traded 6,787–7,952 for all of H2-2025, so Feb-2025 was a MINOR low. Counting
 * 144/288/432 days from it also produced windows that missed the real reversal:
 *
 *   144d -> 2025-07-22, IHSG 7,344.74  (mid-rally, marked nothing)
 *   432d -> 2026-05-06, IHSG 7,092.47  (33 days and ~25% above the real low)
 *
 * The actual low was 2026-06-08 @ 5,342.14. So the module detects the anchor
 * from stored data instead, and the cycle maths hang off whatever it finds.
 *
 * Two other corrections are encoded here:
 *   - 432 calendar days from 2025-02-28 is 2026-05-06, NOT "April 2026".
 *     `gannWindowDates` does real calendar arithmetic; no hand-waving.
 *   - The framework's hard-coded Fib pair (0.618 = 5,922 and 0.786 = 5,037) is
 *     internally inconsistent: it implies a 9,178 -> 3,910 swing that does not
 *     exist in IHSG history. `fibLevels` therefore DERIVES the ladder from a
 *     detected (high, low) pair and never accepts fixed price levels.
 */

/* ------------------------------------------------------------------ */
/*  Date helpers — all UTC, all YYYY-MM-DD                             */
/* ------------------------------------------------------------------ */

export const DAY_MS = 86_400_000;

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIso(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00Z`);
}

export function addDays(dateIso: string, days: number): string {
  return toIso(new Date(fromIso(dateIso).getTime() + days * DAY_MS));
}

/** Calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY_MS);
}

/* ------------------------------------------------------------------ */
/*  Cycle windows                                                      */
/* ------------------------------------------------------------------ */

/** 144 is the base unit; 288/432/576 are multiples. 43,200 (~decade) omitted. */
export const GANN_CYCLES = [144, 288, 432, 576] as const;
export type GannCycle = (typeof GANN_CYCLES)[number];

export const CYCLE_LABEL: Record<GannCycle, string> = {
  144: "144d",
  288: "288d",
  432: "432d",
  576: "576d",
};

/** Gann's own caution, surfaced verbatim in the UI so it is never lost. */
export const GANN_CAVEAT =
  "Time is a warning system, not a trigger. Treat every window as confirmation " +
  "to be cross-checked against volume, momentum and macro flow — never as a standalone signal.";

export type WindowStatus = "ACTIVE" | "UPCOMING" | "PASSED";

export interface GannWindow {
  cycle: GannCycle;
  /** Target date = zero point + cycle days (exact calendar arithmetic). */
  date: string;
  /** Days from `asOf` to the target; negative once the window has passed. */
  daysAway: number;
  status: WindowStatus;
}

export function gannWindowDates(
  zeroIso: string,
  cycles: readonly number[] = GANN_CYCLES,
  asOfIso: string,
  toleranceDays = 15,
): GannWindow[] {
  return cycles.map((cycle) => {
    const date = addDays(zeroIso, cycle);
    const daysAway = daysBetween(asOfIso, date);
    const status: WindowStatus =
      Math.abs(daysAway) <= toleranceDays
        ? "ACTIVE"
        : daysAway > 0
          ? "UPCOMING"
          : "PASSED";
    return { cycle: cycle as GannCycle, date, daysAway, status };
  });
}

/**
 * The window that matters right now: an ACTIVE one if any, otherwise the
 * soonest UPCOMING one. `null` only when every cycle is long past.
 */
export function focusWindow(windows: GannWindow[]): GannWindow | null {
  const sorted = [...windows].sort((a, b) => {
    // ACTIVE first, then by absolute proximity.
    if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : b.status === "ACTIVE" ? 1 : 0;
    return Math.abs(a.daysAway) - Math.abs(b.daysAway);
  });
  return sorted[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Swing detection — the zero point                                   */
/* ------------------------------------------------------------------ */

export interface PricePoint {
  date: string;
  close: number;
}

export interface SwingLow {
  date: string;
  close: number;
  /** trading bars in the searched window */
  barsSearched: number;
  /** true when the candidate is too close to an edge to trust as a swing */
  edgeConstrained: boolean;
}

export interface DetectSwingOptions {
  /** how far back to search for the low (calendar days) */
  lookbackDays?: number;
  /** ignore the most recent N days so an in-progress move can't become the anchor */
  excludeRecentDays?: number;
  /** require at least this many trading bars on either side of the candidate */
  minBarsEachSide?: number;
}

/**
 * Lowest close in the trailing window, excluding the recent tail.
 *
 * Defaults search 400 calendar days ending 30 days before `asOf`, and require
 * 5 trading bars on each side of the candidate. The edge requirement matters:
 * the lowest close in a series that is still making new lows is usually the
 * current bar, and anchoring a cycle on that guarantees the window is "now".
 */
export function detectSwingLow(
  series: PricePoint[],
  asOfIso: string,
  opts: DetectSwingOptions = {},
): SwingLow | null {
  const { lookbackDays = 400, excludeRecentDays = 30, minBarsEachSide = 5 } = opts;

  const windowStart = addDays(asOfIso, -lookbackDays);
  const windowEnd = addDays(asOfIso, -excludeRecentDays);

  const window = series
    .filter((p) => p.date >= windowStart && p.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (window.length === 0) return null;

  let bestIdx = -1;
  for (let i = 0; i < window.length; i++) {
    if (bestIdx === -1 || window[i].close < window[bestIdx].close) bestIdx = i;
  }

  const barsBefore = bestIdx;
  const barsAfter = window.length - 1 - bestIdx;
  const edgeConstrained = barsBefore < minBarsEachSide || barsAfter < minBarsEachSide;

  return {
    date: window[bestIdx].date,
    close: window[bestIdx].close,
    barsSearched: window.length,
    edgeConstrained,
  };
}

/** Highest close in the trailing window; mirrors `detectSwingLow`. */
export function detectSwingHigh(
  series: PricePoint[],
  asOfIso: string,
  opts: DetectSwingOptions = {},
): PricePoint | null {
  const { lookbackDays = 400, excludeRecentDays = 30 } = opts;
  const windowStart = addDays(asOfIso, -lookbackDays);
  const windowEnd = addDays(asOfIso, -excludeRecentDays);

  const window = series
    .filter((p) => p.date >= windowStart && p.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  let best: PricePoint | null = null;
  for (const p of window) if (!best || p.close > best.close) best = p;
  return best;
}

/* ------------------------------------------------------------------ */
/*  Fibonacci ladder — DERIVED, never hard-coded                       */
/* ------------------------------------------------------------------ */

export const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786] as const;
export type FibRatio = (typeof FIB_RATIOS)[number];

/** The framework treats 0.786 as the "last stop before a major downtrend". */
export const FIB_KEY_RATIO = 0.786;
export const FIB_PIVOT_RATIO = 0.618;

export interface FibLevel {
  ratio: FibRatio;
  price: number;
  /** signed % from `price` to this level (negative = level sits below price) */
  distancePct: number;
  /** which side of the level the market currently sits on */
  side: "ABOVE" | "BELOW" | "AT";
}

/**
 * Retracement ladder measured upward from the swing low toward the swing high.
 *
 * `ratio` is the fraction of the range recovered from the low, so 0.618 is a
 * 61.8% pullback-recovery level. Levels are computed from the pair actually
 * detected in the data — see the module header for why hard-coded levels were
 * dropped.
 */
export function fibLevels(
  swingLowPrice: number,
  swingHighPrice: number,
  currentPrice: number,
): FibLevel[] {
  const hi = Math.max(swingLowPrice, swingHighPrice);
  const lo = Math.min(swingLowPrice, swingHighPrice);
  const range = hi - lo;

  return FIB_RATIOS.map((ratio) => {
    const price = +(lo + ratio * range).toFixed(2);
    const distancePct = +(((price - currentPrice) / currentPrice) * 100).toFixed(2);
    const side: FibLevel["side"] =
      Math.abs(price - currentPrice) / currentPrice < 0.002
        ? "AT"
        : price > currentPrice
          ? "ABOVE"
          : "BELOW";
    return { ratio, price, distancePct, side };
  });
}

/** Closest ladder level to the current price, plus the two structural ones. */
export function nearestFib(levels: FibLevel[], currentPrice: number): FibLevel | null {
  if (levels.length === 0) return null;
  return levels.reduce((best, l) =>
    Math.abs(l.price - currentPrice) < Math.abs(best.price - currentPrice) ? l : best,
  );
}

/* ------------------------------------------------------------------ */
/*  Price-time squaring                                                */
/* ------------------------------------------------------------------ */

export interface SquaringTarget {
  factor: number;
  price: number;
  distancePct: number;
}

/**
 * √(low) × factor. Gann's square-root-of-price targets.
 * Factors 72 and 144 are the ones the framework calls out (support, then the
 * long-horizon bull target).
 */
export function priceTimeSquaring(
  lowPrice: number,
  factors: readonly number[] = [72, 144],
  currentPrice?: number,
): { root: number; targets: SquaringTarget[] } {
  const root = +Math.sqrt(lowPrice).toFixed(2);
  const targets = factors.map((factor) => {
    const price = +(root * factor).toFixed(2);
    const distancePct =
      currentPrice && currentPrice > 0
        ? +(((price - currentPrice) / currentPrice) * 100).toFixed(2)
        : 0;
    return { factor, price, distancePct };
  });
  return { root, targets };
}

/* ------------------------------------------------------------------ */
/*  Gann seasonal dates                                                */
/* ------------------------------------------------------------------ */

export interface SeasonalDate {
  /** MM-DD */
  monthDay: string;
  date: string;
  label: string;
  daysAway: number;
  status: "PASSED" | "ACTIVE" | "UPCOMING";
}

/** 21 Mar (spring equinox), 22 Jun (solstice), 23 Sep, 22 Dec. */
export const SEASONAL_MONTH_DAYS = [
  { monthDay: "03-21", label: "Spring equinox" },
  { monthDay: "06-22", label: "Summer solstice" },
  { monthDay: "09-23", label: "Autumn equinox" },
  { monthDay: "12-22", label: "Winter solstice" },
] as const;

export function seasonalDates(asOfIso: string, year: number, toleranceDays = 5): SeasonalDate[] {
  return SEASONAL_MONTH_DAYS.map(({ monthDay, label }) => {
    const date = `${year}-${monthDay}`;
    const daysAway = daysBetween(asOfIso, date);
    const status: SeasonalDate["status"] =
      Math.abs(daysAway) <= toleranceDays ? "ACTIVE" : daysAway > 0 ? "UPCOMING" : "PASSED";
    return { monthDay, date, label, daysAway, status };
  });
}

/* ------------------------------------------------------------------ */
/*  RSI (Wilder) + divergence — computed from synced prices, 0 credits */
/* ------------------------------------------------------------------ */

export interface RsiPoint {
  date: string;
  close: number;
  /** null until the smoothing window is filled */
  rsi: number | null;
}

/**
 * Wilder's RSI. Returns one entry per input bar; the first `period` entries
 * are null because there is not enough history to average yet.
 */
export function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAverages(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  // A flat/up-only stretch has no losses; RSI is 100 by definition, not NaN.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

export function rsiWithDates(series: PricePoint[], period = 14): RsiPoint[] {
  const rsi = rsiSeries(
    series.map((p) => p.close),
    period,
  );
  return series.map((p, i) => ({ date: p.date, close: p.close, rsi: rsi[i] }));
}

export type DivergenceKind = "BULLISH" | "BEARISH" | null;

export interface DivergenceResult {
  kind: DivergenceKind;
  /** price/RSI values at the two pivots that produced the signal */
  prior: { date: string; close: number; rsi: number } | null;
  latest: { date: string; close: number; rsi: number } | null;
}

/** Local minima in price (close lower than both neighbours), RSI-aware. */
function pivots(points: RsiPoint[]): { date: string; close: number; rsi: number }[] {
  const out: { date: string; close: number; rsi: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const value = p.rsi;
    if (value === null) continue;
    if (p.close < points[i - 1].close && p.close < points[i + 1].close) {
      out.push({ date: p.date, close: p.close, rsi: value });
    }
  }
  return out;
}

/**
 * Classic bullish/bearish RSI divergence over the last two price pivots.
 *
 * Bullish = price prints a LOWER low while RSI prints a HIGHER low. This is the
 * "RSI divergence" confirmation the framework asks for; it is a *filter*, never
 * a trigger on its own.
 */
export function rsiDivergence(points: RsiPoint[], lookback = 60): DivergenceResult {
  const window = points.slice(-lookback);
  const lows = pivots(window);
  const highs: { date: string; close: number; rsi: number }[] = [];
  for (let i = 1; i < window.length - 1; i++) {
    const p = window[i];
    const value = p.rsi;
    if (value === null) continue;
    if (p.close > window[i - 1].close && p.close > window[i + 1].close) {
      highs.push({ date: p.date, close: p.close, rsi: value });
    }
  }

  if (lows.length >= 2) {
    const prior = lows[lows.length - 2];
    const latest = lows[lows.length - 1];
    if (latest.close < prior.close && latest.rsi > prior.rsi) {
      return { kind: "BULLISH", prior, latest };
    }
  }
  if (highs.length >= 2) {
    const prior = highs[highs.length - 2];
    const latest = highs[highs.length - 1];
    if (latest.close > prior.close && latest.rsi < prior.rsi) {
      return { kind: "BEARISH", prior, latest };
    }
  }
  return { kind: null, prior: null, latest: null };
}

/* ------------------------------------------------------------------ */
/*  Confluence — the confirmation layer the framework asks for        */
/* ------------------------------------------------------------------ */

export interface ConfluenceInput {
  /** signed days to the focus window (negative = passed) */
  daysToWindow: number;
  /** proximity tolerance in days; inside this the window counts as active */
  toleranceDays: number;
  /** % from current price to the structural Fib support (negative = below) */
  fibDistancePct: number;
  rsiValue: number | null;
  divergence: DivergenceKind;
  /** 5d avg volume / prior 20d avg volume; 1 = neutral */
  volumeRatio: number;
  /** 20-day net foreign flow in IDR; null when not synced */
  netForeignFlowIdr: number | null;
}

export interface ConfluenceResult {
  /** 0..100 */
  score: number;
  /** ordered factor list for the UI */
  factors: { key: string; met: boolean; detail: string }[];
  /** the single strongest unmet reason, or null when everything lines up */
  blocker: string | null;
}

/**
 * Combines window proximity, Fib position, RSI/divergence, volume and foreign
 * flow into one 0..100 readability number.
 *
 * This deliberately reports *alignment*, not a trade instruction. Each factor
 * contributes independently so the UI can show which leg is missing.
 */
export function confluenceScore(input: ConfluenceInput): ConfluenceResult {
  const factors: { key: string; met: boolean; detail: string }[] = [];
  let score = 0;

  // 1. Window proximity — 30 pts, full marks inside tolerance.
  if (Math.abs(input.daysToWindow) <= input.toleranceDays) {
    score += 30;
    factors.push({ key: "window", met: true, detail: `Window active (${input.daysToWindow >= 0 ? "in" : ""} ${Math.abs(input.daysToWindow)}d)` });
  } else {
    const dist = Math.abs(input.daysToWindow) - input.toleranceDays;
    const partial = Math.max(0, Math.round(15 * (1 - Math.min(1, dist / 180))));
    score += partial;
    factors.push({
      key: "window",
      met: false,
      detail: input.daysToWindow > 0 ? `Window in ${input.daysToWindow}d` : `Window ${Math.abs(input.daysToWindow)}d past`,
    });
  }

  // 2. Fib support proximity — 20 pts within 3% of the structural level.
  const fibDist = Math.abs(input.fibDistancePct);
  if (fibDist <= 3) {
    score += 20;
    factors.push({ key: "fib", met: true, detail: `${input.fibDistancePct.toFixed(1)}% from Fib 0.618` });
  } else if (fibDist <= 10) {
    score += 10;
    factors.push({ key: "fib", met: false, detail: `${input.fibDistancePct.toFixed(1)}% from Fib 0.618` });
  } else {
    factors.push({ key: "fib", met: false, detail: `${input.fibDistancePct.toFixed(1)}% from Fib 0.618` });
  }

  // 3. RSI — 15 pts for an oversold-or-turning reading.
  if (input.rsiValue !== null) {
    if (input.rsiValue <= 35) {
      score += 15;
      factors.push({ key: "rsi", met: true, detail: `RSI ${input.rsiValue.toFixed(0)} oversold` });
    } else if (input.rsiValue <= 45) {
      score += 8;
      factors.push({ key: "rsi", met: false, detail: `RSI ${input.rsiValue.toFixed(0)} weak` });
    } else {
      factors.push({ key: "rsi", met: false, detail: `RSI ${input.rsiValue.toFixed(0)} extended` });
    }
  } else {
    factors.push({ key: "rsi", met: false, detail: "RSI unavailable" });
  }

  // 4. Divergence — 15 pts.
  if (input.divergence === "BULLISH") {
    score += 15;
    factors.push({ key: "divergence", met: true, detail: "Bullish RSI divergence" });
  } else if (input.divergence === "BEARISH") {
    factors.push({ key: "divergence", met: false, detail: "Bearish RSI divergence" });
  } else {
    factors.push({ key: "divergence", met: false, detail: "No divergence" });
  }

  // 5. Volume — 10 pts when participation is above its recent baseline.
  if (input.volumeRatio >= 1.2) {
    score += 10;
    factors.push({ key: "volume", met: true, detail: `Volume ${input.volumeRatio.toFixed(2)}× baseline` });
  } else if (input.volumeRatio >= 1) {
    score += 5;
    factors.push({ key: "volume", met: false, detail: `Volume ${input.volumeRatio.toFixed(2)}× baseline` });
  } else {
    factors.push({ key: "volume", met: false, detail: `Volume ${input.volumeRatio.toFixed(2)}× baseline (thin)` });
  }

  // 6. Foreign flow — 10 pts, only when the dataset was actually synced.
  if (input.netForeignFlowIdr === null) {
    factors.push({ key: "flow", met: false, detail: "Foreign flow not synced" });
  } else if (input.netForeignFlowIdr > 0) {
    score += 10;
    factors.push({ key: "flow", met: true, detail: "Net foreign inflow" });
  } else {
    factors.push({ key: "flow", met: false, detail: "Net foreign outflow" });
  }

  const blocker = factors.find((f) => !f.met)?.detail ?? null;
  return { score: Math.max(0, Math.min(100, score)), factors, blocker };
}
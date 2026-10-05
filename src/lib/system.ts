/* ------------------------------------------------------------------ */
/*  2030 Execution Clock — product constants                           */
/* ------------------------------------------------------------------ */

export const SYSTEM_DATE = new Date("2026-09-28T00:00:00Z");
export const AGENDA_ADOPTED = new Date("2015-09-25T00:00:00Z");
export const DEADLINE_2030 = new Date("2030-12-31T00:00:00Z");

export const DAYS_TO_2030 = Math.round(
  (DEADLINE_2030.getTime() - SYSTEM_DATE.getTime()) / 86_400_000,
); // 1555
export const MONTHS_TO_2030 = +(DAYS_TO_2030 / 30.44).toFixed(1);
export const YEARS_TO_2030 = +(DAYS_TO_2030 / 365.25).toFixed(2);

/* ------------------------------------------------------------------ */
/*  Execution stage taxonomy (PRD §10)                                 */
/* ------------------------------------------------------------------ */

export const STAGES = [
  "SIGNAL",
  "INTENT",
  "COMMITTED",
  "CONTRACTED",
  "EXECUTING",
  "OPERATIONAL",
  "MEASURED",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<
  Stage,
  { idx: number; label: string; color: string; blurb: string }
> = {
  SIGNAL: {
    idx: 0,
    label: "Signal",
    color: "#8A94A6",
    blurb: "Weak indication only",
  },
  INTENT: {
    idx: 1,
    label: "Intent",
    color: "#C9D1E0",
    blurb: "Explicit company intention",
  },
  COMMITTED: {
    idx: 2,
    label: "Committed",
    color: "#5FA8D3",
    blurb: "Budgeted / approved commitment",
  },
  CONTRACTED: {
    idx: 3,
    label: "Contracted",
    color: "#FF9F2E",
    blurb: "Commercial / legal commitment",
  },
  EXECUTING: {
    idx: 4,
    label: "Executing",
    color: "#F25C5C",
    blurb: "Implementation underway",
  },
  OPERATIONAL: {
    idx: 5,
    label: "Operational",
    color: "#39C06A",
    blurb: "Activity is operating",
  },
  MEASURED: {
    idx: 6,
    label: "Measured",
    color: "#00B3A4",
    blurb: "Outcome evidence exists",
  },
};

export const TIMING_CLASSES = [
  "EARLY",
  "ACTIVE",
  "CRITICAL",
  "LATE",
  "COMPLETED",
] as const;
export type TimingClass = (typeof TIMING_CLASSES)[number];

export const TIMING_META: Record<
  TimingClass,
  { label: string; color: string; blurb: string }
> = {
  EARLY: {
    label: "Early",
    color: "#8FB8FF",
    blurb: "Large execution runway remains",
  },
  ACTIVE: {
    label: "Active",
    color: "#39C06A",
    blurb: "Implementation window is open",
  },
  CRITICAL: {
    label: "Critical",
    color: "#FFB224",
    blurb: "Material evidence, deadline closing",
  },
  LATE: {
    label: "Late",
    color: "#F25C5C",
    blurb: "Limited remaining runway",
  },
  COMPLETED: {
    label: "Completed",
    color: "#00B3A4",
    blurb: "Documented completion exists",
  },
};

export const SIGNAL_TYPES = [
  "SDG Business Event",
  "SDG Investment Signal",
  "SDG Contract Signal",
  "SDG Execution Signal",
  "SDG Completion Signal",
  "2030 Timing Signal",
  "Market Confirmation",
  "SDG–Market Divergence",
  "Stage Transition",
  "Sector SDG Momentum",
] as const;

/* 2030 operating windows (PRD §8 — system heuristics, not UN phases) */
export const EXECUTION_WINDOWS = [
  { period: "2026–Q1 2027", label: "Discovery / intent / preparation", start: "2025-10-01", end: "2027-03-31" },
  { period: "Q2–Q4 2027", label: "Planning / financing / partners", start: "2027-04-01", end: "2027-12-31" },
  { period: "2028", label: "Procurement / implementation / scaling", start: "2028-01-01", end: "2028-12-31" },
  { period: "2029", label: "Acceleration / gap closure", start: "2029-01-01", end: "2029-12-31" },
  { period: "2030", label: "Delivery / completion / verification", start: "2030-01-01", end: "2030-12-31" },
] as const;

export function parseDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function monthsTo(dateStr: string | Date | null): number | null {
  if (!dateStr) return null;
  return +(daysBetween(SYSTEM_DATE, parseDate(dateStr)) / 30.44).toFixed(1);
}

export function runwayTo2030(completion: string | Date | null): number | null {
  if (!completion) return null;
  const c = parseDate(completion);
  const runway = daysBetween(c, DEADLINE_2030);
  return +(runway / 30.44).toFixed(1); // months of headroom before 2030
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

export function fmtDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const d = parseDate(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtMonth(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const d = parseDate(dateStr);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtIdr(billions: number | null | undefined): string {
  if (billions === null || billions === undefined) return "—";
  if (billions >= 1_000_000)
    return `Rp ${(billions / 1_000_000).toFixed(2)}Q`;
  if (billions >= 1_000) return `Rp ${(billions / 1_000).toFixed(1)}T`;
  return `Rp ${billions}B`;
}

export function fmtPct(v: number, signed = true): string {
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export function fmtPrice(v: number): string {
  return v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export function fmtVol(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return `${v}`;
}

export function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

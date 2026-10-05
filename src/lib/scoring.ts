import {
  SYSTEM_DATE,
  DEADLINE_2030,
  STAGE_META,
  Stage,
  TimingClass,
  parseDate,
  daysBetween,
} from "./system";

/* ------------------------------------------------------------------ */
/*  2030 Execution Timing Score (PRD §12)                              */
/*  Max 100 = stage 25 + time 20 + commitment 20 + lead-time 15        */
/*            + proximity 10 + recency 10                              */
/* ------------------------------------------------------------------ */

export interface TimingInput {
  stage: Stage;
  stageConfidence: number; // 0..1
  expectedCompletionDate: string | null; // ISO date
  plannedStartDate: string | null;
  eventDate: string; // ISO
  targetYear: number | null;
}

export interface TimingBreakdown {
  total: number;
  stagePoints: number;
  timePoints: number;
  commitmentPoints: number;
  leadTimePoints: number;
  proximityPoints: number;
  recencyPoints: number;
}

const STAGE_POINTS: Record<Stage, number> = {
  SIGNAL: 6,
  INTENT: 10,
  COMMITTED: 15,
  CONTRACTED: 19,
  EXECUTING: 23,
  OPERATIONAL: 20,
  MEASURED: 25,
};

export function computeTimingScore(input: TimingInput): TimingBreakdown {
  const stagePoints = STAGE_POINTS[input.stage];

  /* time remaining — completion inside the window scores higher */
  let timePoints = 6;
  const comp = input.expectedCompletionDate
    ? parseDate(input.expectedCompletionDate)
    : null;
  if (comp) {
    const months = daysBetween(SYSTEM_DATE, comp) / 30.44;
    if (months <= 0) timePoints = 12; // already due/operational
    else if (months <= 24) timePoints = 20;
    else if (months <= 38) timePoints = 18;
    else if (months <= 51) timePoints = 14;
    else timePoints = 8;
  } else if (input.targetYear && input.targetYear <= 2030) {
    timePoints = 12;
  } else if (input.stage === "OPERATIONAL" || input.stage === "MEASURED") {
    timePoints = 11;
  }

  const commitmentPoints = Math.round(input.stageConfidence * 20);

  /* project lead-time: work that physically fits before 2030 scores high */
  let leadTimePoints = 4;
  if (comp) {
    const months = daysBetween(SYSTEM_DATE, comp) / 30.44;
    if (months >= 3 && months <= 40) leadTimePoints = 15;
    else if (months <= 3) leadTimePoints = 12;
    else if (months <= 51) leadTimePoints = 9;
  } else if (input.stage === "EXECUTING") {
    leadTimePoints = 12;
  } else if (
    input.stage === "OPERATIONAL" ||
    input.stage === "MEASURED"
  ) {
    leadTimePoints = 10;
  } else if (input.stage === "CONTRACTED") {
    leadTimePoints = 9;
  }

  /* deadline proximity — how much of the remaining window the plan consumes */
  let proximityPoints = 5;
  if (comp) {
    const runway = daysBetween(comp, DEADLINE_2030) / 30.44;
    if (runway >= 18 && runway <= 44) proximityPoints = 10;
    else if (runway > 44) proximityPoints = 7;
    else if (runway >= 0) proximityPoints = 8;
    else proximityPoints = 4; // past deadline claim
  } else if (
    input.stage === "OPERATIONAL" ||
    input.stage === "MEASURED"
  ) {
    proximityPoints = 6;
  }

  /* evidence recency */
  const ageDays = daysBetween(parseDate(input.eventDate), SYSTEM_DATE);
  let recencyPoints = 4;
  if (ageDays <= 90) recencyPoints = 10;
  else if (ageDays <= 180) recencyPoints = 8;
  else if (ageDays <= 365) recencyPoints = 6;

  const total = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        stagePoints +
          timePoints +
          commitmentPoints +
          leadTimePoints +
          proximityPoints +
          recencyPoints,
      ),
    ),
  );

  return {
    total,
    stagePoints,
    timePoints,
    commitmentPoints,
    leadTimePoints,
    proximityPoints,
    recencyPoints,
  };
}

/* ------------------------------------------------------------------ */
/*  Timing class (PRD §16)                                             */
/* ------------------------------------------------------------------ */

export function deriveTimingClass(
  stage: Stage,
  expectedCompletionDate: string | null,
  timingScore: number,
): TimingClass {
  if (stage === "OPERATIONAL" || stage === "MEASURED") return "COMPLETED";
  const comp = expectedCompletionDate ? parseDate(expectedCompletionDate) : null;
  if (comp) {
    const months = daysBetween(SYSTEM_DATE, comp) / 30.44;
    if (months <= 15) return timingScore >= 55 ? "CRITICAL" : "LATE";
    if (months <= 40)
      return stage === "EXECUTING" || stage === "CONTRACTED"
        ? "ACTIVE"
        : timingScore >= 60
          ? "ACTIVE"
          : "EARLY";
    return "EARLY";
  }
  if (timingScore >= 62) return "ACTIVE";
  if (timingScore >= 45) return "EARLY";
  return "EARLY";
}

/* ------------------------------------------------------------------ */
/*  Market signal score (deterministic, from Sectors-style data)       */
/* ------------------------------------------------------------------ */

export function computeMarketScore(args: {
  volumeRatio20d: number; // event/near volume vs 20d average
  priceChange20d: number; // %
  relativeStrength: number; // % vs sector
}): number {
  const vol = Math.min(45, Math.max(0, ((args.volumeRatio20d - 0.8) / 2.4) * 45));
  const price = Math.min(30, Math.max(0, ((args.priceChange20d + 6) / 18) * 30));
  const rs = Math.min(25, Math.max(0, ((args.relativeStrength + 8) / 16) * 25));
  return Math.round(Math.min(100, Math.max(0, vol + price + rs)));
}

/* ------------------------------------------------------------------ */
/*  Signal confluence (PRD §22)                                        */
/* ------------------------------------------------------------------ */

export interface ConfluenceInput {
  sdgEvidence: number; // 0..100
  businessEvent: number; // extraction confidence 0..100
  stage: Stage;
  timing: number; // 0..100
  market: number; // 0..100
  relativeStrength: number; // %
  sourceTier: number; // 1..4
}

export interface ConfluenceRow {
  component: string;
  metricName: string;
  weight: number;
  contribution: number;
  metricValue: string;
  benchmarkValue: string;
  explanation: string;
}

export function computeConfluence(input: ConfluenceInput): {
  strength: number;
  rows: ConfluenceRow[];
} {
  const stageNorm = (STAGE_META[input.stage].idx / 6) * 100;
  const relPerf = Math.min(100, Math.max(0, ((input.relativeStrength + 8) / 16) * 100));
  const sourcePts = [5, 4, 3, 2][Math.min(4, Math.max(1, input.sourceTier)) - 1]; // max 5

  const defs: Omit<ConfluenceRow, "explanation">[] = [
    {
      component: "SDG Evidence",
      metricName: "Target-mapping evidence score",
      weight: 25,
      contribution: (input.sdgEvidence / 100) * 25,
      metricValue: `${input.sdgEvidence}/100`,
      benchmarkValue: "≥85 high-evidence band",
    },
    {
      component: "Business Event",
      metricName: "Extraction confidence × specificity",
      weight: 20,
      contribution: (input.businessEvent / 100) * 20,
      metricValue: `${input.businessEvent}/100`,
      benchmarkValue: "dated, sourced, monetised",
    },
    {
      component: "Execution Stage",
      metricName: "Lifecycle maturity",
      weight: 15,
      contribution: (stageNorm / 100) * 15,
      metricValue: `${input.stage}`,
      benchmarkValue: "CONTRACTED+ preferred",
    },
    {
      component: "2030 Timing",
      metricName: "Execution timing score",
      weight: 15,
      contribution: (input.timing / 100) * 15,
      metricValue: `${input.timing}/100`,
      benchmarkValue: "≥75 strong window",
    },
    {
      component: "Market Context",
      metricName: "Volume & price response",
      weight: 10,
      contribution: (input.market / 100) * 10,
      metricValue: `${input.market}/100`,
      benchmarkValue: "Sectors validation",
    },
    {
      component: "Relative Performance",
      metricName: "20D return vs sector",
      weight: 10,
      contribution: (relPerf / 100) * 10,
      metricValue: `${input.relativeStrength.toFixed(1)}%`,
      benchmarkValue: "+0% = sector-neutral",
    },
    {
      component: "Source Quality",
      metricName: "Source-evidence tier",
      weight: 5,
      contribution: sourcePts,
      metricValue: `Tier ${input.sourceTier}`,
      benchmarkValue: "Tier 1 = official disclosure",
    },
  ];

  const rows = defs.map((d) => ({
    ...d,
    contribution: +d.contribution.toFixed(1),
    explanation: `${d.weight}pt weight · contributes ${d.contribution.toFixed(1)} pts`,
  }));

  const strength = Math.round(rows.reduce((s, r) => s + r.contribution, 0));
  return { strength: Math.min(100, strength), rows };
}

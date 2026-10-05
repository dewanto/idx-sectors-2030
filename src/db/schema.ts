import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  date,
  doublePrecision,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  UN SDG framework                                                   */
/* ------------------------------------------------------------------ */

export const sdgGoals = pgTable("sdg_goals", {
  id: serial("id").primaryKey(),
  goalNumber: integer("goal_number").notNull().unique(),
  title: text("title").notNull(),
  shortTitle: text("short_title").notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  description: text("description").notNull(),
  sourceUrl: text("source_url").notNull(),
});

export const sdgTargets = pgTable(
  "sdg_targets",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id")
      .notNull()
      .references(() => sdgGoals.id),
    targetCode: varchar("target_code", { length: 12 }).notNull().unique(),
    title: text("title").notNull(),
    keywords: text("keywords").array().notNull().default([]),
    sourceUrl: text("source_url").notNull(),
  },
  (t) => [index("sdg_targets_goal_idx").on(t.goalId)],
);

/* ------------------------------------------------------------------ */
/*  Company universe (Sectors registry)                                */
/* ------------------------------------------------------------------ */

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  ticker: varchar("ticker", { length: 10 }).notNull().unique(),
  companyName: text("company_name").notNull(),
  sector: varchar("sector", { length: 40 }).notNull(),
  industry: varchar("industry", { length: 60 }).notNull(),
  exchange: varchar("exchange", { length: 10 }).notNull().default("IDX"),
  marketCapIdr: bigint("market_cap_idr", { mode: "number" }).notNull(), // billions IDR
  basePrice: doublePrecision("base_price").notNull(),
  isActive: integer("is_active").notNull().default(1),
});

export const companyFundamentals = pgTable("company_fundamentals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id)
    .unique(),
  reportDate: date("report_date").notNull(),
  epsGrowth: doublePrecision("eps_growth").notNull(), // %
  revenueGrowth: doublePrecision("revenue_growth").notNull(), // %
  dividendYield: doublePrecision("dividend_yield").notNull(), // %
  note: text("note").notNull(),
});

/* ------------------------------------------------------------------ */
/*  Business events (news-derived)                                     */
/* ------------------------------------------------------------------ */

export const businessEvents = pgTable(
  "business_events",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    eventType: varchar("event_type", { length: 24 }).notNull(), // INVESTMENT | CONTRACT | EXPANSION | PARTNERSHIP | PROJECT | LAUNCH | TRANSITION | FINANCING
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    eventDate: date("event_date").notNull(),
    stage: varchar("stage", { length: 14 }).notNull(), // SIGNAL..MEASURED
    stageConfidence: doublePrecision("stage_confidence").notNull(), // 0..1
    investmentAmountIdr: bigint("investment_amount_idr", { mode: "number" }), // billions IDR
    capacity: text("capacity"),
    location: text("location"),
    counterparty: text("counterparty"),
    project: text("project"),
    plannedStartDate: date("planned_start_date"),
    expectedCompletionDate: date("expected_completion_date"),
    targetYear: integer("target_year"),
    timingClass: varchar("timing_class", { length: 12 }).notNull(), // EARLY|ACTIVE|CRITICAL|LATE|COMPLETED
    timingScore: integer("timing_score").notNull(),
    classificationVersion: varchar("classification_version", { length: 12 })
      .notNull()
      .default("timeline.v1"),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTier: integer("source_tier").notNull(), // 1..4
    claimType: varchar("claim_type", { length: 24 }).notNull(), // FACT | COMPANY_CLAIM | THIRD_PARTY_CLAIM | ANALYST_INTERPRETATION
    evidenceText: text("evidence_text").notNull(),
    extractionConfidence: doublePrecision("extraction_confidence").notNull(),
    businessImpact: text("business_impact").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("business_events_company_idx").on(t.companyId),
    index("business_events_date_idx").on(t.eventDate),
    index("business_events_stage_idx").on(t.stage),
  ],
);

export const eventSdgMappings = pgTable(
  "event_sdg_mappings",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => businessEvents.id),
    goalId: integer("goal_id")
      .notNull()
      .references(() => sdgGoals.id),
    targetId: integer("target_id").references(() => sdgTargets.id),
    relationshipType: varchar("relationship_type", { length: 16 }).notNull(), // DIRECT|INDIRECT|ASPIRATIONAL
    evidenceScore: integer("evidence_score").notNull(), // 0..100
    mappingConfidence: doublePrecision("mapping_confidence").notNull(),
    mappingVersion: varchar("mapping_version", { length: 12 }).notNull().default("sdg.v1"),
    reasoning: text("reasoning").notNull(),
  },
  (t) => [index("event_mappings_event_idx").on(t.eventId)],
);

/* ------------------------------------------------------------------ */
/*  Market data (Sectors)                                              */
/* ------------------------------------------------------------------ */

export const marketPrices = pgTable(
  "market_prices",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    tradingDate: date("trading_date").notNull(),
    close: doublePrecision("close").notNull(),
    volume: bigint("volume", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("market_prices_company_date_uniq").on(
      t.companyId,
      t.tradingDate,
    ),
  ],
);

export const marketSnapshots = pgTable("market_context_snapshots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id)
    .unique(),
  snapshotDate: date("snapshot_date").notNull(),
  priceChange5d: doublePrecision("price_change_5d").notNull(),
  priceChange20d: doublePrecision("price_change_20d").notNull(),
  priceChange30d: doublePrecision("price_change_30d").notNull(),
  volumeRatio20d: doublePrecision("volume_ratio_20d").notNull(),
  sectorReturn20d: doublePrecision("sector_return_20d").notNull(),
  relativeStrength: doublePrecision("relative_strength").notNull(),
  marketSignalScore: integer("market_signal_score").notNull(),
});

/* ------------------------------------------------------------------ */
/*  Index level series (Sectors /index-daily). Anchors the Gann 432    */
/*  cycle math. Kept apart from company prices because an index is not */
/*  a listed equity — it has no company_id, volume or market cap.      */
/* ------------------------------------------------------------------ */

export const indexPrices = pgTable(
  "index_prices",
  {
    id: serial("id").primaryKey(),
    /** API code, e.g. "IHSG". The API echoes this uppercased. */
    indexCode: varchar("index_code", { length: 12 }).notNull().default("IHSG"),
    tradingDate: date("trading_date").notNull(),
    close: doublePrecision("close").notNull(),
  },
  (t) => [uniqueIndex("index_prices_code_date_uniq").on(t.indexCode, t.tradingDate)],
);

/* ------------------------------------------------------------------ */
/*  Net foreign-broker flow per ticker (Sectors /foreign-flow).        */
/*  Positive = foreign brokers net buyers. Confirms the framework's   */
/*  "inflow asing kembali" condition.                                  */
/* ------------------------------------------------------------------ */

export const foreignFlow = pgTable(
  "foreign_flow",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    tradingDate: date("trading_date").notNull(),
    /** full IDR, not billions — flow is small relative to market cap */
    netForeignInflow: bigint("net_foreign_inflow", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("foreign_flow_company_date_uniq").on(t.companyId, t.tradingDate),
    index("foreign_flow_company_idx").on(t.companyId),
  ],
);

/* ------------------------------------------------------------------ */
/*  Signals                                                            */
/* ------------------------------------------------------------------ */

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    eventId: integer("event_id")
      .notNull()
      .references(() => businessEvents.id),
    goalId: integer("goal_id")
      .notNull()
      .references(() => sdgGoals.id),
    targetId: integer("target_id").references(() => sdgTargets.id),
    signalType: varchar("signal_type", { length: 40 }).notNull(),
    signalStrength: integer("signal_strength").notNull(),
    sdgEvidenceScore: integer("sdg_evidence_score").notNull(),
    marketSignalScore: integer("market_signal_score").notNull(),
    timingScore: integer("timing_score").notNull(),
    executionStage: varchar("execution_stage", { length: 14 }).notNull(),
    timingClass: varchar("timing_class", { length: 12 }).notNull(),
    headline: text("headline").notNull(),
    whyFlagged: jsonb("why_flagged").$type<string[]>().notNull(),
    detectedAt: date("detected_at").notNull(),
    methodologyVersion: varchar("methodology_version", { length: 12 })
      .notNull()
      .default("1.0.0"),
    status: varchar("status", { length: 12 }).notNull().default("ACTIVE"),
  },
  (t) => [
    index("signals_company_idx").on(t.companyId),
    index("signals_goal_idx").on(t.goalId),
    index("signals_strength_idx").on(t.signalStrength),
  ],
);

export const signalEvidence = pgTable("signal_evidence", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id")
    .notNull()
    .references(() => signals.id),
  component: varchar("component", { length: 30 }).notNull(),
  metricName: text("metric_name").notNull(),
  metricValue: text("metric_value").notNull(),
  benchmarkValue: text("benchmark_value").notNull(),
  weight: doublePrecision("weight").notNull(),
  contribution: doublePrecision("contribution").notNull(),
  explanation: text("explanation").notNull(),
  sourceReference: text("source_reference").notNull(),
});

export const signalSnapshots = pgTable("signal_snapshots", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id")
    .notNull()
    .references(() => signals.id),
  label: varchar("label", { length: 12 }).notNull(), // T-90 ...
  snapshotDate: date("snapshot_date").notNull(),
  signalStrength: integer("signal_strength").notNull(),
  timingScore: integer("timing_score").notNull(),
  stage: varchar("stage", { length: 14 }).notNull(),
  close: doublePrecision("close").notNull(),
  volumeRatio: doublePrecision("volume_ratio").notNull(),
  note: text("note").notNull(),
});


/* ------------------------------------------------------------------ */
/*  Time-versioned market microstructure rules (BEI ARA/ARB)           */
/* ------------------------------------------------------------------ */

export const marketRules = pgTable("market_rules", {
  id: serial("id").primaryKey(),
  validFrom: date("valid_from").notNull(),
  validUntil: date("valid_until"),
  priceMin: doublePrecision("price_min").notNull(),
  priceMax: doublePrecision("price_max"),
  bandLabel: varchar("band_label", { length: 24 }).notNull(),
  araLabel: varchar("ara_label", { length: 12 }).notNull(),
  arbLabel: varchar("arb_label", { length: 12 }).notNull(),
  araPct: doublePrecision("ara_pct"),
  arbPct: doublePrecision("arb_pct"),
  sourceNote: text("source_note").notNull(),
});

/* ------------------------------------------------------------------ */
/*  2030 Market & Execution Scenario (context layer, not a forecast)   */
/* ------------------------------------------------------------------ */

export const scenario = pgTable("scenario", {
  id: serial("id").primaryKey(),
  scenarioYear: integer("scenario_year").notNull().unique(),
  code: varchar("code", { length: 40 }).notNull(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  observableIndicators: text("observable_indicators").array().notNull().default([]),
  isConfirmedByData: integer("is_confirmed_by_data").notNull().default(0),
  confirmationScore: integer("confirmation_score").notNull().default(0),
  confirmationLabel: varchar("confirmation_label", { length: 24 })
    .notNull()
    .default("PENDING_OBSERVATION"),
  updatedOn: date("updated_on").notNull(),
});

/* ------------------------------------------------------------------ */
/*  Market Intelligence Score - 70% Sectors-derived, persisted with a  */
/*  methodology version so every score is reproducible                 */
/* ------------------------------------------------------------------ */

export const marketIntelScores = pgTable("market_intel_scores", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .notNull()
    .references(() => companies.id)
    .unique(),
  computedOn: date("computed_on").notNull(),
  methodologyVersion: varchar("methodology_version", { length: 16 }).notNull().default("2026.1"),
  priceDislocation: integer("price_dislocation").notNull(),
  volumeAnomaly: integer("volume_anomaly").notNull(),
  relativePerformance: integer("relative_performance").notNull(),
  fundamentalContext: integer("fundamental_context").notNull(),
  marketIndustryContext: integer("market_industry_context").notNull(),
  sectorsSubtotal: integer("sectors_subtotal").notNull(),
  businessEventPts: integer("business_event_pts").notNull(),
  sourceQuality: integer("source_quality").notNull(),
  eventMateriality: integer("event_materiality").notNull(),
  evidenceSubtotal: integer("evidence_subtotal").notNull(),
  sdgTargetRelevance: integer("sdg_target_relevance").notNull(),
  executionTiming2030: integer("execution_timing_2030").notNull(),
  sdgSubtotal: integer("sdg_subtotal").notNull(),
  totalScore: integer("total_score").notNull(),
  marketCondition: varchar("market_condition", { length: 16 }).notNull(),
  priceFloorBand: varchar("price_floor_band", { length: 24 }).notNull(),
  araLabel: varchar("ara_label", { length: 12 }).notNull(),
  arbLabel: varchar("arb_label", { length: 12 }).notNull(),
});

export const researchBriefs = pgTable("research_briefs", {
  id: serial("id").primaryKey(),
  signalId: integer("signal_id")
    .notNull()
    .references(() => signals.id)
    .unique(),
  model: varchar("model", { length: 40 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 12 }).notNull(),
  whatChanged: text("what_changed").notNull(),
  businessEvent: text("business_event").notNull(),
  sdgConnection: text("sdg_connection").notNull(),
  executionStageText: text("execution_stage_text").notNull(),
  timing: text("timing").notNull(),
  marketContext: text("market_context").notNull(),
  signalEvidenceText: text("signal_evidence_text").notNull(),
  whyInvestigate: text("why_investigate").notNull(),
  investigateNext: jsonb("investigate_next").$type<string[]>().notNull(),
  limitations: text("limitations").notNull(),
  citations: jsonb("citations")
    .$type<{ label: string; url: string; tier: number }[]>()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Sync state — tracks incremental pulls from live data sources       */
/*  (Sectors Financial API). A row per source; its absence means the   */
/*  app is still running on the seeded demonstration dataset.          */
/* ------------------------------------------------------------------ */

export const syncState = pgTable("sync_state", {
  id: serial("id").primaryKey(),
  source: varchar("source", { length: 40 }).notNull().unique(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastTradingDate: date("last_trading_date"),
  universe: varchar("universe", { length: 24 }).notNull().default("curated"),
  tickersSynced: integer("tickers_synced").notNull().default(0),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  creditsUsed: integer("credits_used").notNull().default(0),
  /** consecutive runs whose incremental window returned 0 bars (holidays / API lag) */
  emptyStreak: integer("empty_streak").notNull().default(0),
  note: text("note"),
});

/* ------------------------------------------------------------------ */
/*  Watchlist — the quota-efficient sync universe. Recomputed locally  */
/*  (0 credits) before every sync; only these companies are pulled     */
/*  from the Sectors API. Companies outside it keep their stored data. */
/* ------------------------------------------------------------------ */

export const watchlist = pgTable(
  "watchlist",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id)
      .unique(),
    rank: integer("rank").notNull(),
    potentialScore: integer("potential_score").notNull(),
    /** per-component points — auditable selection, not a black box */
    scoreBreakdown: jsonb("score_breakdown")
      .$type<{ marketIntel: number; signal: number; sdgEvidence: number; marketCondition: number; suspendedPenalty: number }>()
      .notNull(),
    /** consecutive syncs that returned no rows (delisted / permanently suspended) */
    emptyRuns: integer("empty_runs").notNull().default(0),
    selectedAt: date("selected_at").notNull(),
  },
  (t) => [index("watchlist_rank_idx").on(t.rank)],
);

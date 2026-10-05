/**
 * One-off migration: local Postgres → Supabase (schema + data).
 *
 * Two ways to run the same guarded, idempotent migration:
 *
 *   1. CLI:     npm run db:migrate:supabase [-- --force]
 *   2. One-click (dev server): GET /api/admin/migrate?token=<MIGRATE_TOKEN>
 *
 * Source : MIGRATE_SOURCE_URL ?? DATABASE_URL      (the DB your local app reads)
 * Target : SUPABASE_DATABASE_URL ?? DIRECT_URL ?? SUPABASE_DIRECT_URL
 *
 * What it does, in order:
 *  1. Prints masked source/target URLs and refuses to run when both point at
 *     the same database.
 *  2. Ensures the full 19-table schema exists on the target — idempotent DDL
 *     mirroring src/db/schema.ts, plus indexes, RLS and service_role grants.
 *  3. Validates the source actually holds the app dataset (companies rows > 0,
 *     unless --force).
 *  4. Truncates the target's app tables, then copies every table in FK order
 *     with explicit ids and resets each id sequence — reruns are clean and
 *     deterministic.
 *  5. Reports per-table source vs target row counts.
 *
 * The Sectors API is never called and no credits are spent. `sync_state` rows
 * are copied so the app keeps its "Live · Sectors API" badge and the
 * incremental watermarks used by db:sync.
 */
import "dotenv/config";
import { Pool } from "pg";

const pick = (...vals: (string | undefined)[]): string =>
  vals.find((v) => v && v.trim()) ?? "";

const TABLES = [
  "sdg_goals",
  "sdg_targets",
  "companies",
  "company_fundamentals",
  "business_events",
  "event_sdg_mappings",
  "market_prices",
  "market_context_snapshots",
  "index_prices",
  "foreign_flow",
  "signals",
  "signal_evidence",
  "signal_snapshots",
  "market_rules",
  "scenario",
  "market_intel_scores",
  "research_briefs",
  "sync_state",
  "watchlist",
] as const;

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS public.sdg_goals (
  id serial PRIMARY KEY,
  goal_number integer NOT NULL UNIQUE,
  title text NOT NULL,
  short_title text NOT NULL,
  color varchar(7) NOT NULL,
  description text NOT NULL,
  source_url text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.companies (
  id serial PRIMARY KEY,
  ticker varchar(10) NOT NULL UNIQUE,
  company_name text NOT NULL,
  sector varchar(40) NOT NULL,
  industry varchar(60) NOT NULL,
  exchange varchar(10) NOT NULL DEFAULT 'IDX',
  market_cap_idr bigint NOT NULL,
  base_price double precision NOT NULL,
  is_active integer NOT NULL DEFAULT 1
)`,
  `CREATE TABLE IF NOT EXISTS public.market_rules (
  id serial PRIMARY KEY,
  valid_from date NOT NULL,
  valid_until date,
  price_min double precision NOT NULL,
  price_max double precision,
  band_label varchar(24) NOT NULL,
  ara_label varchar(12) NOT NULL,
  arb_label varchar(12) NOT NULL,
  ara_pct double precision,
  arb_pct double precision,
  source_note text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.scenario (
  id serial PRIMARY KEY,
  scenario_year integer NOT NULL UNIQUE,
  code varchar(40) NOT NULL,
  label text NOT NULL,
  description text NOT NULL,
  observable_indicators text[] NOT NULL DEFAULT '{}',
  is_confirmed_by_data integer NOT NULL DEFAULT 0,
  confirmation_score integer NOT NULL DEFAULT 0,
  confirmation_label varchar(24) NOT NULL DEFAULT 'PENDING_OBSERVATION',
  updated_on date NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.sync_state (
  id serial PRIMARY KEY,
  source varchar(40) NOT NULL UNIQUE,
  last_sync_at timestamp with time zone NOT NULL DEFAULT now(),
  last_trading_date date,
  universe varchar(24) NOT NULL DEFAULT 'curated',
  tickers_synced integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  empty_streak integer NOT NULL DEFAULT 0,
  note text
)`,
  `CREATE TABLE IF NOT EXISTS public.index_prices (
  id serial PRIMARY KEY,
  index_code varchar(12) NOT NULL DEFAULT 'IHSG',
  trading_date date NOT NULL,
  close double precision NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.sdg_targets (
  id serial PRIMARY KEY,
  goal_id integer NOT NULL REFERENCES public.sdg_goals(id),
  target_code varchar(12) NOT NULL UNIQUE,
  title text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  source_url text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.company_fundamentals (
  id serial PRIMARY KEY,
  company_id integer NOT NULL UNIQUE REFERENCES public.companies(id),
  report_date date NOT NULL,
  eps_growth double precision NOT NULL,
  revenue_growth double precision NOT NULL,
  dividend_yield double precision NOT NULL,
  note text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.business_events (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id),
  event_type varchar(24) NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  event_date date NOT NULL,
  stage varchar(14) NOT NULL,
  stage_confidence double precision NOT NULL,
  investment_amount_idr bigint,
  capacity text,
  location text,
  counterparty text,
  project text,
  planned_start_date date,
  expected_completion_date date,
  target_year integer,
  timing_class varchar(12) NOT NULL,
  timing_score integer NOT NULL,
  classification_version varchar(12) NOT NULL DEFAULT 'timeline.v1',
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_tier integer NOT NULL,
  claim_type varchar(24) NOT NULL,
  evidence_text text NOT NULL,
  extraction_confidence double precision NOT NULL,
  business_impact text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
)`,
  `CREATE TABLE IF NOT EXISTS public.market_context_snapshots (
  id serial PRIMARY KEY,
  company_id integer NOT NULL UNIQUE REFERENCES public.companies(id),
  snapshot_date date NOT NULL,
  price_change_5d double precision NOT NULL,
  price_change_20d double precision NOT NULL,
  price_change_30d double precision NOT NULL,
  volume_ratio_20d double precision NOT NULL,
  sector_return_20d double precision NOT NULL,
  relative_strength double precision NOT NULL,
  market_signal_score integer NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.market_intel_scores (
  id serial PRIMARY KEY,
  company_id integer NOT NULL UNIQUE REFERENCES public.companies(id),
  computed_on date NOT NULL,
  methodology_version varchar(16) NOT NULL DEFAULT '2026.1',
  price_dislocation integer NOT NULL,
  volume_anomaly integer NOT NULL,
  relative_performance integer NOT NULL,
  fundamental_context integer NOT NULL,
  market_industry_context integer NOT NULL,
  sectors_subtotal integer NOT NULL,
  business_event_pts integer NOT NULL,
  source_quality integer NOT NULL,
  event_materiality integer NOT NULL,
  evidence_subtotal integer NOT NULL,
  sdg_target_relevance integer NOT NULL,
  execution_timing_2030 integer NOT NULL,
  sdg_subtotal integer NOT NULL,
  total_score integer NOT NULL,
  market_condition varchar(16) NOT NULL,
  price_floor_band varchar(24) NOT NULL,
  ara_label varchar(12) NOT NULL,
  arb_label varchar(12) NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.watchlist (
  id serial PRIMARY KEY,
  company_id integer NOT NULL UNIQUE REFERENCES public.companies(id),
  "rank" integer NOT NULL,
  potential_score integer NOT NULL,
  score_breakdown jsonb NOT NULL,
  empty_runs integer NOT NULL DEFAULT 0,
  selected_at date NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.event_sdg_mappings (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES public.business_events(id),
  goal_id integer NOT NULL REFERENCES public.sdg_goals(id),
  target_id integer REFERENCES public.sdg_targets(id),
  relationship_type varchar(16) NOT NULL,
  evidence_score integer NOT NULL,
  mapping_confidence double precision NOT NULL,
  mapping_version varchar(12) NOT NULL DEFAULT 'sdg.v1',
  reasoning text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.market_prices (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id),
  trading_date date NOT NULL,
  close double precision NOT NULL,
  volume bigint NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.foreign_flow (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id),
  trading_date date NOT NULL,
  net_foreign_inflow bigint NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.signals (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES public.companies(id),
  event_id integer NOT NULL REFERENCES public.business_events(id),
  goal_id integer NOT NULL REFERENCES public.sdg_goals(id),
  target_id integer REFERENCES public.sdg_targets(id),
  signal_type varchar(40) NOT NULL,
  signal_strength integer NOT NULL,
  sdg_evidence_score integer NOT NULL,
  market_signal_score integer NOT NULL,
  timing_score integer NOT NULL,
  execution_stage varchar(14) NOT NULL,
  timing_class varchar(12) NOT NULL,
  headline text NOT NULL,
  why_flagged jsonb NOT NULL,
  detected_at date NOT NULL,
  methodology_version varchar(12) NOT NULL DEFAULT '1.0.0',
  status varchar(12) NOT NULL DEFAULT 'ACTIVE'
)`,
  `CREATE TABLE IF NOT EXISTS public.signal_evidence (
  id serial PRIMARY KEY,
  signal_id integer NOT NULL REFERENCES public.signals(id),
  component varchar(30) NOT NULL,
  metric_name text NOT NULL,
  metric_value text NOT NULL,
  benchmark_value text NOT NULL,
  weight double precision NOT NULL,
  contribution double precision NOT NULL,
  explanation text NOT NULL,
  source_reference text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.signal_snapshots (
  id serial PRIMARY KEY,
  signal_id integer NOT NULL REFERENCES public.signals(id),
  label varchar(12) NOT NULL,
  snapshot_date date NOT NULL,
  signal_strength integer NOT NULL,
  timing_score integer NOT NULL,
  stage varchar(14) NOT NULL,
  close double precision NOT NULL,
  volume_ratio double precision NOT NULL,
  note text NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS public.research_briefs (
  id serial PRIMARY KEY,
  signal_id integer NOT NULL UNIQUE REFERENCES public.signals(id),
  model varchar(40) NOT NULL,
  prompt_version varchar(12) NOT NULL,
  what_changed text NOT NULL,
  business_event text NOT NULL,
  sdg_connection text NOT NULL,
  execution_stage_text text NOT NULL,
  timing text NOT NULL,
  market_context text NOT NULL,
  signal_evidence_text text NOT NULL,
  why_investigate text NOT NULL,
  investigate_next jsonb NOT NULL,
  limitations text NOT NULL,
  citations jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
)`,
];

const INDEXES: string[] = [
  "CREATE INDEX IF NOT EXISTS sdg_targets_goal_idx ON public.sdg_targets (goal_id)",
  "CREATE INDEX IF NOT EXISTS business_events_company_idx ON public.business_events (company_id)",
  "CREATE INDEX IF NOT EXISTS business_events_date_idx ON public.business_events (event_date)",
  "CREATE INDEX IF NOT EXISTS business_events_stage_idx ON public.business_events (stage)",
  "CREATE INDEX IF NOT EXISTS event_mappings_event_idx ON public.event_sdg_mappings (event_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS market_prices_company_date_uniq ON public.market_prices (company_id, trading_date)",
  "CREATE UNIQUE INDEX IF NOT EXISTS index_prices_code_date_uniq ON public.index_prices (index_code, trading_date)",
  "CREATE UNIQUE INDEX IF NOT EXISTS foreign_flow_company_date_uniq ON public.foreign_flow (company_id, trading_date)",
  "CREATE INDEX IF NOT EXISTS foreign_flow_company_idx ON public.foreign_flow (company_id)",
  "CREATE INDEX IF NOT EXISTS signals_company_idx ON public.signals (company_id)",
  "CREATE INDEX IF NOT EXISTS signals_goal_idx ON public.signals (goal_id)",
  "CREATE INDEX IF NOT EXISTS signals_strength_idx ON public.signals (signal_strength)",
  'CREATE INDEX IF NOT EXISTS watchlist_rank_idx ON public.watchlist ("rank")',
];

const RLS_GRANTS = `DO $mig$
DECLARE t text; s text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
           AND tablename IN (${TABLES.map((t) => `'${t}'`).join(",")})
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  FOR s IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', s);
  END LOOP;
END
$mig$;`;

const CHUNK_PARAMS = 60_000; // Postgres binds per statement

function mask(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? u.username + ":***@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(unparseable url)";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function poolFor(url: string, max: number): Pool {
  const host = hostOf(url);
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  return new Pool({
    connectionString: url,
    max,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}

async function identity(p: Pool): Promise<string> {
  const { rows } = await p.query(
    "select current_database() as db, coalesce(inet_server_addr()::text,'unix') as host, " +
      "coalesce(inet_server_port()::text,'0') as port",
  );
  return `${rows[0].db}@${rows[0].host}:${rows[0].port}`;
}

async function copyTable(
  src: Pool,
  dst: Pool,
  table: string,
): Promise<{ source: number; target: number }> {
  const cols = (
    await src.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
       where table_schema = 'public' and table_name = $1
       order by ordinal_position`,
      [table],
    )
  ).rows;

  /* date columns are selected as text: pg parses dates into local-time Date
     objects, and re-serializing them could shift the calendar day across time
     zones — strings round-trip exactly. */
  const selectList = cols
    .map((c) =>
      c.data_type === "date" ? `"${c.column_name}"::text as "${c.column_name}"` : `"${c.column_name}"`,
    )
    .join(", ");

  const { rows } = await src.query(`select ${selectList} from public."${table}"`);

  const names = cols.map((c) => `"${c.column_name}"`).join(", ");
  const rowsPerChunk = Math.max(1, Math.floor(CHUNK_PARAMS / cols.length));

  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const chunk = rows.slice(i, i + rowsPerChunk);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = cols.map((c) => {
        values.push(row[c.column_name]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await dst.query(
      `insert into public."${table}" (${names}) values ${tuples.join(", ")}`,
      values,
    );
  }

  /* continue the id sequence after the copied max id (or reset to 1 when empty) */
  await dst.query(
    `select setval(
       pg_get_serial_sequence('public.${table}', 'id'),
       coalesce((select max(id) from public."${table}"), 1),
       (select exists(select 1 from public."${table}"))
     )`,
  );

  const target = (await dst.query(`select count(*)::int as n from public."${table}"`)).rows[0].n;
  return { source: rows.length, target };
}

export interface MigrationRow {
  table: string;
  source: number;
  target: number;
  ok: boolean;
}

export interface MigrationReport {
  sourceLabel: string;
  targetLabel: string;
  companyCount: number;
  mismatches: number;
  rows: MigrationRow[];
}

/** Runs the full guarded migration and returns a per-table report. Throws on guard failures. */
export async function runMigration(
  log: (m: string) => void = console.log,
): Promise<MigrationReport> {
  const sourceUrl = pick(process.env.MIGRATE_SOURCE_URL, process.env.DATABASE_URL);
  const targetUrl = pick(
    process.env.SUPABASE_DATABASE_URL,
    process.env.DIRECT_URL,
    process.env.SUPABASE_DIRECT_URL,
  );
  const FORCE = process.argv.includes("--force");

  if (!sourceUrl) {
    throw new Error("No source database URL. Set DATABASE_URL (or MIGRATE_SOURCE_URL) in .env.");
  }
  if (!targetUrl) {
    throw new Error(
      "No target database URL. Set SUPABASE_DATABASE_URL (pooled, port 6543) or " +
        "DIRECT_URL (direct, port 5432) in .env.",
    );
  }

  log(`Source : ${mask(sourceUrl)}`);
  log(`Target : ${mask(targetUrl)}`);

  const src = poolFor(sourceUrl, 2);
  const dst = poolFor(targetUrl, 4);

  try {
    const srcId = await identity(src);
    const dstId = await identity(dst);
    if (sourceUrl === targetUrl || srcId === dstId) {
      throw new Error(`Refusing to run: source and target are the same database (${srcId}).`);
    }

    log("Ensuring schema on target…");
    for (const stmt of [...DDL, ...INDEXES, RLS_GRANTS]) {
      await dst.query(stmt);
    }

    const hasApp = (
      await src.query(
        `select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_name = 'companies'`,
      )
    ).rows[0].n;
    if (!hasApp) {
      throw new Error(
        "Source has no `companies` table — the source URL does not point at the app database. " +
          "If your data lives elsewhere, set MIGRATE_SOURCE_URL in .env and retry.",
      );
    }
    const companyCount = (await src.query("select count(*)::int as n from public.companies"))
      .rows[0].n;
    if (companyCount === 0 && !FORCE) {
      throw new Error(
        "Source has 0 companies rows. If your data lives in another database, set " +
          "MIGRATE_SOURCE_URL=postgresql://… in .env and retry (or run the CLI with --force).",
      );
    }

    log("Truncating target app tables…");
    await dst.query(
      `TRUNCATE TABLE ${TABLES.map((t) => `public.${t}`).join(", ")} RESTART IDENTITY CASCADE`,
    );

    log("Copying data…");
    const pad = Math.max(...TABLES.map((t) => t.length));
    const rows: MigrationRow[] = [];
    let mismatches = 0;
    for (const table of TABLES) {
      const { source, target } = await copyTable(src, dst, table);
      const ok = source === target;
      if (!ok) mismatches += 1;
      rows.push({ table, source, target, ok });
      log(
        `  ${table.padEnd(pad)}  src ${String(source).padStart(5)}  →  dst ${String(target).padStart(5)}  ${ok ? "✔" : "✗ MISMATCH"}`,
      );
    }

    return {
      sourceLabel: mask(sourceUrl),
      targetLabel: mask(targetUrl),
      companyCount,
      mismatches,
      rows,
    };
  } finally {
    await src.end().catch(() => undefined);
    await dst.end().catch(() => undefined);
  }
}

/* CLI entry point — skipped when this module is imported by the app. */
function isDirectRun(): boolean {
  const arg1 = process.argv[1];
  return !!arg1 && arg1.replace(/\\/g, "/").endsWith("db/migrate-to-supabase.ts");
}

if (isDirectRun()) {
  runMigration(console.log)
    .then((report) => {
      if (report.mismatches > 0) {
        console.error(`${report.mismatches} table(s) mismatched — rerun the script (it is idempotent).`);
        process.exit(2);
      }
      console.log(
        report.companyCount > 0
          ? `Migration complete ✔ (${report.companyCount} companies).`
          : "Migration complete ✔ (empty dataset — schema only).",
      );
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

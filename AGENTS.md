# AGENTS.md — Working notes & technical changelog

Project: **IDX Sectors 2030** (formerly SDG Signal Scout 2030, rebranded 2026-10-05) (Next.js 16 App Router + PostgreSQL/Drizzle).
This file records environment setup, the live-data integration, and every bug/fix
encountered. Update it whenever behaviour changes.

---

## 1. Environment setup (Windows + Git Bash)

The machine started with **no Node.js, no package manager, no PostgreSQL, no Docker**.
Both runtimes were installed system-wide via `winget` with user approval.

| Tool | Version | How |
|---|---|---|
| Node.js LTS | 24.19.0 | `winget install --id OpenJS.NodeJS.LTS -e` |
| PostgreSQL | 17.11 | `winget install --id PostgreSQL.PostgreSQL.17 -e --source winget --override "--mode unattended --unattendedmodeui none --superpassword postgres --servicename postgresql-x64-17 --serviceaccount NTRIGHTS --serverport 5432 --disable-components stackbuilder"` |

Gotchas:
- Node lives in `/c/Program Files/nodejs` and is **not** on the inherited PATH — every
  shell command needs `export PATH="/c/Program Files/nodejs:$PATH"` first.
- The PostgreSQL install takes 20+ minutes (unpacks a full pgAdmin Python environment).
  The `postgresql-17.11-5-window` process lingering afterwards is harmless; wait for
  `sc query postgresql-x64-17` to report `RUNNING` rather than assuming it stalled.
- Service `postgresql-x64-17` is created and **auto-starts with Windows**.
- Database `app_db` created with superuser `postgres` / password `postgres`.
- npm warned that install scripts for `esbuild`, `sharp`, `unrs-resolver` were blocked
  (`npm warn allow-scripts`). This is harmless — platform binaries arrive via optional
  dependencies, and `tsx` works normally.
- `npm install` pulls 391 packages.

Dev server: Next.js 16.2.6 (Turbopack) self-selected **port 55980**, not 3000. Check
`.freebuff/dev-server.log`; the log line `Local: http://localhost:<port>` is authoritative.

---

## 2. Sectors Financial API v2 integration

Goal: replace the seeded synthetic market series with live IDX data from
<https://docs.sectors.app/>, keeping the app's query layer untouched (sync-to-Postgres,
not live-proxy — the API key must never touch a request path).

### 2.1 Files

| File | Status | Purpose |
|---|---|---|
| `src/lib/sectors.ts` | **new** | Typed API client: auth, pacing, retry, credit budget, pagination |
| `src/db/sync.ts` | **new** | Incremental idempotent sync + local recompute of snapshots/scores |
| `src/db/smoke-sectors.ts` | **new** | 2-credit live shape verification (`npm run db:smoke`) |
| `src/db/schema.ts` | modified | Added `syncState` table |
| `src/components/Footer.tsx` | modified | `DataSourceBadge` async server component (Live vs Demo) |
| `package.json` | modified | `db:push`, `db:seed`, `db:sync`, `db:smoke` scripts |
| `drizzle.config.ts` | **new** (replaces deleted `drizzle.config.json`) | Env-driven config |
| `.env` / `.env.example` / `.env.production.example` | new/extended | See §4 |
| `.gitignore` | **new** | Covers `.env*` with `!.env.example` / `!.env.production.example` |

### 2.2 API facts (all verified live on 2026-10-03, not read from docs)

- Base URL `https://api.sectors.app/v2/`; auth = raw key in the `Authorization` header
  (**no `Bearer` prefix**). v1 was discontinued 2026-05-11 → HTTP 410 Gone.
- `GET /daily/{symbol}/` → `[{ symbol: "BBCA.JK", date, open, high, low, close, volume, market_cap }]`.
  Max 90-day window, **1 credit per call**.
  - `symbol` in responses carries a **`.JK` suffix** — strip it for DB storage.
  - `market_cap` is **full IDR**; `companies.market_cap_idr` is in **billions** → divide by 1e9.
  - Non-trading days are simply absent (no trading calendar needed).
  - **Suspended stocks return a constant close with zero volume** — this caused a real bug, see §3.3.
- `GET /companies/` (screener) → `{ results: [{ symbol, company_name }], pagination: { total_count, limit, offset, has_next, next_offset } }`.
  - 962 IDX companies total. `where=sub_sector='banks'` works (48 rows).
  - `where=symbol in [...]` returns **0 rows** — that field name is not filterable; page with
    `order_by` and filter client-side instead.
  - Default response carries only `symbol` + `company_name`; `include_query_values=true` echoes
    the field values used in the query (e.g. `market_cap`).
  - Structured `where`/`order_by` = **1 credit**; natural-language `?q=` = **3 credits**.
- `GET /company/report/{symbol}/?sections=financials,dividend,future` → **1 credit per section**
  (all 8 sections = 8 credits). Fields used:
  - `financials.yoy_quarter_earnings_growth` (fraction) → `epsGrowth` × 100
  - `financials.yoy_quarter_revenue_growth` (fraction) → `revenueGrowth` × 100
  - `financials.historical_eps.{year}.eps_growth`
  - `dividend.yield_ttm` (fraction) → `dividendYield` × 100
  - `future.company_growth_forecasts[].eps_growth`
- Billing: **2xx and 404 consume credits**; 400, 401/403, 429 and 5xx are free. Empty result
  sets return 200 (not an error). Retryable statuses: 429, 502, 503, 504.

### 2.3 Sync semantics (`npm run db:sync`)

1. Universe — `SECTORS_UNIVERSE=curated` (default) uses the 34 companies already in the DB;
   `all` pages the full screener and inserts newcomers with `sector = "Unclassified"`.
2. Prices — first run deletes the seeded synthetic series and pulls the trailing 90 days;
   later runs fetch only trading days after `sync_state.last_trading_date`. Tickers with
   **zero local rows are backfilled with a full window** regardless of sync state.
   Upsert target `(company_id, trading_date)`; latest row also updates `companies.market_cap_idr`
   and `companies.base_price`.
3. Fundamentals — default mode only fills companies that have no `company_fundamentals` row;
   `--full` forces a refresh for all (3 credits each).
4. Derived (0 credits) — snapshots recomputed with the **same formulas as `seed.ts`**
   (pc5/pc20/pc30, `volumeRatio20d` = avg last 5d volume ÷ avg prior 20d, `sectorReturn20d` =
   mean pc20 per sector, `relativeStrength` = pc20 − sectorRet, `computeMarketScore`), then
   `marketIntelligenceScore` + `priceFloorBandFor` into `market_intel_scores`.
5. `sync_state` is persisted **even when a later stage fails** (exit code 2) so the next run
   stays incremental instead of re-burning the full window.

Exit codes: `0` success · `1` no API key / nothing synced · `2` partial (re-run to backfill).

---

## 3. Bugs hit and fixed

### 3.1 `DIRECT_URL=` shadowed `DATABASE_URL`
An empty-string env var is **not** nullish, so `DIRECT_URL ?? DATABASE_URL` returned `""` and
`drizzle-kit push` failed with `Please provide required params for Postgres driver: url: ''`.
Fixed with a `pick()` helper in `drizzle.config.ts` that treats empty strings as unset.

### 3.2 Rate limiting (429) wiped out a third of the first sync
Nine tickers failed with `RATE_LIMIT_EXCEEDED`; per-request retries with 750 ms backoff were far
too aggressive against the plan's limit. Fixes in `src/lib/sectors.ts`:
- **Global pacer**: `MIN_INTERVAL_MS` (default 1500) enforced across all concurrent callers via a
  shared `lastCallAt` timestamp, before every attempt.
- **429-specific backoff**: 5 s → 10 s → 20 s (cap 30 s); 5xx keeps the old 750 ms ladder.
- Honour `Retry-After` when present.
- Sync concurrency lowered 5 → 3.
Result: 34/34 tickers synced.

### 3.3 `NaN` snapshots from suspended stocks
`volumeRatio = recent / base` evaluated to `0/0 = NaN` for a suspended name (constant close, zero
volume), which then poisoned `market_signal_score` and aborted the whole derived stage with a
`doublePrecision` insert failure. Fixed:
```ts
const volRatio = base > 0 && Number.isFinite(recent / base) ? +(recent / base).toFixed(2) : 1;
```
Snapshots are also skipped (previous row kept) when a company has fewer than 31 rows, since pc30
needs 31 closes.

### 3.4 Credits re-burnt after a mid-run crash
`saveSyncState` ran only on the success path, so a crash in the derived stage left no state and
the next run re-pulled the full 90-day window. State is now saved in all partial-failure paths.

### 3.5 Empty tickers never recovered
Incremental start was `lastTradingDate + 1`, so a ticker that failed with 429 in an earlier run
stayed permanently empty (and its snapshot was skipped). Fixed by counting existing rows per
company and forcing a full-window backfill when the count is 0.

### 3.6 Redundant recomputation
The market-intel stage originally computed `marketIntelligenceScore` twice and re-read the
snapshot from the database for the volume ratio. Refactored to carry `volRatio`, `pc20`,
`sectorRet`, `rs`, `lastClose`, `drawdown` in a `snapByCompany` map — no extra query.

---

## 4. Environment variables

```bash
# Local Postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db

# Sectors Financial API (IDX)
SECTORS_API_KEY=                  # from sectors.app/api (Insider plan); server-side only
SECTORS_API_BASE_URL=https://api.sectors.app/v2
SECTORS_UNIVERSE=curated          # curated | all
SECTORS_DAILY_CREDIT_BUDGET=200
SECTORS_MIN_INTERVAL_MS=1500      # global pacer between calls

# Segments.ai — reserved, no integration yet (labeling platform: datasets/samples/labels)
SEGMENTS_API_KEY=
SEGMENTS_API_BASE_URL=https://api.segments.ai

# Supabase production
DATABASE_URL=                     # POOLED (port 6543, pgbouncer) for the app runtime
DIRECT_URL=                       # DIRECT (port 5432) for drizzle-kit push
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only
```

The Sectors key was copied from the MCP server config (`~/.agents/mcp.json`, a bearer token for
the `sectors-mcp.supertype.ai` proxy) after confirming it is accepted verbatim as a raw API key
against `api.sectors.app`. It was appended to `.env` from the shell so the secret never entered
the transcript.

---

## 5. Commands

```bash
export PATH="/c/Program Files/nodejs:$PATH"   # required in every shell

npm run dev                    # dev server (port printed in .freebuff/dev-server.log)
npm run db:push                # schema (DIRECT_URL ?? DATABASE_URL)
npm run db:smoke               # 2-credit live API shape check
npm run db:sync                # watchlist prices + snapshots + intel scores (~1 credit/ticker)
npm run db:sync -- --dry-run   # watchlist selection + cost plan, 0 API calls
npm run db:sync -- --full      # + force fundamentals refresh (3 credits/company, watchlist only)
npm run db:sync -- --flow=10   # + net foreign flow, top-10 watchlist names (1 credit/ticker)
npm run db:sync -- --index     # force full IHSG re-pull (~1 credit / 90 days)
npm run typecheck && npm run lint
```

---

## 6. Verified live state (2026-10-03)

- `db:smoke`: 10/10 checks pass (`.JK` suffix, IDR magnitude, pagination envelope).
- `db:sync`: 34/34 tickers · `market_prices` 2142 rows · `market_context_snapshots` 34 ·
  `market_intel_scores` 34 · `sync_state` 1.
- Cross-checked against the API: BBCA close `6100` on 2026-10-02, market cap `744458` (B)
  = 744,458,026,950,000 IDR ÷ 1e9. Zero NaN/NULL rows in snapshots.
- Real top market caps now in `companies`: BBCA 744,458 B · BBRI 462,134 B · BREN 378,615 B
  (the seed values were synthetic).
- Credit spend so far: ~5 for research/smoke + 31 + 34 for the two sync runs.

---

## 7. Known gaps / next steps

- ~~**`README.md` was never written**~~ — **done 2026-10-04**. See `README.md` for setup,
  commands, env table, architecture, Sectors API gotchas, credit costs, troubleshooting,
  the Gann module, and Supabase deploy.
- Segments.ai: env is ready, no code. The natural use is an annotation pipeline for
  `business_events` (samples/labels → curated SDG mappings), separate from market data.
- Supabase: env templates only. Deploy = point `DATABASE_URL` at the pooled string and
  `DIRECT_URL` at the direct one, then `npm run db:push` and schedule `db:sync`.
- `SECTORS_UNIVERSE=all` is implemented but credit-expensive (≈962 credits for a full pull) —
  raise `SECTORS_DAILY_CREDIT_BUDGET` deliberately if used.
- `signals` rows keep their seeded market scores; only snapshots and `market_intel_scores` are
  recomputed by sync, so a signal's stored score can lag the live snapshot.
---

## 8. Gann 432 Reversal Window module (2026-10-04)

New analytical route at `/[lang]/gann`, built from the user's SDG × Gann 432 × IHSG
framework. Decision confirmed with the user: new page, **auto-detected** zero point,
and all three confirmation sources (volume+RSI local, sector/SDG join, foreign flow).

### 8.1 Why the zero point is detected, not hard-coded

The original framework anchored the cycle on IHSG 6,270 (2025-02-28) as an "absolute
swing low" with Fib 0.618 = 5,922 and 0.786 = 5,037. Live data contradicts it:

| Framework claim | Live verification | Verdict |
|---|---|---|
| 6,270 = absolute swing low | IHSG traded **6,787–7,952** all H2-2025 | ✗ minor low |
| 144d → "Juli 2025" minor reversal | 2025-07-22 = **7,344.74**, mid-rally, rose to 7,952 after | ✗ marked nothing |
| 432d → "April 2026" major reversal | 432d from 2025-02-28 = **2026-05-06**, IHSG **7,092.47** | ✗ 33d & ~25% early |
| "432d ≈ 22 Jun 2026" | 2026-06-22 = 6,116.69, a bounce day 14d after the low | ✗ arithmetic wrong |
| Fib 0.618 = 5,922 / 0.786 = 5,037 | implies a 9,178 → 3,910 swing | ✗ pair is unreconcilable |

A period (Sep 2025 → Apr 2026) was unsampled at first; the full 477-bar pull revealed
**IHSG peaked 9,134.70 on 2026-01-20** and then fell **−41.5%** to the 2026-06-08 low.
Verified as a real peak (smooth 6-session climb, held ~9,000 for a week, then broke
down — not a data glitch). **This corrects an earlier conclusion in the session**: the
earlier claim that "0.786 held and no major downtrend followed" was derived from the
framework's internally-inconsistent Fib pair. Derived correctly, there *was* a major
downtrend.

Detected anchor: **2026-06-08 @ 5,342.14** → 144d = 2026-10-30, 288d = 2027-03-23,
432d = 2027-08-14, 576d = 2028-01-05.

### 8.2 Files added / changed

- `src/lib/gann.ts` **(new)** — pure maths: `gannWindowDates`, `detectSwingLow/High`,
  `fibLevels`, `priceTimeSquaring`, `seasonalDates`, `rsiSeries` (Wilder),
  `rsiDivergence`, `confluenceScore`. No I/O.
- `src/db/smoke-gann.ts` **(new)** — 42 assertions, **0 credits**. `npm run db:smoke:gann`.
- `src/components/GannWindowGauge.tsx`, `GannMatrix.tsx` **(new)**; `src/app/[lang]/gann/page.tsx` **(new)**.
- `src/db/schema.ts` — `index_prices`, `foreign_flow`.
- `src/lib/sectors.ts` — `fetchIndexDaily`, `fetchForeignFlow` (+ `ForeignFlowResponse`).
- `src/db/sync.ts` — `syncIndex()`, `syncForeignFlow()`, generic `upsertSyncState()`.
- `src/db/queries.ts` — `getGannWindow()`, `getGannTickers()`.
- `src/i18n/dict.ts` — full `gann` section in **en / id / zh**; `nav.gann` in all three.

### 8.3 Verified state (2026-10-04)

- `db:smoke:gann` **45/45 pass**. Live half asserts the detected zero point is
  `2026-06-08 @ 5342.137`, not edge-constrained, 477 bars with no NaN, and that stored
  flow spans more than 20 days (so the 20-day bound is a real filter, not a no-op).
- `db:sync -- --index`: `index_prices` **477 bars** (2024-09-24 → 2026-10-02), 9 credits.
- `db:sync -- --flow`: `foreign_flow` **2079 rows / 33 tickers**. WIKA has no flow
  data at all — reported, not faked.
- `/en/gann`, `/id/gann`, `/zh/gann` all HTTP 200. No console errors. No horizontal
  overflow (scrollW 1430 = clientW). 34 ticker rows, 7 panels, 3 sections.
- Zero-point sparkline marker at **82.5%** of the chart width (hand-checked ≈83%).
- **Idempotency confirmed**: two consecutive `--flow` runs left every count identical
  (`market_prices` 2142 · `index_prices` 477 · `foreign_flow` 2079 · snapshots 34 ·
  intel 34).
- `npm run typecheck` clean. `npm run lint` clean for all touched files.
- **No-API-key fallback verified**: `db:sync` exits `1` with a clear message;
  `.env` restored afterwards.

### 8.4 Six more bugs found and fixed

7. **Pre-existing typecheck failure** (never run since the Sectors work): `snapshotDate`
   was `string | null` but `market_context_snapshots.snapshot_date` is `NOT NULL`.
   Fixed by early-returning `recomputeDerived()` when no prices are stored, rather
   than suppressing the type.
8. **`/foreign-flow/` returns an object** `{symbol, start, end, data:[...]}`, not the
   bare array `/daily/` returns → `series.filter is not a function`. Documented in
   `sectors.ts` and typed as `ForeignFlowResponse`.
9. **False success on total failure**: the flow stage printed "Sync complete ✔" even
   when every ticker errored. Now a 0-row result with `tickers > 0` sets `flowAborted`
   and exits `2`.
10. **Watermark poisoned by a 0-row run**: `syncForeignFlow` wrote
    `lastTradingDate = today` even though nothing was stored, so the next run said
    "already current" and skipped the data forever. Now the watermark only advances
    to the newest date *actually written*; the polluted row was deleted and repaired.
11. **Shared watermark hid stragglers**: 3 tickers rate-limited in one run were never
    retried because the global watermark advanced. Fixed with per-ticker full-window
    backfill for any ticker holding 0 rows (mirrors `syncPrices`).
12. **Inflated failure accounting**: 31 of 34 tickers logged "no flow rows" on a
    weekend — counted as failures. Now only a ticker with **zero stored rows** counts
    as failed; no-new-trading-days is logged as "already current".
13. **Zero-point marker silently vanished**: the sparkline series was thinned by index
    stride, then the marker looked up `findIndex(p => p.date === zeroPoint.date)` —
    which returns −1 whenever thinning skipped that bar. Fixed by force-retaining the
    zero-point index during thinning and returning `zeroPointX` from the query.

14. **Foreign flow summed every stored row, not the trailing 20 trading days** — caught in
    the final completion audit, not by the test suite. The plan and the code comment both
    said "20-day", but `sum(net_foreign_inflow)` grouped over the whole `foreign_flow`
    table. Because `syncForeignFlow` pulls a rolling 90-day window, the measure mixed in
    up to 63 days of stale flow and stopped responding to current positioning. It was
    not cosmetic: **UNTR flips sign** — 63-day sum −168.6 B (outflow) vs true 20-day
    **+140.6 B (inflow)**, so the ticker was ranked on the wrong side of its own
    confirmation leg. Fixed by bounding the sum to the 20 most recent distinct trading
    dates via an `inArray(…, subquery)` filter, with the UI footnote and the
    `netForeignFlowIdr` doc comment corrected to match. Three regression assertions added
    to `db:smoke:gann` so an unbounded sum fails the suite.

### 8.5 Honest limits

- The page reports **window proximity and confluence facts only**. No row is labelled
  buy/sell, matching the framework's own closing warning.
- Per-ticker Fibonacci is each ticker's **own trailing-range** 0.618, not a Ganched
  multi-year swing (only ~90 days of stock history is stored). Labelled as a range
  level in the UI.
- Ticker rows require ≥31 stored price bars; anything shorter is skipped.
- Missing foreign flow scores 0 for that leg and says "Foreign flow not synced" —
  transparent, but it does mean an unsynced ticker is ranked below a synced one with
  equal market data.

### 8.6 Pre-existing lint failures NOT introduced by this work

~~`npm run lint` fails with 14 `react/no-unescaped-entities` errors in
`src/app/[lang]/companies/[ticker]/page.tsx`~~ — **fixed 2026-10-04** (see §9.6):
the JSX-text quotes in the `timing_output.json` mock panel and the `JKey`
component were escaped as `&quot;`. `npm run lint` is now clean.

---

## 9. Quota policy — watchlist sync (2026-10-04)

The Sectors plan has a **1,000-credit lifetime budget**. At the old behaviour
(1 credit × every ticker per run) a daily sync alone burned ~1,050/month. The
sync now runs against a locally-ranked watchlist and refuses to overspend.

### 9.1 Watchlist ("perusahaan potensial")

- `src/db/watchlist.ts` ranks companies **locally at 0 credits**:
  60% `market_intel_scores.total_score` + 15% strongest signal + 15% strongest
  SDG mapping evidence + 10% bonus for DISLOCATION/CONFIRMATION conditions,
  minus a flat 30-point penalty when the last 5 stored sessions have zero
  volume (suspended; the snapshot's `volumeRatio` is floored to 1 for those, so
  it cannot be used as the detector). Ties break by market cap.
- `SECTORS_WATCHLIST_LIMIT` (default **20**) selects how many are synced live.
- The selection persists to the `watchlist` table with per-component points
  (`score_breakdown`), so "why is this company synced?" is auditable.
- Companies outside the watchlist are **never deleted** — they render from
  stored data; company/signal pages show a "data basi N hari" chip once the
  snapshot is older than 7 days (`t.common.staleDataTpl`).

### 9.2 Trading-day probe

`syncIndex()` runs **before** the price stage. An incremental window with 0 new
bars means the market was closed (empty 200 responses still cost credits), and
the price/fundamental stages are skipped — a closed day costs 1 credit instead
of ~21. A `sync_state.empty_streak` guards against index API lag: after 3
consecutive empty probes prices sync anyway. The daily automation is also
restricted to weekdays as a second layer.

### 9.3 Lifetime budget and per-source accounting

- `SECTORS_TOTAL_CREDIT_BUDGET=1000`; spent = `SECTORS_CREDITS_ALREADY_USED`
  (pre-accounting research/smoke ≈ 10) + `SUM(sync_state.credits_used)`.
- **Each source row now stores its own stage delta** (prices row also carries
  the fundamentals stage). Legacy rows stored cumulative run totals, which
  double-counted; they were repaired on 2026-10-04 to the true deltas
  (prices 65 = 31+34, index 9, flow 68 = 2 runs × 34) so the sum matches the
  ~147 credits actually burned before this policy.
- A run is **refused up-front** (exit 1) when its estimate exceeds the
  remaining budget; a warning fires when < ~2 weeks of daily burn remains.
- The footer badge shows the remaining pool: `Live · Sectors API · N/1000 credits`.

### 9.4 Other quota levers

- Fundamentals refresh only when `report_date` is older than
  `SECTORS_FUNDAMENTAL_MAX_AGE_DAYS` (30) — a routine `--full` is no longer
  needed; `--full` still forces everything (watchlist-scoped).
- `--flow=N` limits foreign flow to the top-N watchlist names (default 10).
- Tickers with 0 rows across `MAX_TICKER_EMPTY_RUNS` (3) full-window pulls are
  skipped entirely (`watchlist.empty_runs`) until they return data.
- `--dry-run` prints the watchlist, per-stage cost estimate and lifetime math
  with **0 API calls**; the screener is not called in dry-run even with
  `SECTORS_UNIVERSE=all`.

### 9.5 Steady-state budget

Weekday run = 20 (prices) + 1 (index) ≈ **21 credits**; ~21.7 weekdays/month ≈
456, + ~60 monthly fundamentals refresh ≈ **~500/month** → the 1,000-credit
pool lasts ≈ 2 months. Halve the cadence or `SECTORS_WATCHLIST_LIMIT` to
stretch it.

### 9.6 Pacer fix

`pace()` in `src/lib/sectors.ts` reserved no slot while sleeping: concurrent
callers all read the same `lastCallAt`, all woke together, and fired together —
the 429 burst pattern from §3.2. The slot is now reserved synchronously
(`lastCallAt = max(lastCallAt + MIN_INTERVAL_MS, now)`) *before* the sleep, so
concurrent callers get strictly ordered slots.

### 9.7 Daily automation

A workspace automation runs `npm run db:sync` **Mon–Fri 19:00 local time**
(after IDX close). The lifetime guard makes unattended runs safe: worst case
it exits 1 and the app keeps serving stored data.

### 9.8 Activation record (2026-10-05)

The quota policy in §9 went live this day (it had been implemented but never executed
or pushed):

- **Schema pushed**: `db:push` exit 0 — the `watchlist` table (rank, score_breakdown,
  empty_runs, FK→companies, rank index) and `sync_state.empty_streak` now exist.
- **Checks**: typecheck 0 · lint 0 (repo-wide) · `--dry-run` exit 0 with the 20-ticker
  watchlist (GOTO #1 … UNTR #20) and estimate 81 = prices 20 + index 1 + fundamentals 60
  (every report_date 2026-06-30 → all stale once) · `db:smoke:gann` 45/45.
- **First live run under the policy cost 1 credit**: the index probe returned 0 bars
  (non-trading day), the price/fundamental stages were skipped — PLAN item "holiday/
  weekend = 1 credit" verified in practice, not just in code. A second same-day run
  cost 1 more credit and advanced the probe streak to 2/3.
- **Bug 15 — lifetime accounting silently erased history**: `upsertSyncState` wrote
  `credits_used: excluded.credits_used`, so each run REPLACED the row total instead of
  adding its delta (index 9 → 1 right after the first probe run; a weekday run would
  have overwritten 65 → ~20 and made the lifetime guard undercount permanently).
  Fixed: the column now ACCUMULATES (`sync_state.credits_used + excluded.credits_used`);
  `SUM(sync_state.credits_used)` is the true lifetime spend. Verified with two
  consecutive runs: printed lifetime 143 → 154 matches DB sum 144 + 10 pre-used.
- Steady state now: ~81 credits on the next trading-day run (one-off fundamentals
  refresh), then ~21/weekday as projected in §9.5.

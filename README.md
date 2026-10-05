# IDX Sectors 2030

Evidence-backed SDG execution intelligence for Indonesian listed companies. Business
events are mapped to UN SDG targets, classified by execution stage, scored against the
2030 horizon, and validated against live **Sectors Financial API v2** market data.

## Why IDX Sectors 2030 exists

The 2030 deadline is not symbolic — it is a financing and re-rating clock.

- **The UN 2030 Agenda ends in 2030.** The 17 Sustainable Development Goals and 169
  targets expire in 2030. Meeting them needs roughly US$4 trillion a year of additional
  financing in developing countries — private capital and capital markets are the
  channel that can close the gap.
- **Why IDX companies.** 900+ listed Indonesian companies disclose under OJK rules, so
  SDG execution — energy transition, digitalisation, water and sanitation — can be
  audited from public data instead of marketing claims.
- **Why now.** About four years remain. Allocation decisions made today — which projects
  get funded, which milestones get executed — decide who captures the SDG premium as
  2030 reprices execution.
- **Why cycle timing.** Markets discount execution years in advance. The 432-day cycle
  framework gives a timing context for when dislocations tend to close — the bridge
  between evidence and entry.

## What problem does it solve?

### Problem 1 — Too Much Information, Too Little Signal

There are many companies, market metrics, business announcements, and news articles.
Researchers cannot manually investigate all of them every day.

IDX Sectors 2030 filters:

```
Thousands of data points
        ↓
Business events
        ↓
Market context
        ↓
Derived signals
        ↓
Research priorities
```

The goal is not to show more information.
The goal is to identify *what deserves attention*.

### Problem 2 — Business News and Market Data Are Disconnected

A news article may report:

> A company announces a new renewable-energy project.

Market data may show:

```
Price            +4.2%
Volume           2.8× average
Industry         +1.1%
Revenue Growth   +15%
EPS Growth       +12%
```

When viewed separately, each data point tells only part of the story.

IDX Sectors 2030 connects them:

```
BUSINESS EVENT
       +
SDG RELEVANCE
       +
MARKET DATA
       +
FUNDAMENTALS
       +
SECTOR CONTEXT
       ↓
MARKET INTELLIGENCE SIGNAL
```

## Who is IDX Sectors 2030 for?

### Primary User — Market & Equity Researchers

Market analysts need to continuously identify:

- companies undergoing significant change;
- unusual market activity;
- improving or deteriorating fundamentals;
- sector movements;
- new business events;
- changes that are not immediately obvious from a conventional stock screener.

IDX Sectors 2030 helps them move from:

> *Thousands of data points*

to:

> *A small number of meaningful signals worth investigating.*

### Secondary User — Impact & Sustainability Researchers

Researchers focused on sustainable development need more than a list of companies
claiming to support ESG or sustainability.

They need to know:

- what the company is actually doing;
- which SDG target the activity relates to;
- whether the activity is only an intention or already being executed;
- when the activity is expected to progress;
- how much execution runway remains before 2030.

> **Research intelligence only.** Not investment advice. No price prediction, no
> buy/sell recommendations.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.6 (App Router, Turbopack, React 19) |
| Language | TypeScript 5.9 (strict) |
| Database | PostgreSQL 17 + Drizzle ORM 0.45 |
| Styling | Tailwind CSS 4 |
| Market data | Sectors Financial API v2 (IDX) |
| i18n | `en` / `id` / `zh` |

---

## 1. Prerequisites

- **Node.js 20+** (developed on v24.19.0)
- **PostgreSQL 14+** (developed on 17.11)
- A **Sectors API key** — [sectors.app/api](https://sectors.app/api), Insider plan.
  Without it the app still runs entirely on the seeded demonstration dataset.

### Windows (Git Bash)

```bash
winget install --id OpenJS.NodeJS.LTS -e
winget install --id PostgreSQL.PostgreSQL.17 -e --source winget \
  --override "--mode unattended --unattendedmodeui none \
    --superpassword postgres --servicename postgresql-x64-17 \
    --serviceaccount NTRIGHTS --serverport 5432 --disable-components stackbuilder"
export PATH="/c/Program Files/nodejs:$PATH"
```

> On Windows, `export PATH="/c/Program Files/nodejs:$PATH"` is required in **every**
> new shell.

### macOS / Linux

```bash
brew install node postgresql@17   # or your distro's equivalent
brew services start postgresql@17
```

---

## 2. Setup

```bash
npm install
cp .env.example .env      # then fill in SECTORS_API_KEY and DATABASE_URL
createdb app_db            # or: psql -c "CREATE DATABASE app_db;"
npm run db:push            # create the 14 tables
npm run db:seed            # 42 events, 34 companies, 17 goals, 24 targets
npm run db:sync            # optional: replace seed prices with live Sectors data
npm run dev
```

Open <http://localhost:3000>. The dev server picks its own port when 3000 is busy —
read it from the console output.

---

## 3. Commands

| Command | What it does | Credits |
|---|---|---|
| `npm run dev` | Next.js dev server | — |
| `npm run build` / `npm start` | Production build / serve | — |
| `npm run typecheck` | `tsc --noEmit` | — |
| `npm run lint` | ESLint | — |
| `npm run db:push` | Apply schema (drizzle-kit push) | — |
| `npm run db:seed` | Load the demonstration dataset | — |
| `npm run db:sync` | Sync prices + index + derived tables | ~1/ticker |
| `npm run db:sync -- --full` | Also refresh company fundamentals | +3/company |
| `npm run db:sync -- --flow` | Also pull net foreign flow | +1/ticker |
| `npm run db:sync -- --index` | Force a full IHSG re-pull | ~1 per 90 days |
| `npm run db:smoke` | Verify the Sectors response shapes | 2 |
| `npm run db:smoke:gann` | Verify the Gann 432 maths (pure + live) | **0** |

**Exit codes for `db:sync`:** `0` success · `1` no API key or no data synced ·
`2` partial failure (re-run to retry the missing tickers).

---

## 4. Environment variables

See [`.env.example`](.env.example) and [`.env.production.example`](.env.production.example).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Runtime connection |
| `DIRECT_URL` | migrations | Direct (non-pooled) connection for `db:push` |
| `SECTORS_API_KEY` | for live data | Raw key in the `Authorization` header — **no `Bearer` prefix** |
| `SECTORS_API_BASE_URL` | no | Defaults to `https://api.sectors.app/v2` |
| `SECTORS_UNIVERSE` | no | `curated` (34 app companies) or `all` (full IDX) |
| `SECTORS_DAILY_CREDIT_BUDGET` | no | Soft per-run guard, default `200` |
| `SECTORS_MIN_INTERVAL_MS` | no | Global pacer floor, default `1500` |
| `SECTORS_INDEX_CODE` | no | Index anchoring the Gann module, default `ihsg` |
| `SECTORS_INDEX_HISTORY_DAYS` | no | Index history depth, default `740` |
| `SEGMENTS_API_KEY` | reserved | Segments.ai labeling pipeline (not yet wired) |
| `SUPABASE_*` | deploy | Supabase connection + platform keys |

> An **empty string counts as unset**. `DIRECT_URL=` must not be left blank or it
> shadows `DATABASE_URL` and `drizzle-kit` fails with
> `Please provide required params for Postgres driver: url: ''`.

---

## 5. Architecture

```
src/
  app/[lang]/          pages: dashboard, picker, goals, engine, gann, companies/*, signals/*
  components/          Nav, Footer, GannWindowGauge, GannMatrix, charts, ui primitives
  db/
    schema.ts          14 Drizzle tables
    seed.ts            demonstration dataset + reference formulas
    sync.ts            Sectors → Postgres, incremental & idempotent
    queries.ts         read layer for every page
    smoke-sectors.ts   Sectors response-shape verification
    smoke-gann.ts      Gann maths verification (zero credits)
  lib/
    sectors.ts         typed REST client: pacer, retry, credit budget
    gann.ts            cycle maths, swing detection, derived Fib, RSI (pure)
    marketIntel.ts     70% Sectors / 20% evidence / 10% SDG score
    scoring.ts         timing + market scoring
    regime.ts          BEI ARA/ARB price-floor bands
    system.ts          2030 execution clock, formatters
```

### Sync-to-Postgres, not live proxy

Every page reads relational SQL. `db:sync` fills the same tables. **The API key never
enters a request path** — it is only used by the sync script. Without a key the app
serves the seeded dataset and no page breaks; the footer badge shows *Live · Sectors
API* vs *Demo dataset* by checking whether a `sync_state` row exists.

---

## 6. Sectors API notes

Everything below was verified live, not read from docs.

- **v2 only.** `v1` returns HTTP 410 Gone (discontinued 2026-05-11).
- Auth is the **raw key** in `Authorization` — no `Bearer`.
- `GET /daily/{symbol}/` → `[{symbol:"BBCA.JK", date, open, high, low, close, volume, market_cap}]`.
  Response symbols carry a **`.JK`** suffix (stripped before insert).
  `market_cap` is **full IDR**; the schema stores **billions** (÷ 1e9).
- `GET /index-daily/{code}/` → `[{index_code:"IHSG", date, price}]`.
  **Max 90 days per call** — wider ranges are silently clamped, so long history
  must be pulled in chunks.
- `GET /foreign-flow/{symbol}/` → `{symbol, start, end, data:[...]}` — an **object**,
  not a bare array like `/daily/`.
- **Billing is asymmetric:** 2xx *and 404* consume credits; 400/401/403/429/5xx are free.
- Retryable: 429, 502, 503, 504.

---

## 7. Troubleshooting

**`Sectors API 429` / tickers dropped**
The plan rate-limits below ~1500 ms even with retries. Raise
`SECTORS_MIN_INTERVAL_MS`, and re-run — `sync_state` makes the next run incremental
rather than repeating the full window. Any ticker left with **zero** rows gets a
full-window backfill automatically, so rate-limited names self-heal.

**`Please provide required params for Postgres driver: url: ''`**
An empty `DIRECT_URL` is shadowing `DATABASE_URL`. Either fill it in or remove the line.

**`SECTORS_API_KEY is not set`**
Expected without a key. `db:sync` exits `1` and the app keeps serving seed data.

**Gann page shows "No index history stored yet"**
Run `npm run db:sync` to pull the IHSG series.

**First `/en/gann` request takes ~10 s**
Dev-mode RSC compilation, not query time. The Gann queries themselves measure
`getGannWindow()` ≈ 1.4 s and `getGannTickers()` ≈ 0.45 s warm.

---

## 8. Gann 432 module (`/[lang]/gann`)

A time-cycle overlay that positions the IHSG inside the Gann 144/288/432-day cycle.

**The zero point is detected, never hard-coded.** The module takes the lowest
confirmed close in a trailing 400-day window (excluding the final 30 days so an
in-progress decline cannot anchor itself, with ≥3 bars of clearance on each side).
Fibonacci levels are likewise **derived** from the detected low→high swing.

This is deliberate. The framework this module came from anchored the cycle on IHSG
6,270 (Feb 2025) as an absolute swing low and hard-coded Fib 0.618 = 5,922 and
0.786 = 5,037. Against live data:

- IHSG actually traded **6,787–7,952 through H2-2025**, so Feb 2025 was a *minor* low.
- 432 calendar days from 2025-02-28 is **2026-05-06**, not "April 2026"; the index was
  **7,092** that day — ~25% above the low that actually formed.
- The two Fib numbers cannot both come from one swing: they imply a 9,178 → 3,910
  range, which does not exist in IHSG history.

Detection removes that whole class of error instead of preserving it. The detected
anchor as of the last sync is **2026-06-08 @ 5,342.14**, putting the next 144-day
window at **2026-10-30**.

The page reports **window proximity and confluence facts only** — no row is labelled
buy/sell, matching the framework's own instruction to use time analysis as
confirmation rather than a standalone signal.

---

## 9. Deploying to Supabase

Use **two** connection strings:

- `DATABASE_URL` → **pooled, port 6543** (pgbouncer) for the running app, so
  serverless instances don't exhaust connections.
- `DIRECT_URL` → **direct, port 5432** for `db:push`. pgbouncer in transaction mode
  breaks drizzle-kit's schema introspection.

```bash
npm run db:push    # uses DIRECT_URL
npm run db:seed    # optional demo content
```

For a scheduled refresh, run `db:sync` from a cron/CI job — never expose the Sectors
key to the browser. Set every variable from [`.env.production.example`](.env.production.example)
in your host's environment settings; `.env*` is gitignored apart from the two examples.

---

## 10. Further reading

- [Sectors API docs](https://docs.sectors.app/)
- [AGENTS.md](AGENTS.md) — session changelog: integration details, six bugs found and fixed, verified state
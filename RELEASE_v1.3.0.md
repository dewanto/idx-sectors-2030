# IDX Sectors 2030 — Release v1.3.0 ⏰

**The sync now runs itself.**

> Third minor release: market data synchronization moves from a manual CLI
> command to a daily automated cron — the deployment wakes up every day at
> 01:00 UTC, pulls the latest trading day from the Sectors API, and rebuilds
> every derived score.

---

## 🚀 Live Deployment

**https://idx-sectors-2030.vercel.app/**

---

## ✨ What's New in 1.3.0

### Daily automated sync via Vercel Cron

- `vercel.json` schedules `GET /api/sync` at **01:00 UTC every day** — after
  IDX market close, so the daily bars, index history, fundamentals and derived
  intelligence scores refresh without any manual step
- The existing sync protections all apply on the cron path: the **index probe
  first** (a non-trading day costs 1 credit, not the whole watchlist),
  **incremental windows**, the **lifetime credit budget guard**, and
  **source-specific credit accounting** in `sync_state`

### New HTTP sync endpoint

- `GET` + `POST /api/sync` runs the full pipeline
  (watchlist prices → fundamentals → derived snapshots + intel scores)
- Bearer-token protected: Vercel Cron sends
  `Authorization: Bearer ${CRON_SECRET}` automatically; manual POSTs must send
  the same header
- `maxDuration = 60` — the maximum Vercel allows, sized for a full
  fundamentals refresh

### `runSync()` — one pipeline, two entry points

- `src/db/sync.ts` now exports `runSync(opts)` returning a structured
  `SyncResult` with machine-readable exit codes (`SYNC_OK`, `SYNC_FAILED`,
  `SYNC_ABORTED`)
- The CLI (`npm run db:sync`) and the cron endpoint share the exact same code
  path — `db:sync --dry-run`, `--full`, `--flow=N` and `--index` keep working
  unchanged

---

## 🔧 Operations

Environment variable added on Vercel:

| Variable | Purpose |
|---|---|
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/sync` |

Manual trigger (same pipeline as the cron):

```bash
curl -X POST https://idx-sectors-2030.vercel.app/api/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

The CLI stays fully supported:

```bash
npm run db:sync              # manual sync (unchanged)
npm run db:sync -- --dry-run # cost plan, 0 API calls
```

---

## 🧪 Verification

```bash
npm test            # Jest unit suite (pure logic, no DB/network)
npm run test:e2e    # Playwright end-to-end suite
npm run typecheck   # strict TypeScript
```

---

## 📦 Release

- **Tag:** `v1.3.0`
- **Changelog:** [CHANGELOG.md](https://github.com/dewanto/idx-sectors-2030/blob/main/CHANGELOG.md)

---

*Built for the IDX Sectors 2030 hackathon — connecting the UN 2030 Agenda with Indonesian listed companies and market intelligence.*
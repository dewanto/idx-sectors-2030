# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-08

### Added

- Daily automated data sync via Vercel Cron Jobs — `vercel.json` triggers
  `GET /api/sync` at 01:00 UTC every day (after IDX market close and settlement
  of the daily bars), so the watchlist, index history, fundamentals and derived
  scores refresh without a manual `npm run db:sync`
- `GET` + `POST /api/sync` route handler running the full sync pipeline —
  protected by bearer-token auth against the `CRON_SECRET` environment
  variable (Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
  automatically); `maxDuration` raised to 60s to cover a full fundamentals
  refresh
- `runSync()` exported entry point in `src/db/sync.ts` with a structured
  `SyncResult` and machine-readable exit codes (`SYNC_OK`, `SYNC_FAILED`,
  `SYNC_ABORTED`) so the pipeline runs identically as the CLI
  (`npm run db:sync`) and from the cron HTTP endpoint — the CLI bootstrap
  moved to `src/db/sync-cli.ts` (same command, same exit codes; importing
  `src/db/sync` no longer starts a sync)

## [1.2.0] - 2026-10-07

### Added

- Autoplaying product teaser in the dashboard hero — desktop only, muted + looping,
  framed to match the terminal aesthetic
- SDG wheel logo in the top bar (SVG, 17 official UN SDG colors) — matching the favicon identity
- Product teaser + judging video embedded in the README, plus a live-app link

### Changed

- All user-facing copy now reflects live Sectors API operation — demo/seeded wording
  removed from the footer disclaimer (EN/ID/ZH), the About execution clock (live date
  and live D-countdown), the Engine "computed" chip (live date), and the README
  (live-first data section)
- Research briefs in the database updated in place (41 rows) to drop the seeded-series
  disclaimer

### Removed

- The demonstration dataset and all seed tooling — `npm run db:seed`, `src/db/seed.ts`,
  and the admin seed route; fresh installs load live data with `npm run db:sync`

## [1.1.0] - 2026-10-07

### Added

- Interactive onboarding tour (driver.js) — 7 stops across pages:
  Dashboard → Signal Picker → Scan → Signal cards → Heatmap → Company file → Gann
- Tour auto-starts on the dashboard on first visit; state persisted in
  localStorage (`idx2030_tour_done`, `idx2030_tour_step`) so the tour survives
  page navigation and can be resumed
- "Take Tour" button in the navbar to relaunch the tour anytime
- Bilingual tour copy (EN/ID, shared ZH dictionary entries) including button
  labels and progress counter
- Playwright e2e suite for the onboarding tour (guided walk with URL
  transitions, dismiss/remember/relaunch, ID locale)

## [1.0.0] - 2026-10-07

### Added

- 7-dimensional market intelligence scoring engine
- Price dislocation signal with z-score normalization
- Volume anomaly detection with percentile ranking
- Relative performance composite scoring
- Fundamental context multi-factor analysis
- Market/Industry context aggregation
- Market conditions regime classification
- Signal Picker with SDG-based filtering
- Gann Analysis integration with Sectors data
- Goals Engine for investment planning
- Heatmap visualization (sector & signal)
- Historical timeline analysis
- Execution Clock for market timing
- Bilingual support (EN/ID)
- PostgreSQL sync architecture (Sync→Store→Derive→Query)
- Server-side API key management (zero client exposure)

[1.3.0]: https://github.com/dewanto/idx-sectors-2030/releases/tag/v1.3.0
[1.2.0]: https://github.com/dewanto/idx-sectors-2030/releases/tag/v1.2.0
[1.1.0]: https://github.com/dewanto/idx-sectors-2030/releases/tag/v1.1.0
[1.0.0]: https://github.com/dewanto/idx-sectors-2030/releases/tag/v1.0.0
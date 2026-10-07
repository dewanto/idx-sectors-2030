# Pemetaan Changeset Fitur v1.0.0 → Commit Riil

Dokumen ini memetakan **16 changeset** di `CHANGELOG.md` versi 1.0.0 ke commit riil di
repository. Konteks penting: sebagian besar mesin inti (scoring, picker, heatmap, Gann,
goals, sync) masuk utuh pada **commit awal `f5a08da`** ("Init Dyad app"), lalu disempurnakan
oleh commit-commit berikutnya. Kolom "Commit nyata" mencantumkan semua commit yang relevan.

Pesan "Saran konvensional" adalah judul Conventional Commits yang disarankan untuk changeset
tersebut — didokumentasikan sebagai pemetaan naratif, **bukan** hasil rewrite history git
(riwayat tidak pernah ditulis ulang; lihat [COMMIT_HISTORY.md](./COMMIT_HISTORY.md)).

## Tabel pemetaan

| # | Changeset (CHANGELOG) | Saran konvensional | Commit nyata | Artefak utama | Verifikasi |
|---|---|---|---|---|---|
| 01 | 7-dimensional market intelligence scoring engine | `feat(core): 7-dimensional market intelligence scoring engine` | `f5a08da` | `src/lib/marketIntel.ts`, `src/lib/scoring.ts` | `npm test -- marketIntel` |
| 02 | Price dislocation signal (z-score) | `feat(signal): price dislocation z-score signal` | `f5a08da` | `src/lib/marketIntel.ts`, `src/lib/regime.ts` | `npm test` |
| 03 | Volume anomaly detection (percentile) | `feat(signal): volume anomaly percentile ranking` | `f5a08da` | `src/lib/marketIntel.ts`, `src/db/sync.ts` (`volumeRatio20d`) | `npm test` |
| 04 | Relative performance composite | `feat(signal): relative performance composite scoring` | `f5a08da` | `src/lib/scoring.ts` | `npm test` |
| 05 | Fundamental context multi-factor | `feat(signal): fundamental context multi-factor analysis` | `f5a08da` | `src/db/sync.ts`, `src/lib/marketIntel.ts` | `npm test` |
| 06 | Market/Industry context aggregation | `feat(signal): market and industry context aggregation` | `f5a08da` | `src/lib/marketIntel.ts` | `npm test` |
| 07 | Market conditions regime classification | `feat(signal): market conditions regime classification` | `f5a08da` | `src/lib/marketIntel.ts` (`marketIntelligenceScore`) | `npm test` |
| 08 | Signal Picker (SDG filtering) | `feat(picker): signal picker with SDG-based filtering` | `f5a08da`, `a4e02c5` | `src/app/[lang]/picker/`, e2e user-journey spec | `npm run test:e2e` |
| 09 | Gann Analysis integration | `feat(gann): gann analysis with sectors data` | `f5a08da` | `src/lib/gann.ts` (`GANN_CYCLES`), `src/app/[lang]/gann/` | `npm test -- gann` |
| 10 | Goals Engine | `feat(goals): goals engine for investment planning` | `f5a08da` | `src/lib/goals.ts`, `src/app/[lang]/picker/` | `npm test -- goals` |
| 11 | Heatmap visualization | `feat(viz): sector and signal heatmap` | `f5a08da` | `src/components/Heatmap.tsx` | manual: `/id/heatmap` |
| 12 | Historical timeline | `feat(viz): historical timeline rail` | `f5a08da` | `src/components/TimelineRail.tsx` (`RAIL_START/RAIL_END`) | manual: timeline |
| 13 | Execution Clock | `feat(viz): execution clock for market timing` | `f5a08da`, `940daa7` | `src/components/ExecutionClock.tsx`, `src/lib/live-clock.ts` | manual: clock |
| 14 | Bilingual (EN/ID) | `feat(i18n): bilingual support en and id` | `f5a08da` | `src/i18n/dict.ts` (kini +ZH) | manual: ganti locale |
| 15 | PostgreSQL sync architecture | `feat(db): sync store derive query architecture` | `f5a08da`, `6ff92f0`, `ed99127` | `src/db/sync.ts`, `src/app/api/admin/migrate/` | `npm run db:push` |
| 16 | Server-side API key | `feat(security): server-side sectors api key` | `f5a08da`, `955c153` | `src/app/api/signals/`, laporan security review | grep: tidak ada key di client |

## Catatan changeset dengan penyempurnaan pasca-impor

- **#08 Signal Picker** — commit `a4e02c5` menambahkan E2E test perjalanan pengguna
  (filter SDG → hasil picker) yang mengunci perilaku picker.
- **#13 Execution Clock** — commit `940daa7` mengekstrak `src/lib/live-clock.ts`:
  tanggal live & days-left mengikuti locale (EN/ID/ZH) di Nav dan ExecutionClock.
- **#15 Sync architecture** — `6ff92f0` mengeksekusi deploy skema+data ke Supabase dan
  `ed99127` menambahkan migrasi data lokal→Supabase satu klik (`/api/admin/migrate`)
  plus panduan publish Vercel. Rute admin ini kemudian di-audit di `955c153`.
- **#16 Server-side API key** — `955c153` (security review) mengonfirmasi tidak ada
  kebocoran `SECTORS_API_KEY` ke bundle client.

## Cara membaca ulang audit

```bash
git log --oneline --reverse          # kronologi 25 commit
git show --stat f5a08da              # isi impor awal (mayoritas changeset #01–#14)
git show --stat 55c9953              # artefak rilis v1.0.0
```
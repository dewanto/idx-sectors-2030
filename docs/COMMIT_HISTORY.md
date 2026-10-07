# Riwayat Commit — IDX Sectors 2030

Audit riwayat `git log` lengkap: **25 commit** sejak inisialisasi aplikasi (2026-10-05)
sampai rilis tour onboarding (2026-10-07).

> **Catatan metodologi.** Sebelas commit ditulis otomatis oleh asisten Dyad tanpa pesan
> commit (hanya berisi jumlah file yang berubah, ditandai ✱ di tabel). Untuk commit-commit
> itu, kolom "Judul" adalah hasil audit isi perubahan — bukan pesan asli di git. Commit
> lainnya memakai pesan asli apa adanya. Untuk pemetaan 16 changeset fitur v1.0.0 ke
> commit riil, lihat [COMMITS_v1.0.0.md](./COMMITS_v1.0.0.md).

## Tag rilis

| Tag | Commit target | Catatan |
|---|---|---|
| `v1.0.0` | `55c9953` | Snapshot rilis hackathon — sebelum tour onboarding |
| `v1.1.0` | HEAD | Menambahkan tour onboarding interaktif (driver.js) |

## 2026-10-05 — Hari 1: setup, deploy Supabase, stabilisasi

| Hash | Judul | Kategori |
|---|---|---|
| `f5a08da` | Init Dyad app (impor awal seluruh aplikasi: mesin skor 7 dimensi, picker, heatmap, Gann, goals, sync) | Setup |
| `77fe627` | chore: auto-commit local changes before connecting to GitHub | Setup |
| `8241540` ✱ | Konfigurasi: `.gitignore` +`.dyad/`, tambah `AI_RULES.md` | Konfigurasi |
| `a4e02c5` | Add and verify a critical user journey E2E test (Playwright) | Testing |
| `4ba3db4` | Fix stale Turbopack/PostCSS development runtime error | Fix |
| `6ff92f0` | Eksekusi deploy: skema + data ke Supabase, verifikasi, publish | Deploy |
| `ed99127` | Migrasi data lokal→Supabase satu klik + panduan publish Vercel | Deploy |
| `20ed424` ✱ | README: section "Why it exists / Problem / Who is it for" | Docs |
| `955c153` ✱ | Laporan security review + findings (rute admin `/api/admin/migrate`) | Docs / Keamanan |
| `ca7d513` | Fix failed query getAllSignals: duplikat DATABASE_URL, DB target kosong, RLS tanpa policy | Fix |
| `806251b` | Investigasi koneksi gagal ke Supabase + rencana perbaikan | Investigasi |
| `9719d2d` ✱ | `dbdiag`: unwrap `.cause` error Drizzle agar akar masalah terlihat | Diagnostik |

## 2026-10-06 — Hari 2: narasi produk, About, hero, clock, footer

| Hash | Judul | Kategori |
|---|---|---|
| `7cc3ed4` | update README.md (by Dewanto Agung) | Docs |
| `ad35186` | Rewrite halaman About: tesis pendirian IDX Sectors 2030 | Produk |
| `e96a0ff` | Upgrade hero homepage: tesis "THE WORLD HAS A PLAN" | Produk |
| `940daa7` ✱ | `live-clock.ts`: tanggal live & days-left per locale (Nav, ExecutionClock) | Produk |
| `0a5770` ✱ | Nav: tombol link ke repo GitHub | Produk |
| `7b447a2` | Merge branch 'main' of github.com/dewanto/idx-sectors-2030 | Maintenance |
| `eecdbd5` ✱ | Footer: badge "Sectors Hackathon 2026" menjadi link ke hackathon.sectors.app | Produk |

## 2026-10-07 — Hari 3: test suite, coverage, rilis docs, tour onboarding

| Hash | Judul | Kategori |
|---|---|---|
| `1daa227` | Jest unit test suite untuk IDX Sectors 2030 (5 file test, CI workflow, badge README) | Testing |
| `7beba55` ✱ | Fix `jest.config.js`: blok JSDoc berisi glob `**` memecah `npm test` | Fix |
| `f38e215` ✱ | Commit artefak coverage report HTML (lcov-report) | Testing / Laporan |
| `f9a403a` | Fix pagination `fetchCompaniesAllPages` (stop condition) + unit test + refresh coverage | Fix |
| `55c9953` ✱ | Release docs v1.0.0: `CHANGELOG.md`, `RELEASE_v1.0.0.md`, `deployment-url.txt`, `scripts/release-v1.0.0.sh`, version 1.0.0, badge README | Rilis |
| `2be936c` | Add driver.js interactive onboarding tour with EN/ID support | Fitur |
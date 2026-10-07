# IDX Sectors 2030 — Release v1.2.0 📡

**Live data, everywhere.**

> Second minor release: the product now presents itself as what it is — a live-data application. All demonstration/seeded wording is gone from the product, its copy, and its docs.

---

## 🚀 Live Deployment

**https://idx-sectors-2030.vercel.app/**

---

## ✨ What's New in 1.2.0

### Dashboard hero — autoplaying product teaser (desktop)

- The 1-minute product teaser autoplays (muted + looping) in the hero's right column on desktop (`lg+`), framed to match the terminal aesthetic
- Mobile keeps the clean text-only hero

### SDG wheel logo

- The top bar brand now uses an inline SVG wheel of the 17 official UN SDG colors — the same identity as the favicon

### Live-data copy, everywhere

- **Footer disclaimer (EN/ID/ZH):** "Market data is synchronized live from the Sectors API (rolling ~90-day window per ticker)"
- **About §10:** live system clock + live D-countdown — the fixed "28 Sep 2026" system date is gone
- **Engine:** "Computed from {n} listed companies · {live date}"
- **README:** live-first data section; demonstration-mode documentation removed
- **Research briefs:** 41 briefs in the database updated in place — no seeded-series wording remains
- **Footer badge fallback:** "Awaiting first sync" (was "Demo dataset")

### Removed

- The demonstration dataset and all seed tooling — `npm run db:seed`, `src/db/seed.ts`, and the admin seed route. Fresh installs load live data with `npm run db:sync`.

---

## 🧪 Verification

```bash
npm test            # Jest unit suite (pure logic, no DB/network)
npm run test:e2e    # Playwright end-to-end suite
npm run typecheck   # strict TypeScript
```

---

## 📦 Release

- **Tag:** `v1.2.0`
- **Changelog:** [CHANGELOG.md](https://github.com/dewanto/idx-sectors-2030/blob/main/CHANGELOG.md)

---

*Built for the IDX Sectors 2030 hackathon — connecting the UN 2030 Agenda with Indonesian listed companies and market intelligence.*
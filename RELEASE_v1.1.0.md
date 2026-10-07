# IDX Sectors 2030 — Release v1.1.0 🧭

**The world has a plan. Companies execute it. Markets reveal signals. — and now the platform shows you around.**

> First minor release after the hackathon baseline: a guided, cross-page onboarding tour in English and Indonesian.

---

## 🚀 Live Deployment

**https://idx-sectors-2030.vercel.app/**

---

## ✨ What's New in 1.1.0

### Interactive Onboarding Tour (driver.js)

A 7-stop guided tour that walks new users through the entire research flow — across real pages, not screenshots:

| Stop | Page | What it shows |
|---|---|---|
| 1 | Dashboard | Market intelligence environment & signal cards |
| 2 | Signal Picker | SDG-based research scanning |
| 3 | Signal Picker | Run a scan to generate a ranked shortlist |
| 4 | Signal cards | Reading scores, evidence, and timing |
| 5 | Heatmap | Sector × SDG signal intensity |
| 6 | Company file | Deep-dive on the strongest current signal |
| 7 | Gann | Time-cycle context (144/288/432-day windows) |

**Behavior:**

- **Auto-starts on the dashboard on first visit** — state is persisted in `localStorage` (`idx2030_tour_done`, `idx2030_tour_step`), so the tour survives page navigation and can resume where you left off
- **"Take Tour" button in the navbar** — relaunch the tour anytime, from any page
- **Bilingual copy (EN/ID, shared ZH dictionary entries)** — step titles, descriptions, button labels, and progress counter all localized
- Keyboard navigation is intentionally disabled; all movement flows through the tour's own Next/Back controls so cross-page steps stay in sync

---

## 🧪 Verification

```bash
npm test            # Jest unit suite (pure logic, no DB/network)
npm run test:e2e    # Playwright — includes the new onboarding-tour spec
npm run typecheck   # strict TypeScript
```

The new e2e spec (`e2e-tests/onboarding-tour.spec.ts`) covers the guided walk with URL transitions, dismiss/remember/relaunch behavior, and the ID-locale tour.

---

## 📦 Release

- **Tag:** `v1.1.0` (baseline tag: `v1.0.0`)
- **Changelog:** [CHANGELOG.md](https://github.com/dewanto/idx-sectors-2030/blob/main/CHANGELOG.md)
- **Commit history audit:** [docs/COMMIT_HISTORY.md](https://github.com/dewanto/idx-sectors-2030/blob/main/docs/COMMIT_HISTORY.md)

---

*Built for the IDX Sectors 2030 hackathon — connecting the UN 2030 Agenda with Indonesian listed companies and market intelligence.*
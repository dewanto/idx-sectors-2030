# IDX Sectors 2030 — Hackathon Release 🏆

**The world has a plan. Companies execute it. Markets reveal signals.**

> **2030 Execution Intelligence for Indonesian Markets** — a market intelligence platform connecting global SDG priorities, company execution, business evidence, and Sectors market data into derived research signals.

---

## 🚀 Live Deployment

**https://idx-sectors-2030.vercel.app/**

## 🖥️ Product Tour (live pages)

| Page | Link |
|---|---|
| Dashboard — market intelligence environment | https://idx-sectors-2030.vercel.app/en |
| Signal Picker — SDG-based research scanning | https://idx-sectors-2030.vercel.app/en/picker |
| SDG Map — goals & targets | https://idx-sectors-2030.vercel.app/en/goals |
| Engine — scoring methodology | https://idx-sectors-2030.vercel.app/en/engine |
| Gann Analysis — time-cycle context | https://idx-sectors-2030.vercel.app/en/gann |
| About — product thesis | https://idx-sectors-2030.vercel.app/en/about |

---

## ✨ What's Inside

### Market Intelligence Engine

- **7-dimensional market intelligence scoring engine** — market-derived context, business evidence, and SDG/2030 relevance combined into explainable scores
- **Price dislocation signal** with z-score normalization
- **Volume anomaly detection** with percentile ranking
- **Relative performance composite scoring**
- **Fundamental context multi-factor analysis** — revenue growth, EPS growth, dividend yield
- **Market/Industry context aggregation** — sector and broader market performance
- **Market conditions regime classification** — Dislocation / Confirmation / Divergence / Neutral

### Product Surfaces

- **Signal Picker with SDG-based filtering** — start from an SDG or target, add execution stage, evidence/timing thresholds, and market conditions to generate a ranked shortlist → https://idx-sectors-2030.vercel.app/en/picker
- **Goals Engine for investment planning** → https://idx-sectors-2030.vercel.app/en/goals
- **Gann Analysis integration with Sectors data** — 144/288/432-day cycle windows, swing detection, Fibonacci levels, price-time confluence → https://idx-sectors-2030.vercel.app/en/gann
- **Heatmap visualization** — sector × SDG signal intensity → https://idx-sectors-2030.vercel.app/en
- **Historical timeline analysis** — execution stages and completion windows across the 2030 horizon
- **Execution Clock for market timing** — positions every signal within the 2015–2030 execution framework → https://idx-sectors-2030.vercel.app/en
- **Bilingual support (EN/ID)** — full English/Indonesian interface via the language switcher

### Architecture & Security

- **PostgreSQL sync architecture** — Sync → Store → Derive → Query: Sectors data synchronized server-side, scores derived locally from stored prices, queries served from the database
- **Server-side API key management** — the Sectors API key never enters a browser request path; zero client exposure
- **Incremental synchronization with credit awareness** — watermarks, per-run guards, lifetime credit budgeting, retry/backoff pacing

---

## 📊 Methodology

```text
70%  Sectors-derived market layer
20%  Business-event evidence
10%  SDG / 2030 dimension
```

> This scoring methodology is an IDX Sectors 2030 product methodology. It is **not an official Sectors formula**.

## 🔬 Research Safety

IDX Sectors 2030 is a research intelligence application. It does not provide personalized investment advice, predict future stock prices, execute trades, or issue buy/sell recommendations.

---

## 📦 Release

- **Tag:** `v1.0.0`
- **Changelog:** [CHANGELOG.md](https://github.com/dewanto/idx-sectors-2030/blob/main/CHANGELOG.md)

---

*Built for the IDX Sectors 2030 hackathon — connecting the UN 2030 Agenda with Indonesian listed companies and market intelligence.*
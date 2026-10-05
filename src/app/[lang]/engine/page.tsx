import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Braces,
  CircleSlash,
  Gauge,
  Grid3X3,
  Layers,
  ListOrdered,
  Newspaper,
  Scale,
  ShieldAlert,
  Sigma,
  Tags,
  Waves,
} from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CountUp from "@/components/CountUp";
import { SectionHead, ScoreBar, StageBadge } from "@/components/ui";
import { getEngineData } from "@/db/queries";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { tpl } from "@/i18n/dict";
import { PRICE_FLOOR_CONFIG, type CompanyEngineResult } from "@/lib/regime";
import { fmtDate, fmtIdr, fmtPct, fmtPrice } from "@/lib/system";

export const dynamic = "force-dynamic";

const REGIME_ORDER = [
  "NORMAL",
  "EARLY_STRESS",
  "STRESS",
  "CAPITULATION",
  "STABILIZATION",
  "RECOVERY",
  "RE_RATING",
  "LATE_CYCLE",
];

const REGIME_TONES: Record<string, string> = {
  NORMAL: "#39C06A",
  EARLY_STRESS: "#FCC30B",
  STRESS: "#FF9F2E",
  CAPITULATION: "#F25C5C",
  STABILIZATION: "#5FA8D3",
  RECOVERY: "#39C06A",
  RE_RATING: "#00B3A4",
  LATE_CYCLE: "#C9D1E0",
};

const CONFIRM_TONES: Record<string, string> = {
  NOT_CONFIRMED: "#8A94A6",
  PARTIALLY_CONFIRMED: "#FFB224",
  SUPPORTED: "#5FA8D3",
  STRONGLY_SUPPORTED: "#39C06A",
};

const VERDICT_TONES: Record<string, string> = {
  WATCH: "#8FB8FF",
  PRIORITY: "#FFB224",
  HIGH_PRIORITY: "#F25C5C",
  MONITOR: "#7c8698",
};

export default async function EnginePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const d = await getEngineData();
  const e = t.engine;

  const currentRegimeRow =
    d.regime === "STRESS" || d.regime === "CAPITULATION" || d.regime === "EARLY_STRESS"
      ? "STRESS"
      : d.regime === "STABILIZATION"
        ? "STABILIZATION"
        : d.regime === "RECOVERY"
          ? "RECOVERY"
          : "RE_RATING";

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />

      {/* header */}
      <section className="dotgrid border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
          <div className="flex items-center gap-2">
            <Gauge size={14} className="text-[color:var(--accent)]" />
            <span className="label !text-[color:var(--accent)] text-[9px]">{e.badge}</span>
          </div>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight md:text-[44px]">
            {e.titleA} <span className="text-[color:var(--accent)]">{e.titleB}</span>
          </h1>
          <p className="mt-3 max-w-[720px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">{e.sub}</p>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
            <div className="panel p-5">
              <div className="label flex items-center gap-1.5 text-[8px]">
                <ShieldAlert size={11} className="text-[color:var(--accent)]" /> Core principle
              </div>
              <p className="mt-3 font-data text-[12.5px] leading-relaxed text-[color:var(--muted)] line-through decoration-[#F25C5C]/60 decoration-1">
                {e.coreQ1}
              </p>
              <p className="mt-2 text-[14px] font-medium leading-relaxed text-[color:var(--ink)]">{e.coreQ2}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {e.identities.map((x, i) => (
                <div key={i} className="panel flex flex-col justify-between p-4">
                  <span className="font-data text-[11px] font-semibold text-[color:var(--ink-dim)]">{x.a}</span>
                  <span className="my-2 font-data text-[26px] font-semibold leading-none text-[#F25C5C]">≠</span>
                  <span className="font-data text-[11px] font-semibold text-[color:var(--ink)]">{x.b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">
              <ShieldAlert size={11} /> {e.disclaimerChip}
            </span>
            <span className="chip">{tpl(e.computedTpl, { n: d.aggregate.n })}</span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        {/* 01 — market regime */}
        <section>
          <SectionHead index="01" title={e.regimeTitle} sub={e.regimeSub} />
          <div className="panel p-5">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {REGIME_ORDER.map((r) => {
                    const active = r === d.regime;
                    const tone = REGIME_TONES[r];
                    return (
                      <div
                        key={r}
                        className="border px-3 py-2 font-data text-[10px] uppercase tracking-[0.1em] transition-all"
                        style={{
                          borderColor: active ? tone : "rgba(232,236,241,0.08)",
                          background: active ? `${tone}14` : "transparent",
                          color: active ? tone : "rgba(124,134,152,0.55)",
                        }}
                      >
                        {e.regimeLabels[r]}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
                  {[
                    { l: e.statBreadth, v: `${Math.round(d.aggregate.breadthDown * 100)}%` },
                    { l: e.statAvgPc, v: fmtPct(d.aggregate.avgPc20) },
                    { l: e.statStress, v: String(d.aggregate.avgStress) },
                    { l: e.statVol, v: `${d.aggregate.avgVolRatio}×` },
                  ].map((x) => (
                    <div key={x.l} className="border border-[color:var(--line)] px-3 py-2.5">
                      <div className="label text-[7px]">{x.l}</div>
                      <div className="font-data mt-0.5 text-[18px] font-semibold text-[color:var(--ink)]">{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* scenario confirmation */}
              <div className="border border-[color:var(--line)] p-4">
                <div className="mb-2">
                  <div className="text-[12.5px] font-semibold tracking-tight">{e.confirmTitle}</div>
                  <div className="label mt-0.5 text-[7px]">{e.confirmSub}</div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="label text-[8px]">2026 · {e.scen[0].name}</span>
                  <span
                    className="chip !text-[8.5px]"
                    style={{
                      color: CONFIRM_TONES[d.confirmation.label],
                      borderColor: `${CONFIRM_TONES[d.confirmation.label]}55`,
                      background: `${CONFIRM_TONES[d.confirmation.label]}14`,
                    }}
                  >
                    {e.confirmLabels[d.confirmation.label]} · {d.confirmation.score}/100
                  </span>
                </div>
                <div className="mt-3 space-y-2.5">
                  {d.confirmation.indicators.map((ind) => (
                    <div key={ind.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-medium text-[color:var(--ink)]">{ind.name}</span>
                        <span className="font-data text-[9px] text-[color:var(--muted)]">
                          {ind.points}/{ind.max}
                        </span>
                      </div>
                      <div className="mb-1 h-[3px] bg-[rgba(232,236,241,0.07)]">
                        <div className="h-full bg-[color:var(--accent)]" style={{ width: `${(ind.points / ind.max) * 100}%` }} />
                      </div>
                      <div className="flex justify-between gap-2 font-data text-[8.5px] text-[color:var(--muted)]">
                        <span>{ind.expected}</span>
                        <span className="text-right text-[color:var(--ink-dim)]">{ind.actual}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="label mt-3 border-t border-[color:var(--line)] pt-2.5 text-[7px]">{e.confirmNote}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 02 — macro scenario timeline */}
        <section className="mt-12">
          <SectionHead index="02" title={e.scenTitle} sub={e.scenSub} />
          <div className="grid border border-[color:var(--line)] md:grid-cols-5">
            {e.scen.map((sc, i) => {
              const current = i === 0;
              const confStatus = current ? e.confirmLabels[d.confirmation.label] : e.scenCardStatus[i];
              return (
                <div
                  key={sc.year}
                  className={`relative border-[color:var(--line)] p-4 max-md:border-b md:border-l md:first:border-l-0 ${
                    current ? "bg-[rgba(255,178,36,0.05)]" : ""
                  }`}
                >
                  {current && <div className="absolute inset-x-0 top-0 h-[2px] bg-[color:var(--accent)]" />}
                  <div className="flex items-baseline justify-between">
                    <span className={`font-data text-[26px] font-semibold leading-none ${current ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]"}`}>
                      {sc.year}
                    </span>
                    {current && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />}
                  </div>
                  <div className="mt-2 text-[12.5px] font-semibold tracking-tight">{sc.name}</div>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-[color:var(--muted)]">{sc.focus}</p>
                  <div className="mt-3">
                    <span
                      className="chip !text-[7.5px]"
                      style={
                        current
                          ? {
                              color: CONFIRM_TONES[d.confirmation.label],
                              borderColor: `${CONFIRM_TONES[d.confirmation.label]}55`,
                            }
                          : {}
                      }
                    >
                      {confStatus}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <p className="label text-[8px] leading-relaxed">{e.scenNote}</p>
            <div className="panel p-3.5">
              <div className="label flex items-center gap-1.5 text-[7.5px]">
                <ListOrdered size={10} className="text-[color:var(--accent)]" /> {e.priorityTitle}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {e.priorityList.map((p) => (
                  <span key={p} className={`font-data text-[9.5px] ${p.startsWith("6") ? "text-[#F25C5C]" : "text-[color:var(--ink-dim)]"}`}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 03 — company timing matrix */}
        <section className="mt-12">
          <SectionHead index="03" title={e.matrixTitle} sub={e.matrixSub} right={<span className="chip">{tpl(e.matrixNowTpl, { n: d.aggregate.n })}</span>} />
          <div className="panel overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--line-strong)]">
                  <th className="label px-4 py-3 text-left text-[8px]">Regime \ SDG timing</th>
                  {e.matrixCols.map((c) => (
                    <th key={c} className="label px-4 py-3 text-center text-[8px]">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["STRESS", "STABILIZATION", "RECOVERY", "RE_RATING"] as const).map((row) => {
                  const isNow = row === currentRegimeRow;
                  return (
                    <tr key={row} className={`border-b border-[color:var(--line)] last:border-b-0 ${isNow ? "bg-[rgba(255,178,36,0.04)]" : ""}`}>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          {isNow && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />}
                          <span className={`text-[12px] font-medium ${isNow ? "text-[color:var(--accent)]" : "text-[color:var(--ink-dim)]"}`}>
                            {e.matrixRows[row]}
                          </span>
                        </span>
                      </td>
                      {(["EARLY", "ACTIVE", "CRITICAL"] as const).map((col) => {
                        const verdict = (
                          { STRESS: { EARLY: "WATCH", ACTIVE: "PRIORITY", CRITICAL: "HIGH_PRIORITY" },
                            STABILIZATION: { EARLY: "WATCH", ACTIVE: "PRIORITY", CRITICAL: "PRIORITY" },
                            RECOVERY: { EARLY: "WATCH", ACTIVE: "MONITOR", CRITICAL: "PRIORITY" },
                            RE_RATING: { EARLY: "MONITOR", ACTIVE: "MONITOR", CRITICAL: "MONITOR" } } as const
                        )[row][col];
                        const count = d.matrixCounts[row][col];
                        const tone = VERDICT_TONES[verdict];
                        return (
                          <td key={col} className="px-4 py-3 text-center">
                            <div className="mx-auto w-fit border px-3 py-1.5" style={{ borderColor: `${tone}44`, background: `${tone}0f` }}>
                              <span className="font-data text-[10.5px] font-semibold" style={{ color: tone }}>{e.matrixCells[verdict]}</span>
                              {isNow && count > 0 && (
                                <span className="ml-2 font-data text-[10px] text-[color:var(--ink)]">×{count}</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 04 — deep-value watch */}
        <section className="mt-12">
          <SectionHead index="04" title={e.dvTitle} sub={e.dvSub} />
          <div className="panel p-5">
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1.5">
              {[e.dvLegendA, e.dvLegendB, e.dvLegendC, e.dvLegendD, e.dvLegendE, e.dvLegendF].map((l) => (
                <span key={l} className="label text-[8px]">{l}</span>
              ))}
            </div>
            <div className="space-y-3">
              {d.deepValueList.map((r) => (
                <DeepValueRow key={r.ticker} r={r} locale={locale} />
              ))}
            </div>
            <p className="label mt-4 border-t border-[color:var(--line)] pt-3 text-[7.5px]">{e.dvNever} · {e.dvNoneNote}</p>
          </div>
        </section>

        {/* 05 — low nominal + price floor */}
        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Tags size={15} className="text-[color:var(--accent)]" />
              <h3 className="text-[15px] font-semibold tracking-tight">{e.lnpTitle}</h3>
            </div>
            <p className="label mb-4 mt-1 text-[7.5px]">{e.lnpSub}</p>
            {d.lowNominalList.length === 0 ? (
              <p className="border border-dashed border-[color:var(--line)] px-3 py-4 text-center font-data text-[10px] text-[color:var(--muted)]">—</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[color:var(--line-strong)]">
                    <th className="label pb-2 text-left text-[8px]">Ticker</th>
                    <th className="label pb-2 text-right text-[8px]">{e.lnpColPrice}</th>
                    <th className="label pb-2 text-right text-[8px]">{e.lnpColResilience}</th>
                    <th className="label pb-2 text-right text-[8px]">{e.lnpColVol}</th>
                    <th className="label pb-2 text-right text-[8px]">{e.stressTitle}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lowNominalList.map((r) => (
                    <tr key={r.ticker} className="border-b border-[color:var(--line)] last:border-b-0">
                      <td className="py-2.5 font-data text-[12px] font-semibold text-[color:var(--ink)]">{r.ticker}</td>
                      <td className="py-2.5 text-right font-data text-[11.5px]">Rp {fmtPrice(r.lastPrice)}</td>
                      <td className="py-2.5 text-right font-data text-[11.5px] text-[color:var(--ink-dim)]">{r.resilience.total}</td>
                      <td className="py-2.5 text-right font-data text-[11.5px] text-[color:var(--ink-dim)]">{r.volRatio}×</td>
                      <td className="py-2.5 text-right">
                        <span className="font-data text-[10px] text-[#F25C5C">{r.stress.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="label mt-4 border-t border-[color:var(--line)] pt-3 text-[7.5px]">{e.lnpNote}</p>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Scale size={15} className="text-[color:var(--accent)]" />
              <h3 className="text-[15px] font-semibold tracking-tight">{e.floorTitle}</h3>
            </div>
            <p className="label mb-4 mt-1 text-[7.5px]">{e.floorSub}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PRICE_FLOOR_CONFIG.map((v) => (
                <div key={v.effectiveFrom} className="border border-[color:var(--line)] p-3">
                  <div className="label mb-2 text-[7.5px] !text-[color:var(--accent)]">{tpl(e.floorEffectiveTpl, { d: fmtDate(v.effectiveFrom) })}</div>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="label pb-1.5 text-left text-[7px]">{e.floorBand}</th>
                        <th className="label pb-1.5 text-right text-[7px]">ARA</th>
                        <th className="label pb-1.5 text-right text-[7px]">ARB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.bands.map((b) => (
                        <tr key={b.band} className="border-t border-[color:var(--line)]">
                          <td className="py-1.5 text-[10px] text-[color:var(--ink-dim)]">{b.band}</td>
                          <td className="py-1.5 text-right font-data text-[10.5px] text-[color:var(--green)]">{b.ara}</td>
                          <td className="py-1.5 text-right font-data text-[10.5px] text-[#F25C5C]">{b.arb}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <p className="label mt-4 text-[7.5px] leading-relaxed">{e.floorNote1}</p>
            <p className="label mt-1.5 text-[7.5px]">{e.floorNote2}</p>
          </div>
        </section>

        {/* 06 — time-weighted news + research labels */}
        <section className="mt-12 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Newspaper size={14} className="text-[color:var(--accent)]" />
                <span className="text-[13.5px] font-semibold tracking-tight">{e.newsTitle}</span>
              </div>
              <span className="label text-[7.5px]">{e.newsSub}</span>
            </div>
            <div>
              {d.newsWeighted.map((n) => (
                <div key={n.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-[color:var(--line)] px-4 py-2.5 last:border-b-0">
                  <div>
                    <span className="font-data text-[10.5px] font-semibold text-[color:var(--ink)]">{n.ticker}</span>
                    <div className="font-data text-[8px] text-[color:var(--muted)]">{fmtDate(n.eventDate)}</div>
                  </div>
                  <p className="line-clamp-1 text-[11.5px] text-[color:var(--ink-dim)]">{n.title}</p>
                  <div className="flex items-center gap-2">
                    <StageBadge stage={n.stage} />
                    <span className="w-14 text-right font-data text-[11px] font-semibold text-[color:var(--accent)]">
                      {e.newsWeight} {n.weight}
                    </span>
                    <span className="chip !text-[7.5px]">{e.newsBuckets[n.bucket]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="panel p-5">
              <div className="flex items-center gap-2">
                <Braces size={14} className="text-[color:var(--accent)]" />
                <h3 className="text-[14px] font-semibold tracking-tight">{e.labelsTitle}</h3>
              </div>
              <p className="label mb-3 mt-1 text-[7.5px]">{e.labelsSub}</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(e.labels).map((l) => (
                  <span key={l} className="chip !text-[8px]">{l}</span>
                ))}
              </div>
            </div>
            <div className="panel flex-1 p-5">
              <div className="flex items-center gap-2">
                <CircleSlash size={14} className="text-[#F25C5C]" />
                <h3 className="text-[14px] font-semibold tracking-tight text-[#F25C5C]">{e.forbiddenTitle}</h3>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {e.forbiddenList.map((l) => (
                  <span key={l} className="chip !text-[8px] !text-[#F25C5C] !border-[rgba(242,92,92,0.35)] line-through decoration-[#F25C5C]/70">
                    {l}
                  </span>
                ))}
              </div>
              <p className="label mt-3 text-[7.5px] leading-relaxed">{e.forbiddenNote}</p>
            </div>
          </div>
        </section>
      </main>

      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DeepValueRow({
  r,
  locale,
}: {
  r: CompanyEngineResult & {
    lastPrice: number;
    pc20: number;
    volRatio: number;
    sdgEvidence: number;
    timingMax: number;
    topSignalId: number | null;
    revenueGrowth: number;
    epsGrowth: number;
  };
  locale: import("@/i18n/dict").Locale;
}) {
  const href = r.topSignalId ? `/signals/${r.topSignalId}` : `/companies/${r.ticker}`;
  const DIM_KEYS = ["A", "B", "C", "D", "E", "F"];
  return (
    <div className="border border-[color:var(--line)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-data text-[15px] font-semibold text-[color:var(--ink)]">{r.ticker}</span>
          <span
            className="chip !text-[8px]"
            style={
              r.deepValue.qualifies
                ? { color: "#39C06A", borderColor: "rgba(57,192,106,0.4)", background: "rgba(57,192,106,0.1)" }
                : { color: "#8A94A6" }
            }
          >
            {r.deepValue.qualifies ? "QUALIFIES" : `missing ${r.deepValue.missing.join(" ")}`}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="label text-[6.5px]">confluence</div>
            <div className="font-data text-[22px] font-semibold leading-none text-[color:var(--accent)]">{r.deepValue.total}</div>
          </div>
          <Link
            href={`/${locale}${href}`}
            className="flex items-center gap-1 border border-[color:var(--line-strong)] px-2.5 py-1.5 font-data text-[9px] uppercase tracking-[0.12em] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            Research <ArrowUpRight size={10} />
          </Link>
        </div>
      </div>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {r.deepValue.parts.map((p) => (
          <div key={p.label} className="border border-[color:var(--line)] px-2 py-1.5">
            <div className="label text-[6px]">{p.label}</div>
            <div className="mt-1 h-[3px] bg-[rgba(232,236,241,0.07)]">
              <div className="h-full bg-[color:var(--accent)]" style={{ width: `${(p.points / p.max) * 100}%` }} />
            </div>
            <div className="mt-0.5 font-data text-[9px] text-[color:var(--ink-dim)]">{p.points}/{p.max}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-data text-[9.5px] text-[color:var(--muted)]">
        <span>Rp {fmtPrice(r.lastPrice)} · {fmtPct(r.pc20)} 20D</span>
        <span>drawdown {r.stats.drawdownPct}%</span>
        <span>resilience {r.resilience.total}/100</span>
        <span>vol {r.volRatio}×</span>
        <span className="flex items-center gap-1.5">
          {DIM_KEYS.map((k) => (
            <span key={k} className={r.deepValue.missing.includes(k) ? "text-[#F25C5C]" : "text-[color:var(--green)]"}>{k}</span>
          ))}
        </span>
        {r.sdgEvidence > 0 && <span>SDG ev {r.sdgEvidence} · timing {r.timingMax}</span>}
      </div>
    </div>
  );
}

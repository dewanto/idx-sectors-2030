import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  Landmark,
  Newspaper,
  Activity,
  Timer,
  Gauge,
  Layers,
  Search,
  AlertTriangle,
  BookOpen,
  Building2,
} from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import MarketChart from "@/components/MarketChart";
import ReplayControl from "@/components/ReplayControl";
import {
  ScoreDial,
  StageBadge,
  TimingBadge,
  GoalChip,
  ScoreBar,
  KV,
  Delta,
} from "@/components/ui";
import { getSignalDetail, getMarketIntel, getWhyNow } from "@/db/queries";
import { Sigma, Zap, HelpCircle, Database } from "lucide-react";
import {
  fmtDate,
  fmtMonth,
  fmtIdr,
  fmtPrice,
  fmtVol,
  parseDate,
  daysBetween,
  DEADLINE_2030,
  STAGE_META,
  type Stage,
} from "@/lib/system";
import { computeTimingScore } from "@/lib/scoring";
import { heroSignalType } from "@/lib/marketIntel";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { tpl } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";

export const dynamic = "force-dynamic";

const CHAIN_NODE_STYLE =
  "flex min-w-[130px] flex-1 flex-col gap-1.5 border border-[color:var(--line)] bg-[color:var(--surface)] px-3.5 py-3";

function company0(d: NonNullable<Awaited<ReturnType<typeof getSignalDetail>>>): string {
  return d.company.ticker;
}

export default async function SignalDetailPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id: rawId } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const id = Number(rawId);
  if (!Number.isInteger(id)) notFound();
  const data = await getSignalDetail(id);
  if (!data) notFound();
  const [mi, whyNow] = await Promise.all([
    getMarketIntel(company0(data)),
    getWhyNow(company0(data)),
  ]);

  const { signal, company, event, goal, target, mappings, evidence, snapshots, brief, market, fundamentals, prices, companyEvents } = data;

  /* non-watchlist companies stop receiving live syncs — surface the age */
  const staleDays = data.staleDays ?? 0;

  const timing = computeTimingScore({
    stage: event.stage as Stage,
    stageConfidence: event.stageConfidence,
    expectedCompletionDate: event.expectedCompletionDate,
    plannedStartDate: event.plannedStartDate,
    eventDate: event.eventDate,
    targetYear: event.targetYear,
  });
  const timingRowPts = [
    timing.stagePoints,
    timing.timePoints,
    timing.commitmentPoints,
    timing.leadTimePoints,
    timing.proximityPoints,
    timing.recencyPoints,
  ];
  const timingRowMax = [25, 20, 20, 15, 10, 10];

  const daysToCompletion = event.expectedCompletionDate
    ? daysBetween(parseDate("2026-09-28"), parseDate(event.expectedCompletionDate))
    : null;
  const headroom = event.expectedCompletionDate
    ? daysBetween(parseDate(event.expectedCompletionDate), DEADLINE_2030)
    : null;

  const totalWeight = evidence.reduce((a, b) => a + b.contribution, 0);

  const markers = companyEvents
    .filter((e) => e.id !== 0)
    .map((e) => ({
      date: e.eventDate,
      label: `${e.stage.toLowerCase()} · ${e.eventDate.slice(5)}`,
      color: STAGE_META[e.stage as Stage]?.color ?? "#FFB224",
    }));

  const headroomText = headroom !== null
    ? tpl(t.signal.headroomMoTpl, { m: Math.round(headroom / 30.44) })
    : t.signal.headroomUnknown;

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />

      {/* header */}
      <section className="border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">
          <Link href={hrefLang(locale, "/")} className="label flex w-fit items-center gap-2 text-[9px] hover:!text-[color:var(--accent)]">
            <ArrowLeft size={12} /> {t.signal.allSignals}
          </Link>

          <div className="mt-5 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <GoalChip n={goal.goalNumber} color={goal.color} target={target?.targetCode} />
                <span className="chip">{goal.shortTitle}</span>
                {target && <span className="chip">{target.targetCode} · {target.title.split(",")[0].slice(0, 44)}</span>}
              </div>
              <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight md:text-[36px]">
                <span className="font-data text-[color:var(--accent)]">{company.ticker}</span> · {signal.headline.split("—")[0].split("·").slice(1).join("·").trim() || event.project}
              </h1>
              <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
                {tpl(t.signal.headerTpl, {
                  goal: goal.goalNumber,
                  target: target ? ` / Target ${target.targetCode}` : "",
                  stage: signal.executionStage,
                  headroom: headroomText,
                })}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="chip chip-solid">{mi ? heroSignalType(mi.marketCondition as "DISLOCATION", STAGE_META[signal.executionStage as Stage].idx) : signal.signalType}</span>
                <StageBadge stage={signal.executionStage} big />
                <TimingBadge t={signal.timingClass} big win={t.timingWindows[signal.timingClass]} />
                <Link href={hrefLang(locale, `/companies/${company.ticker}`)} className="chip hover:!border-[color:var(--ink)] hover:!text-[color:var(--ink)]">
                  <Building2 size={11} /> {t.signal.companyFile}
                </Link>
                {staleDays > 7 && (
                  <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">
                    {tpl(t.common.staleDataTpl, { d: staleDays })}
                  </span>
                )}
              </div>
            </div>

            <div className="panel p-5">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <div className="label text-[8.5px]">{t.common.signalStrength}</div>
                  <div className="font-data text-[56px] font-semibold leading-none text-[color:var(--accent)]">
                    {signal.signalStrength}
                  </div>
                  <div className="label mt-1.5 text-[8px]">{tpl(t.signal.confluenceTpl, { v: signal.methodologyVersion })}</div>
                </div>
                <div className="flex gap-4">
                  <ScoreDial value={signal.sdgEvidenceScore} size={62} color={goal.color} label={t.common.sdgEv} sub="0–100" />
                  <ScoreDial value={signal.timingScore} size={62} color="#FFB224" label={t.common.timing} sub="0–100" />
                  <ScoreDial value={signal.marketSignalScore} size={62} color="#5FA8D3" label={t.common.market} sub="0–100" />
                </div>
              </div>
              <div className="mt-4 border-t border-[color:var(--line)] pt-3">
                <div className="label mb-2 text-[8px]">{t.signal.whyFlagged}</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {signal.whyFlagged.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11.5px] text-[color:var(--ink-dim)]">
                      <Check size={11} className="mt-0.5 shrink-0 text-[color:var(--green)]" strokeWidth={2.4} />
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        {/* evidence chain */}
        <section>
          <div className="label mb-3 text-[9px]">{t.signal.chainTitle}</div>
          <div className="flex flex-wrap items-stretch gap-y-3">
            <div className={CHAIN_NODE_STYLE}>
              <span className="label flex items-center gap-1.5 text-[7.5px]"><Newspaper size={10} /> {t.signal.chain.source}</span>
              <span className="text-[12px] font-medium leading-snug">{event.sourceName}</span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">{tpl(t.common.tierTpl, { n: event.sourceTier, claim: event.claimType.replace(/_/g, " ") })}</span>
            </div>
            <ChainArrow />
            <div className={CHAIN_NODE_STYLE}>
              <span className="label flex items-center gap-1.5 text-[7.5px]"><Activity size={10} /> {t.signal.chain.event}</span>
              <span className="text-[12px] font-medium leading-snug">{event.eventType} · {fmtDate(event.eventDate)}</span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">{event.investmentAmountIdr ? `${fmtIdr(event.investmentAmountIdr)} · ` : ""}{tpl(t.common.confTpl, { x: (event.extractionConfidence * 100).toFixed(0) })}</span>
            </div>
            <ChainArrow />
            <div className={CHAIN_NODE_STYLE} style={{ borderColor: `${goal.color}66` }}>
              <span className="label text-[7.5px]">{t.signal.chain.target}</span>
              <span className="text-[12px] font-medium leading-snug" style={{ color: goal.color }}>
                SDG {goal.goalNumber}{target ? ` · ${target.targetCode}` : ""}
              </span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">{tpl(t.signal.relTpl, { rel: mappings[0]?.rel, e: mappings[0]?.evidence })}</span>
            </div>
            <ChainArrow />
            <div className={CHAIN_NODE_STYLE}>
              <span className="label flex items-center gap-1.5 text-[7.5px]"><Layers size={10} /> {t.signal.chain.stage}</span>
              <span className="text-[12px] font-medium">{signal.executionStage}</span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">{tpl(t.common.confTpl, { x: (event.stageConfidence * 100).toFixed(0) })} · {signal.timingClass}</span>
            </div>
            <ChainArrow />
            <div className={CHAIN_NODE_STYLE}>
              <span className="label flex items-center gap-1.5 text-[7.5px]"><Timer size={10} /> {t.signal.chain.timing}</span>
              <span className="text-[12px] font-medium">{signal.timingScore}/100</span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">
                {headroom !== null ? tpl(t.common.runwayTpl, { m: Math.round(headroom / 30.44) }) : t.common.undated}
              </span>
            </div>
            <ChainArrow />
            <div className={CHAIN_NODE_STYLE}>
              <span className="label flex items-center gap-1.5 text-[7.5px]"><Gauge size={10} /> {t.signal.chain.sectors}</span>
              <span className="text-[12px] font-medium">{market ? `${market.volumeRatio20d}× vol` : "n/a"}</span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">
                {market ? tpl(t.signal.againstSectorTpl, { v: `${market.relativeStrength >= 0 ? "+" : ""}${market.relativeStrength}` }) : ""}
              </span>
            </div>
            <ChainArrow />
            <div className={`${CHAIN_NODE_STYLE} !border-[color:var(--accent)]`}>
              <span className="label flex items-center gap-1.5 text-[7.5px] !text-[color:var(--accent)]"><Landmark size={10} /> {t.signal.chain.signal}</span>
              <span className="font-data text-[16px] font-semibold text-[color:var(--accent)]">{signal.signalStrength}/100</span>
              <span className="font-data text-[9.5px] text-[color:var(--muted)]">{t.common.detected} {fmtDate(signal.detectedAt)}</span>
            </div>
          </div>
        </section>

        {/* market intelligence score — 70/20/10 */}
        {mi && (
          <section className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <div className="panel p-5">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                  <Sigma size={15} className="text-[color:var(--accent)]" /> {t.mi.title}
                </h3>
                <span className="font-data text-[22px] font-semibold leading-none text-[color:var(--accent)]">
                  {mi.totalScore}<span className="text-[11px] text-[color:var(--muted)]">/100</span>
                </span>
              </div>
              <p className="label mb-4 text-[7.5px]">{t.mi.sub}</p>

              <div className="space-y-4">
                {[
                  { title: t.mi.sectorsBlock, rows: mi.sectors, sub: mi.subtotals.sectors, max: 70, color: "#5FA8D3", keys: ["priceDislocation","volumeAnomaly","relativePerformance","fundamentalContext","marketIndustryContext"] },
                  { title: t.mi.evidenceBlock, rows: mi.evidence, sub: mi.subtotals.evidence, max: 20, color: "#FFB224", keys: ["businessEvent","sourceQuality","eventMateriality"] },
                  { title: t.mi.sdgBlock, rows: mi.sdg, sub: mi.subtotals.sdg, max: 10, color: goal.color, keys: ["sdgTargetRelevance","executionTiming"] },
                ].map((blk) => (
                  <div key={blk.title}>
                    <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--line)] pb-1.5">
                      <span className="label !text-[color:var(--ink)] text-[8px]">{blk.title}</span>
                      <span className="font-data text-[11px]" style={{ color: blk.color }}>
                        {blk.sub}/{blk.max}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {blk.rows.map((r, i) => (
                        <div key={r.label}>
                          <div className="mb-1 flex items-baseline justify-between">
                            <span className="text-[10.5px] text-[color:var(--ink-dim)]">
                              {(t.mi as Record<string, unknown>)[r.label] as string ?? r.label}
                            </span>
                            <span className="font-data text-[9.5px] text-[color:var(--muted)]">{r.value}/{r.max}</span>
                          </div>
                          <div className="h-[3px] bg-[rgba(232,236,241,0.07)]">
                            <div className="h-full" style={{ width: `${(r.value / r.max) * 100}%`, background: blk.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--line)] pt-3">
                <span className="chip !border-[color:var(--accent)] !text-[color:var(--accent)]">
                  {t.mi.condition}: {t.mi.conditions[mi.marketCondition]}
                </span>
                <span className="label text-[7px]">{t.mi.methodology} v{mi.methodologyVersion}</span>
              </div>
              <p className="label mt-2 text-[7px] leading-relaxed">{t.mi.note}</p>
            </div>

            {/* WHY NOW? — signature feature */}
            {whyNow && (
              <div className="panel flex flex-col overflow-hidden">
                <div className="border-b border-[color:var(--line)] px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <Zap size={15} className="text-[color:var(--accent)]" />
                    <h3 className="text-[16px] font-semibold tracking-tight">{t.whyNow.title}</h3>
                  </div>
                  <p className="label mt-1 text-[7.5px]">{t.whyNow.sub}</p>
                </div>
                <div className="flex-1 space-y-0 p-5">
                  {whyNow.items.map((it, i) => (
                    <div key={i} className="flex gap-3 border-b border-[color:var(--line)] py-2.5 last:border-b-0">
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border font-data text-[9px]"
                        style={{
                          borderColor: it.met ? "rgba(57,192,106,0.5)" : "rgba(242,92,92,0.4)",
                          background: it.met ? "rgba(57,192,106,0.12)" : "transparent",
                          color: it.met ? "#39C06A" : "#F25C5C",
                        }}
                      >
                        {it.met ? "✓" : "✕"}
                      </span>
                      <span className={`text-[12px] leading-relaxed ${it.met ? "text-[color:var(--ink-dim)]" : "text-[color:var(--muted)]"}`}>
                        {t.whyNow.items[it.key]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[color:var(--line)] px-5 py-3">
                  <span className="label text-[7.5px]">
                    {whyNow.items.every((x) => x.met)
                      ? t.whyNow.allMet
                      : t.whyNow.someMet.replace("{n}", String(whyNow.items.filter((x) => x.met).length)).replace("{t}", String(whyNow.items.length))}
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        {/* raw sectors -> derived intelligence */}
        {mi && market && (
          <section className="mt-4">
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line)] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Database size={14} className="text-[color:var(--accent)]" />
                  <span className="text-[13.5px] font-semibold tracking-tight">{t.mi.rawTitle}</span>
                </div>
                <span className="label text-[7px]">{t.mi.rawSub}</span>
              </div>
              <div className="flex flex-wrap items-stretch">
                {[
                  { h: "SECTORS · price", v: `Rp ${fmtPrice(prices[prices.length - 1]?.close ?? 0)}` },
                  { h: "SECTORS · volume", v: `${market.volumeRatio20d}× 20D` },
                  { h: "SECTORS · revenue growth", v: `${market.priceChange20d >= 0 ? "+" : ""}${fundamentals?.revenueGrowth ?? 0}%` },
                  { h: "SECTORS · relative perf.", v: `${market.relativeStrength >= 0 ? "+" : ""}${market.relativeStrength}%` },
                  { h: "SECTORS · sector", v: `${market.sectorReturn20d >= 0 ? "+" : ""}${market.sectorReturn20d}%` },
                ].map((x) => (
                  <div key={x.h} className="min-w-[150px] flex-1 border-r border-[color:var(--line)] px-4 py-3 last:border-r-0">
                    <div className="label text-[6.5px]">{x.h}</div>
                    <div className="mt-1 font-data text-[14px] font-semibold text-[color:var(--ink-dim)]">{x.v}</div>
                  </div>
                ))}
                <div className="min-w-[150px] flex-1 border-r border-[color:var(--line)] bg-[rgba(255,178,36,0.05)] px-4 py-3 last:border-r-0">
                  <div className="label !text-[color:var(--accent)] text-[6.5px]">DERIVED · market intelligence</div>
                  <div className="mt-1 font-data text-[14px] font-semibold text-[color:var(--accent)]">{mi.totalScore}/100</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* confluence + timing math */}
        <section className="mt-10 grid gap-4 lg:grid-cols-2">
          {/* confluence */}
          <div className="panel p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold tracking-tight">{t.signal.confTitle}</h3>
              <span className="font-data text-[11px] text-[color:var(--muted)]">Σ {totalWeight.toFixed(0)} / 100</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--line-strong)]">
                  <th className="label pb-2 text-left text-[8px]">{t.signal.tblComponent}</th>
                  <th className="label pb-2 text-left text-[8px]">{t.signal.tblMetric}</th>
                  <th className="label pb-2 text-right text-[8px]">{t.signal.tblWeight}</th>
                  <th className="label pb-2 text-right text-[8px]">{t.signal.tblContribution}</th>
                  <th className="label w-[26%] pb-2 text-right text-[8px]"></th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((row) => (
                  <tr key={row.id} className="border-b border-[color:var(--line)]">
                    <td className="py-2.5 pr-2 text-[12px] font-medium">{row.component}</td>
                    <td className="py-2.5 pr-2">
                      <div className="text-[11px] text-[color:var(--ink-dim)]">{row.metricName}</div>
                      <div className="font-data text-[9.5px] text-[color:var(--muted)]">{row.metricValue} · {row.benchmarkValue}</div>
                    </td>
                    <td className="py-2.5 text-right font-data text-[11px] text-[color:var(--muted)]">{row.weight}</td>
                    <td className="py-2.5 text-right font-data text-[12px] font-semibold text-[color:var(--ink)]">{row.contribution}</td>
                    <td className="py-2.5 pl-4">
                      <div className="ml-auto h-[4px] w-full bg-[rgba(232,236,241,0.07)]">
                        <div className="h-full bg-[color:var(--accent)]" style={{ width: `${(row.contribution / row.weight) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 text-[12px] font-semibold" colSpan={3}>{t.common.signalStrength}</td>
                  <td className="pt-3 text-right font-data text-[16px] font-semibold text-[color:var(--accent)]">{signal.signalStrength}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[color:var(--line)] pt-3">
              {Array.from(new Set(evidence.map((e) => e.sourceReference))).slice(0, 3).map((src, i) => (
                <span key={i} className="label flex items-center gap-1.5 text-[7.5px]">
                  <FileText size={9} /> {src.startsWith("http") ? new URL(src).hostname : src}
                </span>
              ))}
            </div>
          </div>

          {/* 2030 timing */}
          <div className="panel p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold tracking-tight">{t.signal.timingTitle}</h3>
              <span className="font-data text-[20px] font-semibold text-[color:var(--accent)]">{timing.total}<span className="text-[11px] text-[color:var(--muted)]">/100</span></span>
            </div>
            <p className="label mb-4 text-[7.5px]">{t.signal.timingNote}</p>
            <div className="space-y-3">
              {t.signal.timingRows.map((label, i) => (
                <ScoreBar key={label} label={label} value={timingRowPts[i]} max={timingRowMax[i]} color="#FFB224" right={`${timingRowPts[i]}/${timingRowMax[i]}`} />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[color:var(--line)] pt-4">
              <div className="border border-[color:var(--line)] px-3 py-2.5">
                <div className="label text-[7px]">{t.signal.tileDays}</div>
                <div className="font-data text-[18px] font-semibold">{daysToCompletion !== null ? daysToCompletion.toLocaleString() : "—"}</div>
              </div>
              <div className="border border-[color:var(--line)] px-3 py-2.5">
                <div className="label text-[7px]">{t.signal.tileHeadroom}</div>
                <div className="font-data text-[18px] font-semibold text-[color:var(--accent)]">
                  {headroom !== null ? tpl(t.signal.tileHeadroomVal, { m: Math.round(headroom / 30.44) }) : "—"}
                </div>
              </div>
              <div className="border border-[color:var(--line)] px-3 py-2.5">
                <div className="label text-[7px]">{t.signal.tileClass}</div>
                <div className="mt-1"><TimingBadge t={signal.timingClass} win={t.timingWindows[signal.timingClass]} /></div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <KV k={t.signal.kvPlannedStart} v={fmtMonth(event.plannedStartDate)} />
              <KV k={t.signal.kvExpectedCompletion} v={fmtMonth(event.expectedCompletionDate)} />
              <KV k={t.signal.kvTargetYear} v={event.targetYear ?? "—"} />
              <KV k={t.signal.kvClockPosition} v="28 Sep 2026" />
            </div>
          </div>
        </section>

        {/* market context */}
        <section className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="panel p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold tracking-tight">{t.signal.marketTitle} — {company.ticker}</h3>
              <span className="label text-[8px]">{t.signal.marketSub}</span>
            </div>
            <MarketChart prices={prices} events={markers} height={330} />
          </div>
          <div className="flex flex-col gap-4">
            <div className="panel p-5">
              <div className="label mb-3 text-[8px]">{t.signal.marketScore} · 28 Sep 2026</div>
              {market && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: t.signal.marketGrid[0], v: <Delta v={market.priceChange5d} /> },
                    { l: t.signal.marketGrid[1], v: <Delta v={market.priceChange20d} /> },
                    { l: t.signal.marketGrid[2], v: <Delta v={market.priceChange30d} /> },
                    { l: t.signal.marketGrid[3], v: <span className="font-data text-[12px]">{market.volumeRatio20d}×</span> },
                    { l: t.signal.marketGrid[4], v: <Delta v={market.sectorReturn20d} /> },
                    { l: t.signal.marketGrid[5], v: <Delta v={market.relativeStrength} /> },
                  ].map((m) => (
                    <div key={m.l} className="border border-[color:var(--line)] px-3 py-2">
                      <div className="label text-[7px]">{m.l}</div>
                      <div className="mt-0.5">{m.v}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4"><ScoreBar label={t.signal.marketScore} value={signal.marketSignalScore} color="#5FA8D3" right={`${signal.marketSignalScore}/100`} /></div>
            </div>
            <div className="panel flex-1 p-5">
              <div className="label mb-3 text-[8px]">{t.signal.fundTitle}</div>
              {fundamentals && (
                <>
                  <KV k={t.signal.fundRows[0]} v={<Delta v={fundamentals.revenueGrowth} />} />
                  <KV k={t.signal.fundRows[1]} v={<Delta v={fundamentals.epsGrowth} />} />
                  <KV k={t.signal.fundRows[2]} v={<span className="font-data text-[12px]">{fundamentals.dividendYield.toFixed(2)}%</span>} />
                  <KV k={t.signal.fundRows[3]} v={fmtIdr(company.marketCapIdr)} />
                  <KV k={t.signal.fundRows[4]} v={`Rp ${fmtPrice(prices[prices.length - 1]?.close ?? 0)}`} />
                  <KV k={t.signal.fundRows[5]} v={fmtVol(prices.slice(-5).reduce((a, b) => a + b.volume, 0) / 5)} />
                </>
              )}
              <p className="label mt-4 border-t border-[color:var(--line)] pt-3 text-[7.5px]">{fundamentals?.note}</p>
            </div>
          </div>
        </section>

        {/* stage ladder + replay */}
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.7fr]">
          {/* company execution chronology */}
          <div className="panel p-5">
            <h3 className="text-[15px] font-semibold tracking-tight">{t.signal.chronoTitle}</h3>
            <p className="label mb-4 mt-1 text-[7.5px]">{tpl(t.signal.chronoSubTpl, { t: company.ticker })}</p>
            <div className="space-y-0">
              {companyEvents.map((e, i) => {
                const current = e.id === event.id;
                return (
                  <div key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < companyEvents.length - 1 && (
                      <div className="absolute left-[5px] top-4 h-full w-px bg-[color:var(--line)]" />
                    )}
                    <div
                      className="relative z-10 mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2"
                      style={{
                        borderColor: STAGE_META[e.stage as Stage]?.color,
                        background: current ? STAGE_META[e.stage as Stage]?.color : "#0A0C0E",
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StageBadge stage={e.stage} />
                        <span className="font-data text-[10px] text-[color:var(--muted)]">{fmtDate(e.eventDate)}</span>
                        {current && <span className="chip chip-solid !text-[8px]">{t.signal.thisSignal}</span>}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-[color:var(--ink-dim)]">{e.title}</p>
                      {i > 0 && (
                        <p className="mt-1 font-data text-[9px] text-[color:var(--accent)]">
                          ↳ {tpl(t.signal.transitionTpl, { d: daysBetween(parseDate(companyEvents[i - 1].eventDate), parseDate(e.eventDate)) })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <ReplayControl t={t.replay} snapshots={snapshots.map((sn) => ({
            label: sn.label,
            snapshotDate: sn.snapshotDate,
            signalStrength: sn.signalStrength,
            timingScore: sn.timingScore,
            stage: sn.stage,
            close: sn.close,
            volumeRatio: sn.volumeRatio,
            note: sn.note,
          }))} />
        </section>

        {/* research brief */}
        {brief && (
          <section className="mt-4 scroll-mt-20" id="brief">
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4">
                <div className="flex items-center gap-3">
                  <BookOpen size={16} className="text-[color:var(--accent)]" />
                  <h3 className="text-[15px] font-semibold tracking-tight">{t.signal.briefTitle}</h3>
                  <span className="chip !text-[8px]">{brief.model}</span>
                  <span className="chip !text-[8px]">prompt {brief.promptVersion}</span>
                </div>
                <span className="label text-[8px]">{t.signal.briefNote}</span>
              </div>

              <div className="grid gap-px bg-[color:var(--line)] md:grid-cols-2">
                {[
                  { n: "01", b: brief.whatChanged },
                  { n: "02", b: brief.businessEvent },
                  { n: "03", b: brief.sdgConnection },
                  { n: "04", b: brief.executionStageText },
                  { n: "05", b: brief.timing },
                  { n: "06", b: brief.marketContext },
                  { n: "07", b: brief.signalEvidenceText },
                  { n: "08", b: brief.whyInvestigate },
                ].map((sec, i) => (
                  <div key={sec.n} className="bg-[color:var(--surface)] p-5">
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-data text-[10px] text-[color:var(--accent)]">{sec.n}</span>
                      <span className="label !text-[color:var(--ink)] text-[9px]">{t.signal.briefSections[i]}</span>
                    </div>
                    <p className="mt-2.5 text-[12px] leading-[1.75] text-[color:var(--ink-dim)]">{sec.b}</p>
                  </div>
                ))}
                <div className="bg-[color:var(--surface)] p-5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-data text-[10px] text-[color:var(--accent)]">09</span>
                    <span className="label !text-[color:var(--ink)] flex items-center gap-1.5 text-[9px]">
                      <Search size={10} className="text-[color:var(--accent)]" /> {t.signal.briefSections[8]}
                    </span>
                  </div>
                  <ul className="mt-2.5 space-y-2">
                    {brief.investigateNext.map((x, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-[color:var(--ink-dim)]">
                        <ArrowRight size={11} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[color:var(--surface)] p-5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-data text-[10px] text-[#F25C5C]">10</span>
                    <span className="label !text-[#F25C5C] flex items-center gap-1.5 text-[9px]">
                      <AlertTriangle size={10} /> {t.signal.briefSections[9]}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[12px] leading-[1.75] text-[color:var(--ink-dim)]">{brief.limitations}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--line)] px-5 py-4">
                <span className="label mr-2 text-[8px]">{t.signal.citations}</span>
                {brief.citations.map((c, i) => (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="chip transition-colors hover:!border-[color:var(--accent)] hover:!text-[color:var(--accent)]"
                  >
                    <ExternalLink size={10} />
                    {c.label} · T{c.tier}
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

function ChainArrow() {
  return (
    <div className="flex items-center px-1 text-[color:var(--accent)] max-lg:hidden">
      <svg width="22" height="10" viewBox="0 0 22 10" fill="none">
        <path d="M0 5h18M14 1l4 4-4 4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

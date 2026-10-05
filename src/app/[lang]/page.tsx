import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Flame,
  Radio,
  TrendingUp,
  TrendingDown,
  ScanSearch,
  CircleDot,
} from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ExecutionClock from "@/components/ExecutionClock";
import SignalCard from "@/components/SignalCard";
import Heatmap from "@/components/Heatmap";
import TimelineRail from "@/components/TimelineRail";
import CountUp from "@/components/CountUp";
import { SectionHead, StageBadge, TimingBadge, GoalChip, ScoreBar } from "@/components/ui";
import { getDashboard, type SignalRow } from "@/db/queries";
import { fmtIdr, fmtDate, fmtMonth } from "@/lib/system";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { tpl, type Dict, type Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";

export const dynamic = "force-dynamic";

function CompactSignalRow({
  sig,
  mode,
  t,
  locale,
}: {
  sig: SignalRow;
  mode: "confirm" | "diverge";
  t: Dict;
  locale: Locale;
}) {
  return (
    <Link
      href={hrefLang(locale, `/signals/${sig.id}`)}
      className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-[color:var(--line)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[rgba(232,236,241,0.02)]"
    >
      <GoalChip n={sig.goalNumber} color={sig.goalColor} target={sig.targetCode} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-data text-[12.5px] font-semibold text-[color:var(--ink)]">{sig.ticker}</span>
          <StageBadge stage={sig.executionStage} />
          <span className="truncate text-[11px] text-[color:var(--muted)]">{sig.project ?? sig.eventTitle}</span>
        </div>
        <div className="mt-2">
          <ScoreBar
            label={mode === "confirm" ? t.dash.confBar : t.dash.divBar}
            value={mode === "confirm" ? sig.marketSignalScore : sig.sdgEvidenceScore}
            color={mode === "confirm" ? "#39C06A" : "#ADB4C0"}
            right={
              mode === "confirm"
                ? `${sig.marketSignalScore}`
                : tpl(t.dash.marketRespTpl, { sev: sig.sdgEvidenceScore, mkt: sig.marketSignalScore })
            }
          />
        </div>
      </div>
      <div className="text-right">
        <div className="font-data text-[20px] font-semibold leading-none text-[color:var(--ink)]">{sig.signalStrength}</div>
        <div className="label mt-1 text-[7.5px]">{t.dash.strengthWord}</div>
      </div>
    </Link>
  );
}

const PIPE_ICONS = [FileText, CircleDot, ScanSearch, TrendingUp];

export default async function DashboardPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const d = await getDashboard();

  const metricValues = [
    17,
    169,
    742,
    d.stats.companies,
    d.stats.activeEvents,
    d.stats.signals,
    d.stats.executionStage,
    d.stats.highEvidence,
    d.stats.deadlineSensitive,
    d.stats.measuredOutcomes,
  ];
  const metricLink = [false, false, false, true, false, false, true, false, false, false];

  const tapeItems = d.topSignals.slice(0, 8);

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />
      <ExecutionClock t={t} locale={locale} />

      {/* signal tape */}
      <div className="relative overflow-hidden border-b border-[color:var(--line)] bg-[#0c0f12] py-2.5">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-[#0c0f12] [mask-image:linear-gradient(to_right,black,transparent)]" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-[#0c0f12] [mask-image:linear-gradient(to_left,black,transparent)]" />
        <div className="marquee-track flex w-max items-center gap-8">
          {[...tapeItems, ...tapeItems].map((sig, i) => (
            <span key={i} className="flex items-center gap-2.5 whitespace-nowrap font-data text-[11px] uppercase tracking-[0.1em]">
              <span className="inline-block h-1.5 w-1.5" style={{ background: sig.goalColor }} />
              <span className="text-[color:var(--ink)]">{sig.ticker}</span>
              <span className="text-[color:var(--muted)]">{sig.signalType}</span>
              <span className="text-[color:var(--accent)]">{sig.signalStrength}/100</span>
              <span className="text-[color:var(--muted)]">·</span>
              <span className="text-[color:var(--muted)]">SDG {sig.goalNumber}{sig.targetCode ? `.${sig.targetCode.split(".")[1] ?? ""}` : ""}</span>
            </span>
          ))}
        </div>
      </div>

      {/* metrics */}
      <section className="border-b border-[color:var(--line)]">
        <div className="mx-auto grid max-w-[1440px] grid-cols-2 border-l border-[color:var(--line)] sm:grid-cols-3 lg:grid-cols-5">
          {t.metrics.map((m, i) => {
            const accent = i === 4 || i === 5;
            const sub = m.subTpl ? tpl(m.subTpl, { v: d.stats.avgTiming }) : m.sub;
            const linked = metricLink[i];
            const inner = (
              <>
                <div className="label text-[8.5px]">{m.label}</div>
                <div className={`mt-2 font-data text-[34px] font-semibold leading-none tracking-tight md:text-[40px] ${accent ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]"}`}>
                  <CountUp value={metricValues[i]} duration={1100 + i * 120} />
                </div>
                <div className="mt-1.5 font-data text-[9.5px] text-[color:var(--muted)]">{sub}</div>
              </>
            );
            return linked ? (
              <Link key={m.label} href={hrefLang(locale, "/picker")} className="group border-b border-r border-[color:var(--line)] px-5 py-5 transition-colors hover:bg-[color:var(--surface)]">
                {inner}
              </Link>
            ) : (
              <div key={m.label} className="border-b border-r border-[color:var(--line)] px-5 py-5">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-12 md:px-8">
        {/* 01 — top signals */}
        <section className="rise-in">
          <SectionHead
            index="01"
            title={t.dash.s1Title}
            sub={t.dash.s1Sub}
            right={
              <Link href={hrefLang(locale, "/picker")} className="chip !border-[color:var(--accent)] !text-[color:var(--accent)] hover:!bg-[rgba(255,178,36,0.1)]">
                <ScanSearch size={11} /> {t.dash.openPicker}
              </Link>
            }
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.topSignals.slice(0, 6).map((sig, i) => (
              <SignalCard key={sig.id} sig={sig} rank={i + 1} t={t} locale={locale} />
            ))}
          </div>
        </section>

        {/* 02 — heatmap + momentum */}
        <section className="mt-14 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="panel p-5">
            <SectionHead index="02" title={t.dash.s2Title} sub={t.dash.s2Sub} />
            <Heatmap cells={d.heatmap} sectors={d.heatSectors} goals={d.heatGoals} t={t.heat} />
          </div>
          <div className="flex flex-col gap-4">
            <div className="panel p-5">
              <SectionHead index="03" title={t.dash.s3Title} sub={t.dash.s3Sub} />
              <div className="space-y-3.5">
                {d.momentum.map((m, i) => (
                  <ScoreBar
                    key={m.sector}
                    label={tpl(t.dash.momentumRowTpl, { i: String(i + 1).padStart(2, "0"), sector: m.sector, n: m.signals })}
                    value={m.avgStrength}
                    color={i === 0 ? "#FFB224" : "#5FA8D3"}
                    right={`${m.avgStrength}`}
                  />
                ))}
              </div>
            </div>
            <div className="panel dotgrid relative flex flex-1 flex-col justify-between overflow-hidden p-5">
              <div>
                <div className="label text-[8.5px]">{t.dash.unTitle}</div>
                <div className="mt-3 font-data text-[44px] font-semibold leading-none text-[#F25C5C]">15%</div>
                <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--ink-dim)]">{t.dash.unBody}</p>
              </div>
              <div className="mt-4 space-y-2">
                <ScoreBar label={t.dash.unBars[0]} value={15} color="#39C06A" right="15%" />
                <ScoreBar label={t.dash.unBars[1]} value={21} color="#FFB224" right="21%" />
                <ScoreBar label={t.dash.unBars[2]} value={64} color="#F25C5C" right="64%" />
              </div>
              <p className="label mt-4 text-[7.5px]">{t.dash.unSource}</p>
            </div>
          </div>
        </section>

        {/* 03 — new SDG events */}
        <section className="mt-14">
          <SectionHead
            index="04"
            title={t.dash.s4Title}
            sub={t.dash.s4Sub}
            right={
              <span className="chip">
                <Radio size={11} className="text-[color:var(--accent)]" /> {t.dash.liveFeed}
              </span>
            }
          />
          <div className="panel overflow-x-auto">
            <table className="data-table min-w-[1040px]">
              <thead>
                <tr>
                  <th>{t.tbl.date}</th>
                  <th>{t.tbl.company}</th>
                  <th>{t.tbl.event}</th>
                  <th>{t.tbl.sdgMapping}</th>
                  <th>{t.tbl.stage}</th>
                  <th>{t.tbl.timing}</th>
                  <th>{t.tbl.completion}</th>
                  <th className="text-right">{t.tbl.score}</th>
                  <th>{t.tbl.source}</th>
                </tr>
              </thead>
              <tbody>
                {d.recentEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="font-data text-[11px] text-[color:var(--muted)]">{fmtDate(e.eventDate)}</td>
                    <td>
                      <div className="font-data text-[12.5px] font-semibold text-[color:var(--ink)]">{e.ticker}</div>
                      <div className="text-[10.5px] text-[color:var(--muted)]">{e.sector}</div>
                    </td>
                    <td className="max-w-[340px]">
                      <div className="line-clamp-2 text-[12.5px] leading-snug text-[color:var(--ink-dim)]">{e.title}</div>
                      {e.investmentIdr && (
                        <div className="mt-1 font-data text-[10px] text-[color:var(--green)]">{fmtIdr(e.investmentIdr)}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {e.goalNumber ? (
                        <GoalChip n={e.goalNumber} color={e.goalColor!} target={e.targetCode} />
                      ) : (
                        <span className="label text-[8px]">{t.dash.unmapped}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <StageBadge stage={e.stage} />
                    </td>
                    <td className="whitespace-nowrap">
                      <TimingBadge t={e.timingClass} win={t.timingWindows[e.timingClass]} />
                    </td>
                    <td className="font-data text-[11px] text-[color:var(--ink-dim)]">
                      {e.expectedCompletion ? fmtMonth(e.expectedCompletion) : (
                        <span className="text-[color:var(--muted)]">{t.common.undated}</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span className={`font-data text-[14px] font-semibold ${e.timingScore >= 75 ? "text-[color:var(--accent)]" : "text-[color:var(--ink-dim)]"}`}>
                        {e.timingScore}
                      </span>
                      <div className="label text-[7px]">{t.tbl.timingWord}</div>
                    </td>
                    <td>
                      <span className="label text-[8px]">T{e.sourceTier}</span>
                      <span className="ml-1.5 text-[10.5px] text-[color:var(--muted)]">{e.sourceName}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 04/05 — market confirmation + divergence */}
        <section className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <TrendingUp size={15} className="text-[color:var(--green)]" />
                <span className="text-[14px] font-semibold tracking-tight">{t.dash.confTitle}</span>
              </div>
              <span className="label text-[8px]">{t.dash.confSub}</span>
            </div>
            <div>
              {d.confirmations.length
                ? d.confirmations.map((sig) => <CompactSignalRow key={sig.id} sig={sig} mode="confirm" t={t} locale={locale} />)
                : <EmptyRow label={t.dash.emptyRow} />}
            </div>
          </div>
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <TrendingDown size={15} className="text-[#ADB4C0]" />
                <span className="text-[14px] font-semibold tracking-tight">{t.dash.divTitle}</span>
              </div>
              <span className="label text-[8px]">{t.dash.divSub}</span>
            </div>
            <div>
              {d.divergences.length
                ? d.divergences.map((sig) => <CompactSignalRow key={sig.id} sig={sig} mode="diverge" t={t} locale={locale} />)
                : <EmptyRow label={t.dash.emptyRow} />}
            </div>
          </div>
        </section>

        {/* 06 — 2030 timeline */}
        <section className="mt-14">
          <SectionHead index="05" title={t.dash.s5Title} sub={t.dash.s5Sub} />
          <TimelineRail
            t={t.rail}
            locale={locale}
            items={d.timeline.map((sig) => ({
              id: sig.id,
              ticker: sig.ticker,
              goalNumber: sig.goalNumber,
              goalColor: sig.goalColor,
              targetCode: sig.targetCode,
              stage: sig.executionStage,
              timingClass: sig.timingClass,
              eventDate: sig.eventDate,
              expectedCompletion: sig.expectedCompletion!,
              strength: sig.signalStrength,
            }))}
          />
        </section>

        {/* CTA */}
        <section className="mt-14">
          <div className="panel dotgrid relative overflow-hidden">
            <div className="grid gap-6 p-8 md:grid-cols-[1.5fr_1fr] md:items-center md:p-12">
              <div>
                <div className="flex items-center gap-2">
                  <Flame size={14} className="text-[color:var(--accent)]" />
                  <span className="label !text-[color:var(--accent)] text-[9px]">{t.dash.ctaBadge}</span>
                </div>
                <h3 className="mt-3 text-[28px] font-semibold leading-tight tracking-tight md:text-[38px]">
                  {t.dash.ctaTitleA}{" "}
                  <span className="text-[color:var(--muted)]">{t.dash.ctaTitleB}</span>
                </h3>
                <p className="mt-3 max-w-[520px] text-[13.5px] leading-relaxed text-[color:var(--ink-dim)]">
                  {t.dash.ctaBody}
                </p>
              </div>
              <div className="flex flex-col gap-3 md:items-end">
                <Link
                  href={hrefLang(locale, "/picker")}
                  className="group flex items-center gap-3 border border-[color:var(--accent)] bg-[rgba(255,178,36,0.08)] px-6 py-4 font-data text-[12px] uppercase tracking-[0.14em] text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent)] hover:text-[#17110a]"
                >
                  {t.dash.findCompanies} <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href={hrefLang(locale, "/picker?rightTime=1&stages=CONTRACTED,EXECUTING")}
                  className="group flex items-center gap-3 border border-[color:var(--line-strong)] px-6 py-4 font-data text-[12px] uppercase tracking-[0.14em] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--ink)] hover:text-[color:var(--ink)]"
                >
                  {t.dash.findRightTime} <ArrowUpRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* pipeline */}
        <section className="mt-14">
          <SectionHead index="06" title={t.dash.pipeTitle} sub={t.dash.pipeSub} />
          <div className="grid border border-[color:var(--line)] sm:grid-cols-2 lg:grid-cols-4">
            {t.dash.pipeCards.map((card, i) => {
              const Icon = PIPE_ICONS[i];
              return (
                <div key={card.t} className="relative border-[color:var(--line)] p-5 max-lg:odd:border-r max-lg:sm:border-b lg:border-b-0 lg:border-r lg:last:border-r-0">
                  <div className="flex items-center justify-between">
                    <Icon size={16} className="text-[color:var(--accent)]" strokeWidth={1.8} />
                    <span className="font-data text-[22px] font-semibold text-[rgba(232,236,241,0.12)]">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="mt-3 text-[13.5px] font-semibold tracking-tight">{card.t}</div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">{card.d}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="label text-[8px]">{t.dash.pipeFootA}</span>
            <span className="label flex items-center gap-1.5 text-[8px]">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
              {t.dash.pipeFootB}
            </span>
          </div>
        </section>
      </main>

      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center font-data text-[11px] text-[color:var(--muted)]">{label}</div>;
}

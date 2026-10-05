import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Workflow, FileSignature, Landmark } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import MarketChart from "@/components/MarketChart";
import SignalCard from "@/components/SignalCard";
import { StageBadge, TimingBadge, GoalChip, ScoreBar, KV, Delta } from "@/components/ui";
import { getCompanyDetail, getAllSignals, getCompanyEngine } from "@/db/queries";
import { fmtDate, fmtIdr, fmtPrice, fmtVol, daysBetween, parseDate, STAGE_META, type Stage } from "@/lib/system";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { tpl } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";
import { Braces, Gauge, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ lang: string; ticker: string }> }) {
  const { lang, ticker } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const [data, engineData] = await Promise.all([getCompanyDetail(ticker), getCompanyEngine(ticker)]);
  if (!data) notFound();
  const { company, fundamentals, market, prices, events, mappings, compsigs } = data;

  /* non-watchlist companies stop receiving live syncs — surface the age */
  const staleDays = data.staleDays ?? 0;
  const allSignals = await getAllSignals();
  const sigRows = allSignals.filter((x) => x.ticker === company.ticker);

  const mappingByEvent = new Map<number, typeof mappings>();
  for (const m of mappings) {
    const arr = mappingByEvent.get(m.eventId) ?? [];
    arr.push(m);
    mappingByEvent.set(m.eventId, arr);
  }

  const last = prices[prices.length - 1];
  const markers = events.map((e) => ({
    date: e.eventDate,
    label: `${e.stage.toLowerCase()} · ${e.eventDate.slice(5)}`,
    color: STAGE_META[e.stage as Stage]?.color ?? "#FFB224",
  }));

  const transitions = events.slice(1).map((e, i) => ({
    from: events[i].stage,
    to: e.stage,
    days: daysBetween(parseDate(events[i].eventDate), parseDate(e.eventDate)),
  }));

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />
      <section className="border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">
          <Link href={hrefLang(locale, "/")} className="label flex w-fit items-center gap-2 text-[9px] hover:!text-[color:var(--accent)]">
            <ArrowLeft size={12} /> {t.company.backDash}
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-data text-[34px] font-semibold tracking-tight text-[color:var(--accent)] md:text-[44px]">
                  {company.ticker}
                </span>
                <span className="chip">{company.exchange}</span>
                <span className="chip">{company.sector}</span>
                {staleDays > 7 && (
                  <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">
                    {tpl(t.common.staleDataTpl, { d: staleDays })}
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-[18px] font-medium tracking-tight text-[color:var(--ink)] md:text-[22px]">
                {company.companyName}
              </h1>
              <p className="label mt-1 text-[9px]">{company.industry}</p>
            </div>
            <div className="flex gap-8">
              <div>
                <div className="label text-[8px]">{t.company.lastClose}</div>
                <div className="font-data text-[26px] font-semibold leading-none text-[color:var(--ink)]">
                  Rp {fmtPrice(last?.close ?? 0)}
                </div>
                {market && (
                  <div className="mt-1">
                    <Delta v={market.priceChange20d} /> <span className="label text-[7px]">20D</span>
                  </div>
                )}
              </div>
              <div>
                <div className="label text-[8px]">{t.company.marketCap}</div>
                <div className="font-data text-[26px] font-semibold leading-none">{fmtIdr(company.marketCapIdr)}</div>
              </div>
              <div>
                <div className="label text-[8px]">{t.company.activeSignals}</div>
                <div className="font-data text-[26px] font-semibold leading-none text-[color:var(--accent)]">
                  {compsigs.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="panel p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold tracking-tight">{t.company.chartTitle}</h3>
              <span className="label text-[8px]">{t.company.chartSub}</span>
            </div>
            <MarketChart prices={prices} events={markers} height={320} />
          </div>
          <div className="flex flex-col gap-4">
            <div className="panel p-5">
              <div className="label mb-3 flex items-center gap-1.5 text-[8px]">
                <Landmark size={10} className="text-[color:var(--accent)]" /> {t.company.validation}
              </div>
              {market && (
                <>
                  <KV k={t.company.rows.p5} v={<Delta v={market.priceChange5d} />} />
                  <KV k={t.company.rows.p20} v={<Delta v={market.priceChange20d} />} />
                  <KV k={t.company.rows.p30} v={<Delta v={market.priceChange30d} />} />
                  <KV k={t.company.rows.vol} v={`${market.volumeRatio20d}×`} />
                  <KV k={t.company.rows.sector} v={<Delta v={market.sectorReturn20d} />} />
                  <KV k={t.company.rows.rs} v={<Delta v={market.relativeStrength} />} />
                  <div className="mt-3">
                    <ScoreBar label={t.company.rows.score} value={market.marketSignalScore} color="#5FA8D3" right={`${market.marketSignalScore}/100`} />
                  </div>
                </>
              )}
            </div>
            <div className="panel flex-1 p-5">
              <div className="label mb-3 flex items-center gap-1.5 text-[8px]">
                <FileSignature size={10} className="text-[color:var(--accent)]" /> {t.company.fundTitle}
              </div>
              {fundamentals && (
                <>
                  <KV k={t.company.rows.rev} v={<Delta v={fundamentals.revenueGrowth} />} />
                  <KV k={t.company.rows.eps} v={<Delta v={fundamentals.epsGrowth} />} />
                  <KV k={t.company.rows.dy} v={<span className="font-data text-[12px]">{fundamentals.dividendYield.toFixed(2)}%</span>} />
                  <KV k={t.company.rows.avgVol} v={fmtVol(prices.slice(-5).reduce((a, b) => a + b.volume, 0) / Math.max(1, prices.slice(-5).length))} />
                </>
              )}
              <p className="label mt-4 border-t border-[color:var(--line)] pt-3 text-[7.5px]">{fundamentals?.note}</p>
            </div>
          </div>
        </div>

        {/* engine output — research timing */}
        {engineData && (
          <section className="mt-4">
            <div className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <Gauge size={15} className="text-[color:var(--accent)]" />
                  <span className="text-[14px] font-semibold tracking-tight">{t.engine.coTitle}</span>
                </div>
                <span className="label text-[7.5px]">{t.engine.coSub}</span>
              </div>
              <div className="grid lg:grid-cols-2">
                {/* §25-style machine output */}
                <div className="border-b border-[color:var(--line)] bg-[#0b0e11] p-5 lg:border-b-0 lg:border-r">
                  <div className="label mb-3 flex items-center gap-1.5 text-[7.5px]">
                    <Braces size={10} className="text-[color:var(--accent)]" /> timing_output.json
                  </div>
                  <div className="space-y-2 font-data text-[11px] leading-relaxed">
                    <JKey k={t.engine.jsonKeys.marketRegime}>
                      <span className="text-[color:var(--accent)]">&quot;{engineData.regime}&quot;</span>
                    </JKey>
                    <JKey k={t.engine.jsonKeys.macroScenario}>
                      {"{ year: 2026, confirmation: "}
                      <span className="text-[color:var(--accent)]">&quot;{engineData.confirmation.label}&quot;</span>
                      {" }"}
                    </JKey>
                    <JKey k={t.engine.jsonKeys.stress}>
                      {"{ score: "}
                      <span className="text-[color:var(--ink)]">{engineData.engine.stress.total}</span>
                      {", band: "}
                      <span className="text-[color:var(--accent)]">&quot;{engineData.engine.stressBand}&quot;</span>
                      {" }"}
                    </JKey>
                    <JKey k={t.engine.jsonKeys.resilience}>
                      <span className="text-[color:var(--ink)]">{engineData.engine.resilience.total}</span>
                    </JKey>
                    <JKey k={t.engine.jsonKeys.deepValue}>
                      {"{ score: "}
                      <span className="text-[color:var(--ink)]">{engineData.engine.deepValue.total}</span>
                      {", qualifies: "}
                      <span className={engineData.engine.deepValue.qualifies ? "text-[color:var(--green)]" : "text-[#F25C5C]"}>
                        {String(engineData.engine.deepValue.qualifies)}
                      </span>
                      {engineData.engine.deepValue.missing.length > 0 && (
                        <>, missing: [{engineData.engine.deepValue.missing.map((m) => `"${m}"`).join(", ")}]</>
                      )}
                      {" }"}
                    </JKey>
                    <JKey k={t.engine.jsonKeys.priceFloor}>
                      {"{ band: "}
                      <span className="text-[color:var(--accent)]">&quot;{engineData.engine.priceFloorBand.band}&quot;</span>
                      {", ARA "}
                      <span className="text-[color:var(--green)]">{engineData.engine.priceFloorBand.ara}</span>
                      {" / ARB "}
                      <span className="text-[#F25C5C]">{engineData.engine.priceFloorBand.arb}</span>
                      {" }"}
                    </JKey>
                    <JKey k={t.engine.jsonKeys.matrix}>
                      <span className="text-[color:var(--accent)]">&quot;{engineData.matrixVerdict}&quot;</span>
                    </JKey>
                    <JKey k={t.engine.jsonKeys.researchSignal}>
                      {"{ type: "}
                      <span className="text-[color:var(--accent)]">&quot;{engineData.engine.researchLabel}&quot;</span>
                      {", strength: "}
                      <span className="text-[color:var(--ink)]">{engineData.engine.deepValue.total}</span>
                      {" }"}
                    </JKey>
                  </div>
                </div>

                {/* §26 research interpretation */}
                <div className="p-5">
                  <div className="label mb-3 text-[7.5px]">{t.engine.interpTitle}</div>
                  <ul className="space-y-3">
                    <InterpRow label={t.engine.interp[0]}>{events[events.length - 1]?.title ?? "—"}</InterpRow>
                    <InterpRow label={t.engine.interp[1]}>
                      {events[events.length - 1]
                        ? `${events[events.length - 1].stage} · ${t.timingWindows[events[events.length - 1].timingClass] ?? events[events.length - 1].timingClass}`
                        : "—"}
                    </InterpRow>
                    <InterpRow label={t.engine.interp[2]}>
                      {market ? `${market.priceChange20d >= 0 ? "+" : ""}${market.priceChange20d}% 20D · drawdown ${engineData.engine.stats.drawdownPct}% · vol ${market.volumeRatio20d}×` : "—"}
                    </InterpRow>
                    <InterpRow label={t.engine.interp[3]}>
                      {fundamentals
                        ? `${
                            t.company.rows.rev
                          } ${fundamentals.revenueGrowth >= 0 ? "+" : ""}${fundamentals.revenueGrowth}% · ${
                            t.company.rows.eps
                          } ${fundamentals.epsGrowth >= 0 ? "+" : ""}${fundamentals.epsGrowth}% · resilience ${engineData.engine.resilience.total}/100`
                        : "—"}
                    </InterpRow>
                    <InterpRow label={t.engine.interp[4]}>
                      {events[events.length - 1]?.expectedCompletionDate
                        ? tpl(t.engine.monthsTpl, {
                            m: Math.round(
                              daysBetween(parseDate(events[events.length - 1].expectedCompletionDate!), parseDate("2030-12-31")) / 30.44,
                            ),
                          })
                        : "—"}
                    </InterpRow>
                    <InterpRow label={t.engine.interp[5]}>
                      {engineData.engine.deepValue.qualifies ? t.engine.qualifyYes : tpl(t.engine.dvScoreTitle, {}) + ` — ${t.engine.qualifyNo}`}
                    </InterpRow>
                  </ul>
                  <p className="label mt-4 flex items-start gap-1.5 border-t border-[color:var(--line)] pt-3 text-[7px] leading-relaxed">
                    <ArrowRight size={9} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
                    {t.engine.interpNote}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* execution chronology */}
        <section className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Workflow size={15} className="text-[color:var(--accent)]" />
              <h3 className="text-[15px] font-semibold tracking-tight">{t.company.eventsTitle}</h3>
            </div>
            <p className="label mb-4 mt-1 text-[7.5px]">{t.company.eventsSub}</p>
            <div>
              {events.map((e, i) => {
                const maps = mappingByEvent.get(e.id) ?? [];
                return (
                  <div key={e.id} className="relative flex gap-4 border-b border-[color:var(--line)] py-4 last:border-b-0">
                    <div className="relative flex w-[86px] shrink-0 flex-col items-start gap-1.5">
                      <StageBadge stage={e.stage} />
                      <span className="font-data text-[9px] text-[color:var(--muted)]">{fmtDate(e.eventDate)}</span>
                      {i < events.length - 1 && <div className="absolute left-[5px] top-8 bottom-[-18px] w-px bg-[color:var(--line)]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug text-[color:var(--ink)]">{e.title}</p>
                      <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">{e.summary}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {maps.map((m, j) => (
                          <span key={j} className="flex items-center gap-1.5">
                            <GoalChip n={m.goalNumber} color={m.goalColor} target={m.targetCode} />
                            <span className="font-data text-[9px] text-[color:var(--muted)]">{m.rel} · {m.evidence}</span>
                          </span>
                        ))}
                        <TimingBadge t={e.timingClass} win={t.timingWindows[e.timingClass]} />
                        <span className="chip !text-[8px]">{tpl(t.company.timingTpl, { s: e.timingScore })}</span>
                        {e.investmentAmountIdr && <span className="chip !text-[8px] !text-[color:var(--green)]">{fmtIdr(e.investmentAmountIdr)}</span>}
                      </div>
                      {e.expectedCompletionDate && (
                        <p className="mt-1.5 font-data text-[9.5px] text-[color:var(--ink-dim)]">
                          {tpl(t.company.completionTpl, {
                            d: fmtDate(e.expectedCompletionDate),
                            m: Math.round(daysBetween(parseDate(e.expectedCompletionDate), parseDate("2030-12-31")) / 30.44),
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {transitions.length > 0 && (
              <div className="panel p-5">
                <div className="label mb-3 text-[8px]">{t.company.transitionTitle}</div>
                {transitions.map((tr, i) => (
                  <div key={i} className="mb-3 flex items-center gap-2 border border-[color:var(--line)] px-3 py-2.5 last:mb-0">
                    <StageBadge stage={tr.from} />
                    <span className="font-data text-[10px] text-[color:var(--muted)]">↓ {tr.days}d</span>
                    <StageBadge stage={tr.to} />
                  </div>
                ))}
                <p className="label mt-3 text-[7.5px]">{t.company.transitionNote}</p>
              </div>
            )}
            <div className="panel p-5">
              <div className="label mb-3 text-[8px]">{t.company.footprint}</div>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Map(mappings.map((m) => [m.goalNumber, m])).values()).map((m) => (
                  <GoalChip key={m.goalNumber} n={m.goalNumber} color={m.goalColor} target={m.targetCode} />
                ))}
              </div>
              <div className="mt-4 space-y-2.5">
                {Array.from(new Map(mappings.map((m) => [m.goalNumber, m])).values()).map((m) => (
                  <ScoreBar
                    key={m.goalNumber}
                    label={tpl(t.company.goalBarTpl, { n: m.goalNumber, c: m.targetCode ? ` · ${m.targetCode}` : "" })}
                    value={m.evidence}
                    color={m.goalColor}
                    right={`${m.evidence}`}
                  />
                ))}
              </div>
            </div>
            <div className="panel p-5">
              <div className="label mb-2 text-[8px]">{t.company.registry}</div>
              <KV k={t.company.regTicker} v={company.ticker} />
              <KV k={t.company.regSector} v={company.sector} mono={false} />
              <KV k={t.company.regIndustry} v={company.industry} mono={false} />
              <KV k={t.company.regExchange} v={company.exchange} />
            </div>
          </div>
        </section>

        {/* signals */}
        <section className="mt-10">
          <div className="mb-5 flex items-baseline gap-3">
            <span className="font-data text-[11px] text-[color:var(--accent)]">S</span>
            <h2 className="text-lg font-semibold tracking-tight">{t.company.signalsTitle} — {company.ticker}</h2>
          </div>
          {sigRows.length === 0 ? (
            <div className="panel px-6 py-10 text-center font-data text-[11px] text-[color:var(--muted)]">
              {t.company.signalsEmpty}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sigRows.map((sig) => (
                <SignalCard key={sig.id} sig={sig} t={t} locale={locale} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

function JKey({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[#5FA8D3]">&quot;{k}&quot;</span>
      <span className="text-[color:var(--muted)]">:</span>
      <span className="text-[color:var(--ink-dim)]">{children}</span>
    </div>
  );
}

function InterpRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1 border-b border-[color:var(--line)] pb-3 last:border-b-0 last:pb-0">
      <span className="label text-[7.5px]">{label}</span>
      <span className="text-[12px] leading-relaxed text-[color:var(--ink-dim)]">{children}</span>
    </li>
  );
}

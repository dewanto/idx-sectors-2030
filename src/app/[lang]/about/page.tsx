import { Database, ExternalLink, Info, Scale } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { SectionHead } from "@/components/ui";
import { FlowDiagram, NeqBlock } from "@/components/about/diagram";
import LiveCountdown from "@/components/LiveCountdown";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { daysLeftTo2030, liveDateLabel } from "@/lib/live-clock";
import { hrefLang } from "@/i18n/link";

export const dynamic = "force-dynamic";

/**
 * Official reference links — stored once here (not per locale) so the About
 * page cites canonical sources: the 2030 Agenda resolution, the 17 goal
 * pages, the indicator catalogue, and the UNCTAD SDG financing-gap estimate.
 */
const UN_REFS = [
  "https://sdgs.un.org/2030agenda",
  "https://sdgs.un.org/goals",
  "https://unstats.un.org/sdgs/",
  "https://unctad.org/topic/investment-and-enterprises/world-investment-report",
];

interface LiveStats {
  companies: number;
  priceRows: number;
  creditsUsed: number;
  creditTotal: number;
}

/** Read-only snapshot for the transparency section. Must never break the page. */
async function getLiveStats(): Promise<LiveStats | null> {
  try {
    const [companies] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.companies);
    const [priceRows] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.marketPrices);
    const [credits] = await db
      .select({ used: sql<number>`coalesce(sum(${schema.syncState.creditsUsed}), 0)::int` })
      .from(schema.syncState);
    const total = Number(process.env.SECTORS_TOTAL_CREDIT_BUDGET || 1000);
    const pre = Number(process.env.SECTORS_CREDITS_ALREADY_USED || 0);
    return {
      companies: companies.n,
      priceRows: priceRows.n,
      creditsUsed: pre + credits.used,
      creditTotal: total,
    };
  } catch {
    return null;
  }
}

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const a = t.about;
  const stats = await getLiveStats();

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />

      {/* ── 01 — THE 2030 THESIS ─────────────────────────────────────── */}
      <section className="dotgrid border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 pb-12 pt-10 md:px-8 md:pb-16 md:pt-14">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-[color:var(--accent)]" />
            <span className="label !text-[color:var(--accent)] text-[9px]">{a.heroEyebrow}</span>
          </div>

          <h1 className="mt-4 font-semibold leading-[0.98] tracking-[-0.02em] text-[clamp(30px,6.5vw,76px)]">
            {a.heroHeadline}
          </h1>

          <p className="mt-5 max-w-[780px] text-[13.5px] leading-relaxed text-[color:var(--ink-dim)]">
            {a.heroIntro}
          </p>
          <p className="mt-4 max-w-[780px] text-[13.5px] leading-relaxed text-[color:var(--ink)]">
            {a.heroExecution}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 font-data text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
            {a.heroExecutionList.map((w) => (
              <span key={w} className="border border-[color:var(--line)] px-2 py-1">
                {w}
              </span>
            ))}
          </div>

          <div className="mt-12 border-t border-[color:var(--line)] pt-10">
            <h2 className="max-w-[980px] font-semibold leading-tight tracking-tight text-[clamp(22px,4.2vw,44px)]">
              <span className="relative inline-block text-[color:var(--accent)]">
                {a.heroQuestion}
                <span className="absolute -bottom-1.5 left-0 h-[3px] w-full bg-[color:var(--accent)]" />
              </span>
            </h2>
            <p className="mt-5 max-w-[780px] text-[13.5px] leading-relaxed text-[color:var(--ink)]">
              {a.heroQuestionLead}
            </p>
            <p className="mt-2 max-w-[780px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
              {a.heroQuestionSub}
            </p>

            <div className="mt-8 max-w-[440px]">
              <FlowDiagram steps={a.thesisFlow} />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        {/* ── 02 — WHY 2030 MATTERS ──────────────────────────────────── */}
        <section>
          <SectionHead index="02" title={a.whyTitle} sub={a.whySub} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="panel p-5">
              <p className="text-[12.5px] leading-relaxed text-[color:var(--ink)]">{a.whyBody1}</p>
              <p className="mt-3 text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{a.whyBody2}</p>
            </div>
            <div className="panel flex flex-col justify-center p-5">
              <span className="label text-[9px]">SDG financing gap · UNCTAD</span>
              <p className="mt-2 font-data text-[15px] font-semibold leading-snug text-[color:var(--accent)]">
                {a.financingCallout}
              </p>
            </div>
          </div>

          <div className="panel mt-3 p-5">
            <div className="label text-[9px]">{a.refsTitle}</div>
            <ul className="mt-3 space-y-3">
              {a.refs.map((ref, i) => (
                <li key={ref.label} className="flex items-start gap-2.5">
                  <ExternalLink size={13} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
                  <div>
                    <a
                      href={UN_REFS[i] ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-medium text-[color:var(--ink)] underline decoration-[color:var(--line-strong)] underline-offset-4 transition-colors hover:text-[color:var(--accent)]"
                    >
                      {ref.label}
                    </a>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[color:var(--muted)]">{ref.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 03 — COMPANIES ARE THE EXECUTION LAYER ─────────────────── */}
        <section className="mt-12">
          <SectionHead index="03" title={a.layerTitle} sub={a.layerSub} />
          <div className="grid gap-3 md:grid-cols-[1.15fr_1fr]">
            <div className="panel p-5">
              <p className="text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{a.layerBody}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {a.layerList.map((x) => (
                  <li key={x} className="chip">
                    {x}
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-l-2 border-[color:var(--line-strong)] pl-3">
                <p className="text-[12px] leading-relaxed text-[color:var(--muted)]">{a.layerQuote1}</p>
                <p className="mt-1 text-[12px] font-medium leading-relaxed text-[color:var(--ink)]">
                  {a.layerQuote2}
                </p>
              </div>
            </div>
            <div className="panel p-5">
              <FlowDiagram steps={a.layerFlow} compact />
            </div>
          </div>
        </section>

        {/* ── 04 — ALIGNMENT IS NOT ENOUGH ───────────────────────────── */}
        <section className="mt-12">
          <SectionHead index="04" title={a.alignTitle} />
          <div className="panel p-6 md:p-8">
            <NeqBlock left={a.alignLeft} right={a.alignRight} neq={a.alignNeq} />
            <div className="mx-auto mt-7 max-w-[460px]">
              <FlowDiagram steps={a.alignFormula} join="+" compact />
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <p className="panel p-5 text-[12.5px] leading-relaxed text-[color:var(--ink)]">{a.alignBody1}</p>
            <p className="panel p-5 text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{a.alignBody2}</p>
          </div>
        </section>

        {/* ── 05 — THE RESEARCH QUESTION ─────────────────────────────── */}
        <section className="mt-12">
          <SectionHead index="05" title={a.questionTitle} />
          <div className="dotgrid panel p-6 md:p-10">
            <p className="max-w-[1000px] font-semibold leading-snug tracking-tight text-[clamp(18px,2.6vw,30px)]">
              {a.questionBig}
            </p>
            <p className="mt-6 text-[13px] leading-relaxed text-[color:var(--muted)]">{a.questionBody}</p>
            <p className="mt-1.5 font-data text-[13px] uppercase tracking-[0.14em] text-[color:var(--accent)]">
              {a.questionBody2}
            </p>
          </div>
        </section>

        {/* ── 06 — FROM GLOBAL GOALS TO MARKET SIGNALS ───────────────── */}
        <section className="mt-12">
          <SectionHead index="06" title={a.chainTitle} sub={a.chainSub} />
          <div className="grid gap-3 md:grid-cols-[minmax(250px,380px)_1fr]">
            <div className="panel p-5">
              <FlowDiagram steps={a.chainFlow} compact />
            </div>
            <div className="panel p-5">
              <ol className="space-y-4">
                {a.chainQa.map((qa, i) => (
                  <li key={qa.k} className="grid gap-1 md:grid-cols-[190px_1fr] md:items-baseline">
                    <span className="font-data text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--accent)]">
                      {String(i + 1).padStart(2, "0")} · {qa.k}
                    </span>
                    <span className="text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{qa.q}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── 07 — HOW THE INTELLIGENCE IS DERIVED ───────────────────── */}
        <section className="mt-12">
          <SectionHead index="07" title={a.methodTitle} sub={a.methodSub} />
          <div className="panel p-5">
            <div className="grid gap-3 md:grid-cols-3">
              {a.methodSplit.map((m) => (
                <div key={m.label} className="border border-[color:var(--line)] p-4">
                  <div className="font-data text-[26px] font-semibold leading-none text-[color:var(--accent)]">
                    {m.pct}
                  </div>
                  <div className="label mt-2 text-[9px]">{m.label}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] italic leading-relaxed text-[color:var(--muted)]">{a.methodNote}</p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {a.methodLayers.map((l) => (
              <div key={l.title} className="panel p-5">
                <div className="text-[13px] font-semibold tracking-tight">{l.title}</div>
                <ul className="mt-3 space-y-1.5">
                  {l.items.map((it) => (
                    <li key={it} className="flex items-baseline gap-2 text-[12px] leading-relaxed text-[color:var(--ink-dim)]">
                      <span className="h-1 w-1 shrink-0 translate-y-[-2px] bg-[color:var(--accent)]" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="panel mt-3 p-5">
            <div className="label text-[9px]">{a.methodPipeline.title}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--muted)]">{a.methodPipeline.body}</p>
          </div>
        </section>

        {/* ── 08 — WHY SECTORS IS CORE ───────────────────────────────── */}
        <section className="mt-12">
          <SectionHead index="08" title={a.sectorsTitle} sub={a.sectorsSub} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="panel space-y-2 p-5">
              <p className="text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{a.sectorsBody1}</p>
              <p className="text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{a.sectorsBody2}</p>
              <p className="text-[12.5px] leading-relaxed text-[color:var(--ink)]">{a.sectorsBody3}</p>
              <p className="pt-2 text-[12.5px] font-medium leading-relaxed text-[color:var(--ink)]">
                {a.sectorsBody4}
              </p>
            </div>
            <div className="panel p-5">
              <FlowDiagram
                join="+"
                compact
                steps={[...a.sectorsFormula.map((f) => `${f.k} — ${f.q}`), a.sectorsResult]}
              />
            </div>
          </div>
        </section>

        {/* ── 09 — A SIGNAL IS NOT JUST A SCORE ──────────────────────── */}
        <section className="mt-12">
          <SectionHead index="09" title={a.signalTitle} sub={a.signalSub} />
          <div className="panel p-5 md:p-6">
            <div className="flex flex-wrap gap-2">
              {a.signalQuestions.map((q) => (
                <span key={q} className="chip !whitespace-normal !text-[color:var(--ink)]">
                  {q}
                </span>
              ))}
            </div>
            <div className="mx-auto mt-6 max-w-[520px]">
              <FlowDiagram steps={a.signalFormula} join="+" compact />
            </div>
            <p className="mt-6 max-w-[860px] text-[12.5px] leading-relaxed text-[color:var(--muted)]">
              {a.signalBody}
            </p>
          </div>
        </section>

        {/* ── 10 — THE 2030 EXECUTION CLOCK ──────────────────────────── */}
        <section className="mt-12">
          <SectionHead index="10" title={a.clockTitle} sub={a.clockSub} />
          <div className="panel p-5 md:p-6">
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="chip">{a.clockNow} · {liveDateLabel(locale)}</span>
              <span className="chip">{a.clockAdopted}</span>
              <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">{a.clockDeadline}</span>
              <span className="chip !border-[color:var(--accent)] !text-[color:var(--accent)]">
                D-{daysLeftTo2030().toLocaleString("en-US")}
              </span>
            </div>
            <div className="border border-[color:var(--line-strong)]">
              <LiveCountdown labels={t.countdown} />
            </div>
            <p className="mt-5 max-w-[860px] text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">
              {a.clockBody}
            </p>
          </div>
        </section>

        {/* ── 11 — ADDITIONAL TIME CONTEXT ───────────────────────────── */}
        <section className="mt-12">
          <SectionHead index="11" title={a.gannTitle} sub={a.gannSub} />
          <p className="max-w-[880px] text-[12.5px] leading-relaxed text-[color:var(--ink)]">{a.gannBody1}</p>
          <p className="mt-2 max-w-[880px] text-[12.5px] leading-relaxed text-[color:var(--muted)]">{a.gannBody2}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {a.gannDetails.map((d) => (
              <div key={d.title} className="panel p-5">
                <div className="text-[12.5px] font-semibold tracking-tight">{d.title}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">{d.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 12 — WHO IS THIS FOR? ──────────────────────────────────── */}
        <section className="mt-12">
          <SectionHead index="12" title={a.whoTitle} sub={a.whoSub} />
          <div className="grid gap-3 md:grid-cols-2">
            {a.who.map((w) => (
              <div key={w.title} className="panel p-5">
                <span className="label text-[9px] !text-[color:var(--accent)]">{w.role}</span>
                <div className="mt-1.5 text-[13px] font-semibold tracking-tight">{w.title}</div>
                <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--muted)]">{w.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 13 — TRANSPARENCY & LIMITS ─────────────────────────────── */}
        <section className="mt-12">
          <SectionHead
            index="13"
            title={a.transTitle}
            sub={a.transSub}
            right={
              stats ? (
                <span className="chip">
                  <Database size={11} className="mr-1 inline" />
                  {stats.creditsUsed}/{stats.creditTotal} {a.statCredits}
                </span>
              ) : undefined
            }
          />
          {stats && (
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="chip">
                <Database size={11} />
                {stats.companies} {a.statCompanies}
              </span>
              <span className="chip">
                {stats.priceRows} {a.statPrices}
              </span>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {a.transItems.map((item) => (
              <div key={item.title} className="panel p-5">
                <div className="text-[12.5px] font-semibold tracking-tight">{item.title}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 14 — ONE QUESTION. ONE EVIDENCE CHAIN. ─────────────────── */}
        <section className="mt-12">
          <SectionHead index="14" title={a.flowTitle} sub={a.flowSub} />
          <div className="grid gap-3 md:grid-cols-[minmax(240px,360px)_1fr]">
            <div className="panel p-5">
              <FlowDiagram steps={a.flowChain} compact />
            </div>
            <div className="panel p-5">
              <ul className="space-y-4">
                {a.flowPages.map((p) => {
                  const linkable = !p.path.includes("[");
                  return (
                    <li key={p.path} className="grid gap-1 md:grid-cols-[220px_1fr] md:items-baseline">
                      {linkable ? (
                        <a
                          href={hrefLang(locale, p.path)}
                          className="font-data text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)] underline decoration-[color:var(--line-strong)] underline-offset-4 transition-colors hover:text-[color:var(--ink)]"
                        >
                          {p.label}{" "}
                          <span className="text-[10px] text-[color:var(--muted)]">{p.path}</span>
                        </a>
                      ) : (
                        <span className="font-data text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ink-dim)]">
                          {p.label}{" "}
                          <span className="text-[10px] text-[color:var(--muted)]">{p.path}</span>
                        </span>
                      )}
                      <span className="text-[12px] leading-relaxed text-[color:var(--muted)]">{p.use}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* ── 15 — FINAL THESIS ────────────────────────────────────────── */}
      <section className="dotgrid border-t border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-14 md:px-8 md:py-20">
          <div className="space-y-2">
            {a.finalLines.map((line, i) => (
              <p
                key={line}
                className={`font-semibold leading-tight tracking-tight text-[clamp(20px,4.4vw,44px)] ${
                  i === a.finalLines.length - 1 ? "text-[color:var(--accent)]" : ""
                }`}
              >
                {line}
              </p>
            ))}
          </div>

          <div className="mt-12 border-t border-[color:var(--line)] pt-10">
            <div className="label text-[10px]">{a.finalBrand}</div>
            <div className="mt-4 flex flex-wrap gap-2 font-data text-[11px] uppercase tracking-[0.16em] text-[color:var(--ink)]">
              {a.finalChips.map((c) => (
                <span key={c} className="border border-[color:var(--line-strong)] px-3 py-1.5">
                  {c}
                </span>
              ))}
            </div>
            <h2 className="mt-10 max-w-[1100px] font-semibold leading-tight tracking-tight text-[color:var(--accent)] text-[clamp(18px,3vw,34px)]">
              {a.finalTagline}
            </h2>
            <p className="mt-6 text-[11.5px] text-[color:var(--muted)]">{a.finalDisclaimer}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 pb-10 md:px-8">
        <div className="panel flex items-start gap-3 border-[rgba(242,92,92,0.35)] p-5">
          <Scale size={14} className="mt-0.5 shrink-0 text-[#F25C5C]" />
          <p className="text-[11px] leading-relaxed text-[color:var(--muted)]">{a.disclaimer}</p>
        </div>
      </div>

      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

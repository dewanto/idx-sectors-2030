import Link from "next/link";
import { ArrowUpRight, Target, Globe2 } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CountUp from "@/components/CountUp";
import { ScoreBar } from "@/components/ui";
import { getGoalSummaries } from "@/db/queries";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { tpl } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";

export const dynamic = "force-dynamic";

/* UN monitoring context (annual SDG Progress Report family) — contextual input only */
const PROGRESS: Record<number, "offTrack" | "moderate" | "regression"> = {
  1: "offTrack",
  2: "offTrack",
  3: "moderate",
  4: "moderate",
  5: "offTrack",
  6: "offTrack",
  7: "moderate",
  8: "moderate",
  9: "moderate",
  10: "regression",
  11: "offTrack",
  12: "offTrack",
  13: "regression",
  14: "offTrack",
  15: "offTrack",
  16: "offTrack",
  17: "moderate",
};

const TONE: Record<string, string> = {
  offTrack: "#F25C5C",
  moderate: "#FFB224",
  regression: "#B457F2",
};

export default async function GoalsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const goals = await getGoalSummaries();
  const active = goals.filter((g) => g.signalCount > 0);
  const totalSignals = goals.reduce((a, b) => a + b.signalCount, 0);

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />
      <section className="dotgrid border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
          <div className="flex items-center gap-2">
            <Target size={14} className="text-[color:var(--accent)]" />
            <span className="label !text-[color:var(--accent)] text-[9px]">{t.goals.badge}</span>
          </div>
          <h1 className="mt-3 text-[32px] font-semibold leading-tight tracking-tight md:text-[46px]">
            {t.goals.titleA} <span className="text-[color:var(--accent)]">{t.goals.titleB}</span>
          </h1>
          <p className="mt-3 max-w-[640px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
            {t.goals.sub}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="chip chip-solid">{tpl(t.goals.chipActiveTpl, { a: active.length })}</span>
            <span className="chip">{tpl(t.goals.chipSignalsTpl, { n: totalSignals })}</span>
            <span className="chip">
              <Globe2 size={11} className="text-[color:var(--blue)]" /> {t.goals.chipGsdr}
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {goals.map((g) => {
            const key = PROGRESS[g.goalNumber];
            const has = g.signalCount > 0;
            return (
              <div key={g.id} className="panel panel-hover group relative flex flex-col overflow-hidden">
                <div className="relative p-4 pb-3" style={{ background: `${g.color}14` }}>
                  <div className="flex items-start justify-between">
                    <span className="font-data text-[44px] font-semibold leading-none" style={{ color: g.color }}>
                      {String(g.goalNumber).padStart(2, "0")}
                    </span>
                    <span className="h-6 w-6" style={{ background: g.color }} />
                  </div>
                  <div className="mt-2 text-[13.5px] font-semibold tracking-tight">{g.shortTitle}</div>
                  <div className="label mt-1 h-6 text-[7.5px] leading-snug">{g.title}</div>
                </div>

                <div className="flex flex-1 flex-col p-4 pt-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="border border-[color:var(--line)] py-2">
                      <div className={`font-data text-[17px] font-semibold ${has ? "text-[color:var(--ink)]" : "text-[color:var(--muted)]"}`}>
                        <CountUp value={g.signalCount} />
                      </div>
                      <div className="label text-[6.5px]">{t.goals.cardSignals}</div>
                    </div>
                    <div className="border border-[color:var(--line)] py-2">
                      <div className={`font-data text-[17px] font-semibold ${has ? "text-[color:var(--ink)]" : "text-[color:var(--muted)]"}`}>
                        <CountUp value={g.companyCount} />
                      </div>
                      <div className="label text-[6.5px]">{t.goals.cardCompanies}</div>
                    </div>
                    <div className="border border-[color:var(--line)] py-2">
                      <div className={`font-data text-[17px] font-semibold ${has ? "text-[color:var(--accent)]" : "text-[color:var(--muted)]"}`}>
                        <CountUp value={g.executing} />
                      </div>
                      <div className="label text-[6.5px]">{t.goals.cardExecuting}</div>
                    </div>
                  </div>

                  {g.targets.length > 0 && (
                    <div className="mt-3">
                      <div className="label mb-1.5 text-[6.5px]">{t.goals.mappedTargets}</div>
                      <div className="flex flex-wrap gap-1">
                        {g.targets.slice(0, 4).map((tt) => (
                          <span key={tt.id} className="border border-[color:var(--line)] px-1.5 py-0.5 font-data text-[9px]" style={{ color: g.color }}>
                            {tt.targetCode}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex-1">
                    {has ? (
                      <ScoreBar
                        label={g.tickers.length ? tpl(t.goals.topCompaniesTpl, { x: g.tickers.join(", ") }) : t.goals.activityWord}
                        value={g.topStrength}
                        color={g.color}
                        right={String(g.topStrength)}
                      />
                    ) : (
                      <p className="border border-dashed border-[color:var(--line)] px-2.5 py-2 font-data text-[9px] text-[color:var(--muted)]">
                        {t.goals.noEvents}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3">
                    <span className="label text-[7px]">
                      {t.goals.globalContext}{" "}
                      <span className="font-data font-semibold" style={{ color: TONE[key] }}>
                        {t.goals.statuses[key]}
                      </span>
                    </span>
                    <Link
                      href={hrefLang(locale, `/picker?goal=${g.goalNumber}`)}
                      className="flex items-center gap-1 font-data text-[9px] uppercase tracking-[0.14em] opacity-60 transition-opacity hover:opacity-100"
                      style={{ color: g.color }}
                    >
                      {t.goals.pick} <ArrowUpRight size={10} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="label mt-6 max-w-[900px] text-[8px] leading-relaxed">{t.goals.footnote}</p>
      </main>
      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

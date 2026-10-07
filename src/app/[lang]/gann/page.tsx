import { Database, Timer } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import GannWindowGauge from "@/components/GannWindowGauge";
import GannMatrix from "@/components/GannMatrix";
import { SectionHead } from "@/components/ui";
import { getGannTickers, getGannWindow } from "@/db/queries";
import { dictFor, normalizeLocale } from "@/i18n/server";
import { fmtDate } from "@/lib/system";

export const dynamic = "force-dynamic";

export default async function GannPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const g = t.gann;

  const windowData = await getGannWindow();
  const tickerRows = windowData ? await getGannTickers() : [];

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />

      <section className="dotgrid border-b border-[color:var(--line)] bg-[#0c0f12]" data-tour="gann-hero">
        <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-[color:var(--accent)]" />
            <span className="label !text-[color:var(--accent)] text-[9px]">{g.badge}</span>
          </div>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight md:text-[44px]">
            {g.titleA} <span className="text-[color:var(--accent)]">{g.titleB}</span>
          </h1>
          <p className="mt-3 max-w-[760px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">{g.sub}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">{g.notSignalChip}</span>
            {windowData && (
              <>
                <span className="chip">
                  {g.anchorChip} {fmtDate(windowData.zeroPoint.date)} @ {windowData.zeroPoint.close.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                </span>
                <span className="chip">
                  {g.nextChip}{" "}
                  {windowData.focus
                    ? `${windowData.focus.cycle}d · ${fmtDate(windowData.focus.date)} · ${
                        windowData.focus.daysAway >= 0 ? "+" : ""
                      }${windowData.focus.daysAway}d`
                    : "—"}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        {!windowData ? (
          <div className="panel p-8 text-center">
            <Database size={22} className="mx-auto text-[color:var(--accent)]" />
            <h2 className="mt-3 text-[16px] font-semibold tracking-tight">{g.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-[560px] text-[12px] leading-relaxed text-[color:var(--ink-dim)]">
              {g.emptyBody}
            </p>
            <code className="mt-4 inline-block border border-[color:var(--line)] bg-[rgba(232,236,241,0.04)] px-3 py-2 font-data text-[11px] text-[color:var(--accent)]">
              npm run db:sync
            </code>
          </div>
        ) : (
          <>
            <section>
              <SectionHead index="01" title={g.windowTitle} sub={g.windowSub} />
              <GannWindowGauge d={windowData} t={g} />
            </section>

            <section className="mt-12">
              <SectionHead
                index="02"
                title={g.matrixTitle}
                sub={g.matrixSub}
                right={<span className="chip">{g.tickerCount} {g.tickerUnit}</span>}
              />
              <GannMatrix rows={tickerRows} locale={locale} t={g} />
            </section>

            <section className="mt-12">
              <SectionHead index="03" title={g.methodTitle} sub={g.methodSub} />
              <div className="panel p-5">
                <ol className="space-y-3">
                  {g.methodSteps.map((s, i) => (
                    <li key={s.title} className="grid gap-2 md:grid-cols-[28px_1fr]">
                      <span className="font-data text-[11px] font-semibold text-[color:var(--accent)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="text-[12.5px] font-semibold tracking-tight">{s.title}</div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[color:var(--muted)]">{s.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 border-t border-[color:var(--line)] pt-3">
                  <p className="label text-[7.5px] leading-relaxed">{g.detectionNote}</p>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer t={t.footer} locale={locale} />
    </div>
  );
}
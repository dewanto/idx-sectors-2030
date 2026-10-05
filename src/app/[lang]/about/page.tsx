import { BookOpen, Database, ExternalLink, Info, Scale } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { SectionHead } from "@/components/ui";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import { dictFor, normalizeLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

/**
 * Official UN reference links — stored once here (not per locale) so the
 * About page cites the canonical sources: the 2030 Agenda resolution, the
 * 17 goal pages, and the indicator catalogue.
 */
const UN_REFS = [
  "https://sdgs.un.org/2030agenda",
  "https://sdgs.un.org/goals",
  "https://unstats.un.org/sdgs/",
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

      <section className="dotgrid border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-[color:var(--accent)]" />
            <span className="label !text-[color:var(--accent)] text-[9px]">{a.badge}</span>
          </div>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight md:text-[44px]">
            {a.titleA} <span className="text-[color:var(--accent)]">{a.titleB}</span>
          </h1>
          <p className="mt-3 max-w-[760px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">{a.sub}</p>
          {stats && (
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="chip">{stats.companies} {a.statCompanies}</span>
              <span className="chip">{stats.priceRows} {a.statPrices}</span>
              <span className="chip">
                {stats.creditsUsed}/{stats.creditTotal} {a.statCredits}
              </span>
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        <section>
          <SectionHead index="01" title={a.whyTitle} sub={a.whySub} />
          <div className="grid gap-3 md:grid-cols-2">
            {a.whyItems.map((item) => (
              <div key={item.title} className="panel p-5">
                <div className="text-[13px] font-semibold tracking-tight">{item.title}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="panel mt-4 p-5">
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

        <section className="mt-12">
          <SectionHead index="02" title={a.methodTitle} sub={a.methodSub} />
          <div className="panel p-5">
            <ol className="space-y-3">
              {a.methodSteps.map((s, i) => (
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
          </div>
        </section>

        <section className="mt-12">
          <SectionHead
            index="03"
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
          <div className="grid gap-3 md:grid-cols-2">
            {a.transItems.map((item) => (
              <div key={item.title} className="panel p-5">
                <div className="text-[13px] font-semibold tracking-tight">{item.title}</div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <SectionHead index="04" title={a.readTitle} sub={a.readSub} />
          <div className="panel p-5">
            <ol className="space-y-3">
              {a.readSteps.map((s, i) => (
                <li key={s.title} className="grid gap-2 md:grid-cols-[28px_1fr]">
                  <span className="font-data text-[11px] font-semibold text-[color:var(--accent)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5 text-[12.5px] font-semibold tracking-tight">
                      <BookOpen size={12} className="text-[color:var(--accent)]" />
                      {s.title}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[color:var(--muted)]">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mt-12">
          <div className="panel flex items-start gap-3 border-[rgba(242,92,92,0.35)] p-5">
            <Scale size={14} className="mt-0.5 shrink-0 text-[#F25C5C]" />
            <p className="text-[11px] leading-relaxed text-[color:var(--muted)]">{a.disclaimer}</p>
          </div>
        </section>
      </main>

      <Footer t={t.footer} locale={locale} />
    </div>
  );
}
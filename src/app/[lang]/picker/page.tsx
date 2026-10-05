import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import PickerClient, { type GoalOpt, type TargetOpt } from "./PickerClient";
import { db } from "@/db";
import * as s from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { ScanSearch } from "lucide-react";
import { dictFor, normalizeLocale } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function PickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = dictFor(locale);
  const sp = await searchParams;
  const goalParam = typeof sp.goal === "string" ? Number(sp.goal) : undefined;
  const stagesParam =
    typeof sp.stages === "string" ? sp.stages.split(",").filter(Boolean) : undefined;
  const rightTime = sp.rightTime === "1";

  const goals = await db.select().from(s.sdgGoals).orderBy(asc(s.sdgGoals.goalNumber));
  const targets = await db
    .select({
      targetCode: s.sdgTargets.targetCode,
      title: s.sdgTargets.title,
      goalNumber: s.sdgGoals.goalNumber,
    })
    .from(s.sdgTargets)
    .innerJoin(s.sdgGoals, eq(s.sdgTargets.goalId, s.sdgGoals.id))
    .orderBy(asc(s.sdgTargets.targetCode));

  const companies = await db.select({ sector: s.companies.sector }).from(s.companies);
  const sectors = Array.from(new Set(companies.map((c) => c.sector))).sort();

  const goalOpts: GoalOpt[] = goals.map((g) => ({
    goalNumber: g.goalNumber,
    title: g.title,
    shortTitle: g.shortTitle,
    color: g.color,
  }));
  const targetOpts: TargetOpt[] = targets.map((t) => ({
    targetCode: t.targetCode,
    title: t.title,
    goalNumber: t.goalNumber,
  }));

  return (
    <div className="min-h-screen">
      <Nav t={t} locale={locale} />
      <section className="border-b border-[color:var(--line)] bg-[#0c0f12]">
        <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">
          <div className="flex items-center gap-2">
            <ScanSearch size={14} className="text-[color:var(--accent)]" />
            <span className="label !text-[color:var(--accent)] text-[9px]">{t.scan.badge}</span>
          </div>
          <h1 className="mt-3 max-w-[760px] text-[30px] font-semibold leading-tight tracking-tight md:text-[42px]">
            {t.scan.titleA} <span className="text-[color:var(--accent)]">{t.scan.titleB}</span>
          </h1>
          <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
            {t.scan.sub}
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">
        <PickerClient
          goals={goalOpts}
          targets={targetOpts}
          sectors={sectors}
          initialGoal={Number.isInteger(goalParam) ? goalParam : undefined}
          initialStages={stagesParam}
          initialRightTime={rightTime}
          t={t}
          locale={locale}
        />
      </main>
      <Footer t={t.footer} locale={locale} />
    </div>
  );
}

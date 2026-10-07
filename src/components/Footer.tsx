import Link from "next/link";
import { ArrowUpRight, Crosshair, ShieldAlert, BookOpen, Database } from "lucide-react";
import type { Dict, Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { desc, sql } from "drizzle-orm";

/**
 * Data-source badge: "Live · Sectors API" once a sync has run, "Awaiting first
 * sync" otherwise. Shows the remaining lifetime credit budget so quota usage
 * is visible at a glance. Defensive — a DB hiccup must never break the footer.
 */
async function DataSourceBadge() {
  let label = "Awaiting first sync";
  let hint = "No Sectors sync recorded yet — run npm run db:sync to load live data";
  try {
    const rows = await db
      .select()
      .from(schema.syncState)
      .orderBy(desc(schema.syncState.lastSyncAt))
      .limit(1);
    const st = rows[0];
    if (st) {
      const total = Number(process.env.SECTORS_TOTAL_CREDIT_BUDGET || 1000);
      const preused = Number(process.env.SECTORS_CREDITS_ALREADY_USED || 0);
      const [sum] = await db
        .select({ used: sql<number>`coalesce(sum(${schema.syncState.creditsUsed}), 0)::int` })
        .from(schema.syncState);
      const remaining = Math.max(0, total - (preused + sum.used));
      label = `Live · Sectors API · ${remaining}/${total} credits`;
      hint =
        `Last sync ${st.lastSyncAt.toISOString().slice(0, 10)} · ${st.tickersSynced} tickers · ` +
        `through ${st.lastTradingDate ?? "n/a"} · ${preused + sum.used}/${total} credits used`;
    }
  } catch {
    /* keep fallback label */
  }
  const live = label.startsWith("Live");
  return (
    <span
      title={hint}
      className={`border px-2 py-1 ${live ? "border-[color:var(--accent)] text-[color:var(--accent)]" : "border-[color:var(--line)]"}`}
    >
      {label}
    </span>
  );
}

export default function Footer({ t, locale }: { t: Dict["footer"]; locale?: Locale }) {
  return (
    <footer className="border-t border-[color:var(--line)] bg-[#0c0f12]">
      <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8">
        <div className="grid gap-8 md:grid-cols-[1fr_1fr_1.6fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center border border-[color:var(--line-strong)]">
                <Crosshair size={16} className="text-[color:var(--accent)]" strokeWidth={1.8} />
              </span>
              <div>
                <div className="text-[13px] font-semibold">
                  IDX Sectors <span className="text-[color:var(--accent)]">2030</span>
                </div>
                <div className="label text-[8px]">Sectors Market Intelligence</div>
              </div>
            </div>
            <p className="mt-4 max-w-[320px] text-[12px] leading-relaxed text-[color:var(--muted)]">
              {t.tagline}
            </p>
            {locale && (
              <div className="mt-3">
                <Link href={hrefLang(locale, "/about")} className="inline-flex items-center gap-1 font-data text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)] transition-colors hover:text-[color:var(--accent)]">
                  {t.aboutLink}
                  <ArrowUpRight size={11} strokeWidth={1.8} />
                </Link>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 font-data text-[9px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
              <a
                href="https://hackathon.sectors.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 border border-[color:var(--line)] px-2 py-1 transition-colors hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink)]"
              >
                Sectors Hackathon 2026
                <ArrowUpRight size={9} strokeWidth={1.8} />
              </a>
              <span className="border border-[color:var(--line)] px-2 py-1">Methodology v1.0.0</span>
              <DataSourceBadge />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <Database size={13} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
              <p className="text-[11.5px] leading-relaxed text-[color:var(--muted)]">
                {t.disc1a} <span className="text-[color:var(--ink-dim)]">{t.disc1b}</span>
                {t.disc1c}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <BookOpen size={13} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
              <p className="text-[11.5px] leading-relaxed text-[color:var(--muted)]">
                {t.disc2a}{" "}
                <span className="text-[color:var(--ink-dim)]">{t.disc2b}</span>
                {t.disc2c}
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldAlert size={13} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
              <p className="text-[11.5px] leading-relaxed text-[color:var(--muted)]">{t.disc3}</p>
            </div>
          </div>

          <div>
            <div className="label mb-3 text-[9px]">{t.chainTitle}</div>
            <div className="flex flex-wrap items-center gap-y-2 font-data text-[10px] uppercase tracking-[0.1em] text-[color:var(--muted)]">
              {t.chain.map((x, i, arr) => (
                <span key={x} className="flex items-center">
                  <span className={`border border-[color:var(--line)] px-2 py-1 ${i === arr.length - 1 ? "border-[color:var(--accent)] text-[color:var(--accent)]" : ""}`}>
                    {x}
                  </span>
                  {i < arr.length - 1 && <span className="px-1.5 text-[color:var(--accent)]">→</span>}
                </span>
              ))}
            </div>
            <div className="label mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-[8.5px]">
              {t.gridMeta.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

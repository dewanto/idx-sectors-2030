"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, LayoutGrid, Target, ScanSearch, Gauge, Timer, Info } from "lucide-react";
import { daysLeftTo2030, liveDateLabel } from "@/lib/live-clock";
import type { Dict, Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";
import LangSwitcher from "./LangSwitcher";

export default function Nav({ t, locale }: { t: Dict; locale: Locale }) {
  const path = usePathname();
  const home = hrefLang(locale, "/");
  const links = [
    { href: home, label: t.nav.dashboard, icon: LayoutGrid },
    { href: hrefLang(locale, "/picker"), label: t.scan.navLabel, icon: ScanSearch },
    { href: hrefLang(locale, "/goals"), label: t.nav.sdgMap, icon: Target },
    { href: hrefLang(locale, "/engine"), label: t.nav.engine, icon: Gauge },
    { href: hrefLang(locale, "/gann"), label: t.nav.gann, icon: Timer },
    { href: hrefLang(locale, "/about"), label: t.nav.about, icon: Info },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[color:var(--line)] bg-[rgba(10,12,14,0.86)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 md:px-8">
        <Link href={home} className="group flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center border border-[color:var(--line-strong)] bg-[color:var(--surface)]">
            <Crosshair size={16} className="text-[color:var(--accent)]" strokeWidth={1.8} />
          </span>
          <span className="leading-none">
            <span className="block text-[13px] font-semibold tracking-tight">
              IDX Sectors <span className="text-[color:var(--accent)]">2030</span>
            </span>
            <span className="label mt-0.5 block text-[8px]">{t.nav.brandSub}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 border px-3 py-1.5 font-data text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  active
                    ? "border-[color:var(--accent)] bg-[rgba(255,178,36,0.08)] text-[color:var(--accent)]"
                    : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                }`}
              >
                <l.icon size={13} strokeWidth={1.8} />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className="chip hidden xl:inline-flex">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
            <span suppressHydrationWarning>{liveDateLabel(locale)}</span>
          </span>
          <span className="chip hidden !border-[color:var(--accent)] !text-[color:var(--accent)] md:inline-flex">
            <span suppressHydrationWarning>D-{daysLeftTo2030().toLocaleString("en-US")}</span>
          </span>
          <LangSwitcher locale={locale} />
        </div>
      </div>
    </header>
  );
}

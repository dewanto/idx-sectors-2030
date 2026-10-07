"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, LayoutGrid, Target, ScanSearch, Gauge, Timer, Info, Play } from "lucide-react";
import { daysLeftTo2030, liveDateLabel } from "@/lib/live-clock";
import type { Dict, Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";
import { requestTourStart } from "@/components/OnboardingTour";
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
        <Link href={home} data-tour="nav-brand" className="group flex items-center gap-3">
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
                    <button
                      type="button"
                      data-tour="nav-tour-btn"
                      onClick={requestTourStart}
                      title={t.tour.navButton}
                      aria-label={t.tour.navButton}
                      className="chip cursor-pointer transition-colors hover:!border-[color:var(--accent)] hover:!text-[color:var(--accent)]"
                    >
                      <Play size={10} />
                      <span className="hidden md:inline">{t.tour.navButton}</span>
                    </button>
                    <LangSwitcher locale={locale} />
          <a
            href="https://github.com/dewanto/idx-sectors-2030"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            title="GitHub"
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--muted)] transition-colors hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink)]"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="h-[15px] w-[15px]">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { localeNames, type Locale } from "@/i18n/dict";

const ORDER: Locale[] = ["en", "id", "zh"];

export default function LangSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname();

  /** Swap the leading locale segment of the current path. */
  const swap = (l: Locale): string => {
    const parts = (pathname || "/en").split("/");
    parts[1] = l;
    return parts.join("/") || `/${l}`;
  };

  return (
    <div className="flex items-center border border-[color:var(--line)]">
      <span className="flex h-full items-center px-1.5 text-[color:var(--muted)]">
        <Languages size={11} />
      </span>
      {ORDER.map((l) => (
        <Link
          key={l}
          href={swap(l)}
          prefetch
          onClick={() => {
            /* best-effort preference hint for future bare-path visits; UI never depends on it */
            try {
              document.cookie = `SIGNAL_LOCALE=${l};path=/;max-age=31536000;SameSite=Lax`;
            } catch {}
          }}
          className={`px-2 py-1 font-data text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
            l === locale
              ? "bg-[color:var(--accent)] font-semibold text-[#17110a]"
              : "text-[color:var(--muted)] hover:text-[color:var(--ink)]"
          }`}
          aria-label={`Switch language to ${localeNames[l]}`}
          aria-current={l === locale}
        >
          {localeNames[l]}
        </Link>
      ))}
    </div>
  );
}

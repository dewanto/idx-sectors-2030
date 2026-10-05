import { DEADLINE_2030 } from "@/lib/system";
import type { Locale } from "@/i18n/dict";

const LOCALE_TAG: Record<Locale, string> = { en: "en-GB", id: "id-ID", zh: "zh-CN" };

/** Live application date, formatted per-locale — e.g. "6 Oct 2026" / "6 Okt 2026" / "2026年10月6日". */
export function liveDateLabel(locale: Locale, now = new Date()): string {
  return now.toLocaleDateString(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Days remaining to the 2030 deadline (31 Dec 2030), anchored to the real clock. */
export function daysLeftTo2030(now = new Date()): number {
  return Math.max(0, Math.round((DEADLINE_2030.getTime() - now.getTime()) / 86_400_000));
}

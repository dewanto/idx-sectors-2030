import type { Locale } from "./dict";

/** Prefix an app path with the locale segment. */
export function hrefLang(locale: Locale | string, href: string): string {
  const clean = href.startsWith("/") ? href : `/${href}`;
  return `/${locale}${clean === "/" ? "" : clean}`;
}

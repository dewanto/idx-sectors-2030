import { headers } from "next/headers";
import { dictionaries, LOCALE_COOKIE, type Dict, type Locale } from "./dict";

export { LOCALE_COOKIE };

export function normalizeLocale(v: string | undefined | null): Locale {
  return v === "id" || v === "zh" ? v : "en";
}

/** Read the locale injected by middleware for the current request. */
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  return normalizeLocale(h.get("x-locale"));
}

export async function getDict(): Promise<Dict> {
  return dictionaries[await getLocale()];
}

export function dictFor(locale: Locale): Dict {
  return dictionaries[locale];
}

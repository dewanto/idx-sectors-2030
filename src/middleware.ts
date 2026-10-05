import { NextRequest, NextResponse } from "next/server";

const LOCALES = ["en", "id", "zh"] as const;
const DEFAULT_LOCALE = "en";
const LOCALE_COOKIE = "SIGNAL_LOCALE";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const firstSeg = pathname.split("/")[1];

  if ((LOCALES as readonly string[]).includes(firstSeg)) {
    /* valid locale prefix — inject the locale for the root layout via request header */
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-locale", firstSeg);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  /* bare path — redirect to preferred locale (cookie hint, EN default) */
  const pref = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale =
    pref && (LOCALES as readonly string[]).includes(pref) ? pref : DEFAULT_LOCALE;
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, { status: 308 });
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};

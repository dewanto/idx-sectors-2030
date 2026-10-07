"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { dictionaries, type Locale } from "@/i18n/dict";

/**
 * Interactive onboarding tour (driver.js).
 *
 * One guided tour walks a new user through the product across pages:
 * dashboard → signal picker → scan → signal cards → heatmap → company file → Gann.
 *
 * Tour state lives in localStorage so the tour survives client-side navigation
 * (this component is mounted once per locale layout, so it never unmounts while
 * the app routes) and page reloads:
 *   - `idx2030_tour_done`  — set once the visitor has seen/finished the tour
 *   - `idx2030_tour_step`  — pending step index while a tour is in flight
 *
 * The tour auto-starts on the dashboard on first visit; the navbar "Take Tour"
 * button restarts it at any time via `requestTourStart()`.
 */

const TOUR_DONE_KEY = "idx2030_tour_done";
const TOUR_STEP_KEY = "idx2030_tour_step";
const TOUR_START_EVENT = "idx2030:tour-start";

/** Ask the tour (mounted in the locale layout) to start from step 1. */
export function requestTourStart() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOUR_START_EVENT));
}

interface TourLocation {
  path: string;
  selector: string;
}

/** The 7 tour stops, in order. Each anchors to a `data-tour` attribute. */
function buildTourLocations(locale: Locale, ticker: string | null): TourLocation[] {
  const home = `/${locale}`;
  const picker = `/${locale}/picker`;
  /* Without a resolvable ticker the "Company File" stop degrades to pointing at
     the dashboard signal cards instead of skipping a step. */
  const companyFile: TourLocation = ticker
    ? { path: `/${locale}/companies/${ticker}`, selector: "[data-tour='company-chart']" }
    : { path: home, selector: "[data-tour='dash-signals']" };
  return [
    { path: home, selector: "[data-tour='nav-brand']" }, // 1 · dashboard overview
    { path: picker, selector: "[data-tour='picker-goals']" }, // 2 · signal picker
    { path: picker, selector: "[data-tour='picker-scan']" }, // 3 · run scan
    { path: home, selector: "[data-tour='dash-signals']" }, // 4 · signal cards
    { path: home, selector: "[data-tour='dash-heatmap']" }, // 5 · heatmap
    companyFile, // 6 · company file
    { path: `/${locale}/gann`, selector: "[data-tour='gann-hero']" }, // 7 · gann analysis
  ];
}

function waitForSelector(selector: string, timeoutMs: number, alive: () => boolean): Promise<Element | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (!alive()) return resolve(null);
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      window.setTimeout(poll, 90);
    };
    poll();
  });
}

export default function OnboardingTour({ locale, ticker }: { locale: Locale; ticker: string | null }) {
  const t = dictionaries[locale].tour;
  const pathname = usePathname();
  const router = useRouter();
  const [runId, setRunId] = useState(0);
  const driverRef = useRef<Driver | null>(null);
  const transitioningRef = useRef(false);

  /* Navbar "Take Tour" requests — restart the tour from step 1. */
  useEffect(() => {
    const onStart = () => {
      try {
        localStorage.removeItem(TOUR_DONE_KEY);
        localStorage.setItem(TOUR_STEP_KEY, "0");
      } catch {}
      transitioningRef.current = true;
      setRunId((n) => n + 1);
      if (pathname !== `/${locale}`) router.push(`/${locale}`);
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, [locale, pathname, router]);

  useEffect(() => {
    const locations = buildTourLocations(locale, ticker);
    let cancelled = false;

    const finishTour = () => {
      try {
        localStorage.removeItem(TOUR_STEP_KEY);
        localStorage.setItem(TOUR_DONE_KEY, "1");
      } catch {}
    };
    const destroyDriver = () => {
      const d = driverRef.current;
      driverRef.current = null;
      d?.destroy();
    };

    const drive = async () => {
      let idx: number | null = null;
      let autoStart = false;
      try {
        const raw = localStorage.getItem(TOUR_STEP_KEY);
        if (raw !== null) {
          idx = Math.min(Math.max(Number.parseInt(raw, 10) || 0, 0), locations.length - 1);
        } else if (!localStorage.getItem(TOUR_DONE_KEY) && pathname === `/${locale}`) {
          /* first visit — auto-start on the dashboard */
          idx = 0;
          autoStart = true;
          localStorage.setItem(TOUR_STEP_KEY, "0");
        }
      } catch {
        return;
      }

      if (idx === null) {
        transitioningRef.current = false;
        destroyDriver();
        return;
      }

      const loc = locations[idx];
      if (loc.path !== pathname) {
        if (transitioningRef.current) return; // our own cross-page move is in flight
        finishTour(); // user navigated elsewhere mid-tour — end politely
        destroyDriver();
        return;
      }
      transitioningRef.current = false;

      if (autoStart) await new Promise((r) => setTimeout(r, 700));
      const el = await waitForSelector(loc.selector, 10_000, () => !cancelled);
      if (cancelled) return;
      if (!el) {
        finishTour();
        destroyDriver();
        return;
      }

      destroyDriver();

      const move = (target: number) => {
        if (target < 0 || target >= locations.length) return;
        try {
          localStorage.setItem(TOUR_STEP_KEY, String(target));
        } catch {}
        const nextLoc = locations[target];
        if (nextLoc.path !== pathname) {
          transitioningRef.current = true;
          destroyDriver();
          router.push(nextLoc.path);
        } else {
          drv.moveTo(target);
        }
      };

      const drv = driver({
        overlayColor: "#050709",
        overlayOpacity: 0.78,
        stagePadding: 10,
        stageRadius: 6,
        allowClose: true,
        allowKeyboardControl: false, // all movement is hook-controlled (cross-page aware)
        showProgress: true,
        progressText: t.progressTpl,
        nextBtnText: t.next,
        prevBtnText: t.prev,
        doneBtnText: t.done,
        closeBtnLabel: t.close,
        popoverClass: "idx-tour-popover",
        steps: locations.map((l, i) => ({
          element: l.selector,
          popover: {
            title: t.steps[i]?.title ?? `Step ${i + 1}`,
            description: t.steps[i]?.body ?? "",
            side: "bottom",
            align: "center",
          },
        })) satisfies DriveStep[],
        onPopoverRender: (p) => {
          /* stable handles for styling + e2e tests regardless of internal classes */
          p.nextButton.setAttribute("data-tour-btn", "next");
          p.previousButton.setAttribute("data-tour-btn", "prev");
          p.closeButton.setAttribute("data-tour-btn", "close");
          p.nextButton.classList.add("idx-tour-btn-primary");
          p.previousButton.classList.add("idx-tour-btn-ghost");
        },
        onNextClick: () => {
          if (drv.isLastStep()) {
            finishTour();
            destroyDriver();
            return;
          }
          move((drv.getActiveIndex() ?? idx) + 1);
        },
        onDoneClick: () => {
          finishTour();
          destroyDriver();
        },
        onPrevClick: () => {
          move((drv.getActiveIndex() ?? idx) - 1);
        },
        onCloseClick: () => {
          finishTour();
          destroyDriver();
        },
      });

      driverRef.current = drv;
      drv.drive(idx);
    };

    void drive();

    return () => {
      cancelled = true;
      if (!transitioningRef.current) destroyDriver();
    };
  }, [pathname, locale, ticker, t, router, runId]);

  return null;
}
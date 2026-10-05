import Link from "next/link";
import { GoalChip } from "./ui";
import type { Dict, Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";

const RAIL_START = new Date("2026-01-01T00:00:00Z").getTime();
const RAIL_END = new Date("2031-01-01T00:00:00Z").getTime();
const NOW_PCT = ((new Date("2026-09-28T00:00:00Z").getTime() - RAIL_START) / (RAIL_END - RAIL_START)) * 100;

function pos(iso: string): number {
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.min(100, Math.max(0, ((t - RAIL_START) / (RAIL_END - RAIL_START)) * 100));
}

export interface TimelineItem {
  id: number;
  ticker: string;
  goalNumber: number;
  goalColor: string;
  targetCode: string | null;
  stage: string;
  timingClass: string;
  eventDate: string;
  expectedCompletion: string;
  strength: number;
}

export default function TimelineRail({ items, t, locale }: { items: TimelineItem[]; t: Dict["rail"]; locale: Locale }) {
  const years = [2027, 2028, 2029, 2030].map((y) => ({
    year: y,
    pct: ((new Date(`${y}-01-01T00:00:00Z`).getTime() - RAIL_START) / (RAIL_END - RAIL_START)) * 100,
  }));

  return (
    <div className="panel overflow-hidden">
      {/* header rail */}
      <div className="relative border-b border-[color:var(--line)] px-4 pb-7 pt-4 md:px-6">
        <div className="relative ml-[120px] hidden md:block">
          <div className="h-px bg-[color:var(--line-strong)]" />
          {years.map((y) => (
            <div key={y.year} className="absolute top-0" style={{ left: `${y.pct}%` }}>
              <div className="h-2 w-px bg-[color:var(--line-strong)]" />
              <div className="label mt-1 -translate-x-1/2 text-[8px]">{y.year}</div>
            </div>
          ))}
          <div className="absolute -top-0.5" style={{ left: `${NOW_PCT}%` }}>
            <div className="pulse-dot h-2 w-2 -translate-x-1/2 rounded-full bg-[color:var(--accent)]" />
            <div className="label mt-1.5 -translate-x-1/2 whitespace-nowrap text-[7.5px] !text-[color:var(--accent)]">{t.now}</div>
          </div>
          <div className="absolute right-0 top-[-4px]">
            <span className="font-data text-[10px] font-semibold text-[#F25C5C]">◆ 2030</span>
          </div>
        </div>
        <span className="label text-[8px] md:hidden">{t.mobileNote}</span>
      </div>

      {/* rows */}
      <div>
        {items.map((it) => {
          const a = pos(it.eventDate);
          const b = pos(it.expectedCompletion);
          return (
            <Link
              href={hrefLang(locale, `/signals/${it.id}`)}
              key={it.id}
              className="group grid grid-cols-[96px_1fr] items-center gap-3 border-b border-[color:var(--line)] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[rgba(232,236,241,0.02)] md:grid-cols-[120px_1fr] md:px-6"
            >
              <div className="flex items-center gap-2">
                <GoalChip n={it.goalNumber} color={it.goalColor} />
                <span className="font-data text-[11.5px] font-semibold text-[color:var(--ink)]">{it.ticker}</span>
              </div>
              <div className="relative h-6 max-md:overflow-x-auto">
                <div className="relative min-w-[480px] md:min-w-0">
                  <div className="absolute left-0 right-0 top-[11px] h-px bg-[color:var(--line)]" />
                  {years.map((y) => (
                    <div key={y.year} className="absolute top-[8px] h-[8px] w-px bg-[color:var(--line)]" style={{ left: `${y.pct}%` }} />
                  ))}
                  <div className="absolute top-[9px] h-[4px] w-[2px] bg-[color:var(--accent)]" style={{ left: `${NOW_PCT}%` }} />
                  {/* event → completion bar */}
                  <div
                    className="absolute top-[10px] h-[3px]"
                    style={{ left: `${a}%`, width: `${Math.max(0.8, b - a)}%`, background: `${it.goalColor}88` }}
                  />
                  <div
                    className="absolute top-[7.5px] h-[9px] w-[9px] -translate-x-1/2 rounded-full border-2"
                    style={{ left: `${a}%`, borderColor: it.goalColor, background: "#0A0C0E" }}
                    title={`Event: ${it.eventDate}`}
                  />
                  <div
                    className="absolute top-[7px] h-[10px] w-[10px] -translate-x-1/2 rotate-45"
                    style={{ left: `${b}%`, background: it.goalColor }}
                    title={`Expected completion: ${it.expectedCompletion}`}
                  />
                  <div className="absolute top-4 -translate-x-1/2" style={{ left: `${a}%` }}>
                    <span className="label text-[6.5px]">{it.stage}</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-5 px-4 py-3 md:px-6">
        <span className="label flex items-center gap-2 text-[8px]">
          <span className="inline-block h-[9px] w-[9px] rounded-full border-2 border-[color:var(--accent)]" /> {t.legendEvent}
          <span className="ml-3 inline-block h-[9px] w-[9px] rotate-45 bg-[color:var(--accent)]" /> {t.legendCompletion}
          <span className="ml-3 inline-block h-3 w-[2px] bg-[color:var(--accent)]" /> {t.legendNow}
        </span>
        <span className="label text-[8px]">{t.foot}</span>
      </div>
    </div>
  );
}

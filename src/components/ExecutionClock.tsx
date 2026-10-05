import { EXECUTION_WINDOWS, MONTHS_TO_2030, YEARS_TO_2030 } from "@/lib/system";
import { Milestone, Radar, Flag } from "lucide-react";
import LiveCountdown from "./LiveCountdown";
import { tpl, type Dict } from "@/i18n/dict";

const ADOPT = "25 Sep 2015";
const NOW = "28 Sep 2026";
const DEADLINE = "31 Dec 2030";

/* position on 2015-09-25 → 2030-12-31 rail */
const P_NOW = 75.6; // 28 Sep 2026
const P_GSDR = 78.2; // Sep 2027 GSDR checkpoint

export default function ExecutionClock({ t: d }: { t: Dict }) {
  const t = d.hero;
  return (
    <section className="dotgrid relative overflow-hidden border-b border-[color:var(--line)]">
      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-12 md:px-8 md:pb-14 md:pt-16">
        {/* intro line */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="chip">
            <Radar size={11} className="text-[color:var(--accent)]" />
            {t.systemClock} · {NOW}
          </span>
          <span className="chip">{t.adopted} · {ADOPT}</span>
          <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">
            <Flag size={11} />
            {t.deadline} · {DEADLINE}
          </span>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <h1 className="text-[13vw] font-semibold leading-[0.94] tracking-[-0.03em] sm:text-[64px] lg:text-[76px] xl:text-[86px]">
              {t.titleA}
              <br />
              {t.titleB && <span className="text-[color:var(--muted)]">{t.titleB} </span>}
              <span className="relative inline-block text-[color:var(--accent)]">
                {t.titleC}
                <span className="absolute -bottom-2 left-0 h-[3px] w-full bg-[color:var(--accent)]" />
              </span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed text-[color:var(--ink-dim)]">
              {t.subtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 font-data text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
              {t.tags.map((tag, i) => (
                <span
                  key={tag}
                  className={`border px-2 py-1 ${i === t.tags.length - 1 ? "border-[color:var(--accent)] text-[color:var(--accent)]" : "border-[color:var(--line)]"}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label text-[9px]">{t.clockRemaining}</span>
              <span className="font-data text-[10px] text-[color:var(--muted)]">
                {tpl(t.approxTpl, { m: MONTHS_TO_2030, y: YEARS_TO_2030 })}
              </span>
            </div>
            <div className="border border-[color:var(--line-strong)]">
              <LiveCountdown labels={d.countdown} />
            </div>

            {/* 2015 → 2030 rail */}
            <div className="mt-6">
              <div className="relative h-14">
                <div className="absolute left-0 right-0 top-7 h-px bg-[color:var(--line-strong)]" />
                {/* elapsed */}
                <div
                  className="absolute left-0 top-[27px] h-[3px] -translate-y-[1px] bg-[color:var(--accent)]"
                  style={{ width: `${P_NOW}%` }}
                />
                {/* GSDR checkpoint */}
                <div className="absolute top-[22px]" style={{ left: `${P_GSDR}%` }}>
                  <div className="h-[10px] w-px bg-[color:var(--blue)]" />
                  <div className="label mt-1 -translate-x-1/2 whitespace-nowrap text-[7.5px] !text-[color:var(--blue)]">
                    {t.gsdr}
                  </div>
                </div>
                {/* now */}
                <div className="absolute top-[19px]" style={{ left: `${P_NOW}%` }}>
                  <div className="pulse-dot h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-[color:var(--accent)]" />
                  <div className="label -translate-x-1/2 whitespace-nowrap text-[8px] !text-[color:var(--accent)]">
                    {t.nowRail}
                  </div>
                </div>
                <div className="absolute left-0 top-9">
                  <Milestone size={11} className="text-[color:var(--muted)]" />
                  <div className="label mt-1 text-[7.5px]">{t.adoptedRail}</div>
                </div>
                <div className="absolute right-0 top-9 text-right">
                  <Flag size={11} className="ml-auto text-[#F25C5C]" />
                  <div className="label mt-1 text-[7.5px] !text-[#F25C5C]">2030</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* execution windows */}
        <div className="mt-10 border border-[color:var(--line)]">
          <div className="grid md:grid-cols-5">
            {EXECUTION_WINDOWS.map((w, i) => {
              const current = i === 0;
              return (
                <div
                  key={w.period}
                  className={`relative border-[color:var(--line)] px-4 py-4 max-md:border-b md:border-l md:first:border-l-0 ${
                    current ? "bg-[rgba(255,178,36,0.05)]" : "bg-[color:var(--surface)]"
                  }`}
                >
                  {current && <div className="absolute inset-x-0 top-0 h-[2px] bg-[color:var(--accent)]" />}
                  <div className="flex items-center justify-between">
                    <span className={`font-data text-[11px] font-semibold ${current ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]"}`}>
                      {w.period}
                    </span>
                    {current && (
                      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                    )}
                  </div>
                  <div className="label mt-2 text-[8.5px] tracking-[0.14em]">{t.windows[i] ?? w.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="label mt-3 text-[8px] tracking-[0.14em]">{t.windowsNote}</p>
      </div>
    </section>
  );
}

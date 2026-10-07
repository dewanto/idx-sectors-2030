import { Fragment } from "react";
import { AGENDA_ADOPTED, DEADLINE_2030, EXECUTION_WINDOWS, parseDate } from "@/lib/system";
import { daysLeftTo2030, liveDateLabel } from "@/lib/live-clock";
import { Milestone, Radar, Flag } from "lucide-react";
import LiveCountdown from "./LiveCountdown";
import { tpl, type Dict, type Locale } from "@/i18n/dict";

/* GSDR checkpoint (Sep 2027) — reference marker on the rail */
const GSDR_DATE = new Date("2027-09-30T00:00:00Z");
const RAIL_SPAN = DEADLINE_2030.getTime() - AGENDA_ADOPTED.getTime();
const railPct = (d: Date) =>
  Math.min(100, Math.max(0, ((d.getTime() - AGENDA_ADOPTED.getTime()) / RAIL_SPAN) * 100));

export default function ExecutionClock({ t: d, locale }: { t: Dict; locale: Locale }) {
  const t = d.hero;

  /* live application date — rendered per request (force-dynamic) */
  const now = new Date();
  const pNow = railPct(now);
  const pGsdr = railPct(GSDR_DATE);
  const nowLabel = liveDateLabel(locale, now);

  /* remaining runway, consistent with the live countdown */
  const daysLeft = daysLeftTo2030(now);
  const monthsLeft = +(daysLeft / 30.44).toFixed(1);
  const yearsLeft = +(daysLeft / 365.25).toFixed(2);

  return (
    <section className="dotgrid relative overflow-hidden border-b border-[color:var(--line)]">
      <div className="mx-auto max-w-[1440px] px-4 pb-10 pt-12 md:px-8 md:pb-14 md:pt-16">
        {/* status chips */}
        <div className="rise-in mb-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "0.72s" }}>
          <span className="chip">
            <Radar size={11} className="text-[color:var(--accent)]" />
            {t.systemClock} · {nowLabel}
          </span>
          <span className="chip">{t.adopted} · 25 Sep 2015</span>
          <span className="chip !border-[rgba(242,92,92,0.4)] !text-[#F25C5C]">
            <Flag size={11} />
            {t.deadline} · 31 Dec 2030
          </span>
        </div>

        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-end lg:gap-10">
          {/* ── left — the thesis ─────────────────────────────── */}
          <div>
            <p
              className="rise-in label text-[9px] tracking-[0.24em] text-[color:var(--accent)]"
              style={{ animationDelay: "0.05s" }}
            >
              {t.eyebrow}
            </p>
            <h1 className="mt-4 font-semibold tracking-[-0.03em]">
              <span
                className="rise-in block text-[11.5vw] leading-[0.94] sm:text-[58px] lg:text-[66px] xl:text-[76px]"
                style={{ animationDelay: "0.12s" }}
              >
                {t.line1}
              </span>
              <span
                className="rise-in mt-3 block text-[8vw] leading-[1.02] tracking-[-0.02em] text-[color:var(--ink-dim)] sm:text-[36px] lg:text-[40px] xl:text-[46px]"
                style={{ animationDelay: "0.22s" }}
              >
                {t.line2}
              </span>
              <span
                className="rise-in mt-2 block text-[8vw] leading-[1.02] tracking-[-0.02em] text-[color:var(--accent)] sm:text-[36px] lg:text-[40px] xl:text-[46px]"
                style={{ animationDelay: "0.3s" }}
              >
                {t.line3}
              </span>
            </h1>
            <p className="rise-in mt-6 max-w-[600px] text-[15px] leading-relaxed text-[color:var(--ink-dim)]" style={{ animationDelay: "0.38s" }}>
              {t.subtitle}
            </p>
            <p
              className="rise-in mt-3 max-w-[600px] font-data text-[10.5px] leading-relaxed tracking-[0.02em] text-[color:var(--muted)]"
              style={{ animationDelay: "0.42s" }}
            >
              {t.support}
            </p>

            {/* thesis question */}
            <div
              className="rise-in mt-8 max-w-[640px] border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-5 py-4"
              style={{ animationDelay: "0.5s" }}
            >
              <p className="font-data text-[14px] font-semibold uppercase leading-snug tracking-[0.08em] text-[color:var(--ink)] md:text-[16px]">
                {t.question}
              </p>
            </div>

            {/* bridge — global plan → execution → market → priority */}
            <div
              className="rise-in mt-6 flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2"
              style={{ animationDelay: "0.58s" }}
            >
              {t.bridge.map((step, i) => (
                <Fragment key={step}>
                  {i > 0 && (
                    <span
                      aria-hidden
                      className="rotate-90 self-center pl-1 font-data text-[12px] leading-none text-[color:var(--accent)] sm:rotate-0 sm:pl-0"
                    >
                      →
                    </span>
                  )}
                  <span
                    className={`whitespace-nowrap border px-2.5 py-1.5 font-data text-[10px] uppercase tracking-[0.12em] ${
                      i === t.bridge.length - 1
                        ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                        : "border-[color:var(--line)] text-[color:var(--ink)]"
                    }`}
                  >
                    {step}
                  </span>
                </Fragment>
              ))}
            </div>

            {/* strategic tags */}
            <div
              className="rise-in mt-6 flex flex-wrap gap-2 font-data text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]"
              style={{ animationDelay: "0.66s" }}
            >
              {t.tags.map((tag, i) => (
                <span
                  key={tag}
                  className={`border px-2 py-1 ${
                    i === t.tags.length - 1
                      ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                      : "border-[color:var(--line)]"
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* ── right — teaser video (desktop) + the execution clock ── */}
          <div className="rise-in" style={{ animationDelay: "0.4s" }}>
            <div className="hidden lg:block">
              <div className="border border-[color:var(--line-strong)]">
                <iframe
                  src="https://www.youtube-nocookie.com/embed/8Yp1fmCoaPY?autoplay=1&mute=1&loop=1&playlist=8Yp1fmCoaPY&playsinline=1&rel=0"
                  title="IDX Sectors 2030 — 1-minute product teaser"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="aspect-video w-full"
                />
              </div>
              <p className="label mt-2 text-[8px] tracking-[0.14em]">PRODUCT TEASER · MUTED AUTOPLAY</p>
            </div>
            <p className="label mb-2 text-[9px] tracking-[0.22em] text-[color:var(--accent)]">{t.horizonLabel}</p>
            <div className="mb-2 flex items-center justify-between">
              <span className="label text-[9px]">{t.clockRemaining}</span>
              <span className="font-data text-[10px] text-[color:var(--muted)]">
                {tpl(t.approxTpl, { m: monthsLeft, y: yearsLeft })}
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
                  style={{ width: `${pNow}%` }}
                />
                {/* GSDR checkpoint */}
                <div className="absolute top-[22px]" style={{ left: `${pGsdr}%` }}>
                  <div className="h-[10px] w-px bg-[color:var(--blue)]" />
                  <div className="label mt-1 -translate-x-1/2 whitespace-nowrap text-[7.5px] !text-[color:var(--blue)] max-md:hidden">
                    {t.gsdr}
                  </div>
                </div>
                {/* now */}
                <div className="absolute top-[19px]" style={{ left: `${pNow}%` }}>
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

            {/* why time matters */}
            <p className="mt-5 max-w-[520px] text-[12.5px] leading-relaxed text-[color:var(--ink-dim)]">{t.clockCopy}</p>
            <p className="mt-2 max-w-[520px] text-[12.5px] leading-relaxed text-[color:var(--muted)]">{t.clockContext}</p>
          </div>
        </div>

        {/* execution windows */}
        <div className="mt-10 border border-[color:var(--line)]">
          <div className="grid md:grid-cols-5">
            {EXECUTION_WINDOWS.map((w, i) => {
              const tNow = now.getTime();
              const current = tNow >= parseDate(w.start).getTime() && tNow <= parseDate(w.end).getTime();
              return (
                <div
                  key={w.period}
                  className={`relative border-[color:var(--line)] px-4 py-4 max-md:border-b md:border-l md:first:border-l-0 ${
                    current ? "bg-[rgba(255,178,36,0.05)]" : "bg-[color:var(--surface)]"
                  }`}
                >
                  {current && <div className="absolute inset-x-0 top-0 h-[2px] bg-[color:var(--accent)]" />}
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-data text-[11px] font-semibold ${
                        current ? "text-[color:var(--accent)]" : "text-[color:var(--ink)]"
                      }`}
                    >
                      {w.period}
                    </span>
                    {current && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />}
                  </div>
                  <div className="label mt-2 text-[8.5px] tracking-[0.14em]">{t.windows[i] ?? w.label}</div>
                </div>
              );
            })}
          </div>

          <p className="label mt-3 text-[8px] tracking-[0.14em]">{t.windowsNote}</p>
        </div>
      </div>
    </section>
  );
}

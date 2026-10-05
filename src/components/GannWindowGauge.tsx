import { CalendarClock, Sigma, Sprout, TriangleAlert } from "lucide-react";
import type { GannWindowData } from "@/db/queries";
import { CYCLE_LABEL } from "@/lib/gann";

/**
 * Market-level panel: the detected zero point, the four Gann cycle windows,
 * the derived Fibonacci ladder, price-time squaring targets and Gann's
 * seasonal dates.
 *
 * Everything shown here is COMPUTED from stored index data — nothing on this
 * panel is a hard-coded level. See src/lib/gann.ts for why.
 */

export type GannLabels = {
  anchorTitle: string;
  anchorSub: string;
  anchorZero: string;
  anchorBars: string;
  anchorHigh: string;
  anchorCurrent: string;
  anchorEdge: string;
  windowsTitle: string;
  windowsSub: string;
  windowActive: string;
  windowUpcoming: string;
  windowPassed: string;
  windowIn: string;
  windowPast: string;
  windowDays: string;
  fibTitle: string;
  fibSub: string;
  fibNearest: string;
  fibAbove: string;
  fibBelow: string;
  squaringTitle: string;
  squaringSub: string;
  seasonalTitle: string;
  seasonalSub: string;
  caveat: string;
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "#FFB224",
  UPCOMING: "#5FA8D3",
  PASSED: "#5a6273",
};

const num = (v: number, d = 0) =>
  v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function GannWindowGauge({
  d,
  t,
}: {
  d: GannWindowData;
  t: GannLabels;
}) {
  const focus = d.focus;
  const fibPivot = d.fib.find((f) => f.ratio === 0.618)!;
  const series = d.series;
  const lo = Math.min(...series.map((p) => p.close));
  const hi = Math.max(...series.map((p) => p.close));
  const span = hi - lo || 1;
  const pts = series
    .map((p, i) => `${(i / Math.max(1, series.length - 1)) * 100},${34 - ((p.close - lo) / span) * 30}`)
    .join(" ");
  /* x position comes from the query, which force-retains the zero-point bar
     when thinning — resolving it here by index would silently fail. */
  const zeroX = d.zeroPointX;

  return (
    <div className="space-y-4">
      {/* ---------- zero point + IHSG level ---------- */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label flex items-center gap-1.5 text-[8px]">
              <CalendarClock size={11} className="text-[color:var(--accent)]" /> {t.anchorTitle}
            </div>
            <p className="label mt-1 text-[7.5px]">{t.anchorSub}</p>
          </div>
          <div className="text-right">
            <div className="label text-[7px]">{t.anchorCurrent}</div>
            <div className="font-data text-[30px] font-semibold leading-none text-[color:var(--ink)]">
              {num(d.latest.close, 2)}
            </div>
            <div className="font-data mt-1 text-[8.5px] text-[color:var(--muted)]">
              {d.indexCode} · {d.bars} bars · {d.latest.date}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-[72px] w-full">
            <defs>
              <linearGradient id="gannFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFB224" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#FFB224" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,36 ${pts} 100,36`} fill="url(#gannFill)" />
            <polyline points={pts} fill="none" stroke="#FFB224" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
            {zeroX !== null && (
              <line
                x1={zeroX}
                y1="0"
                x2={zeroX}
                y2="36"
                stroke="#39C06A"
                strokeWidth="0.6"
                strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {zeroX !== null && (
              <text x={zeroX} y="4.5" fill="#39C06A" fontSize="2.6" textAnchor="middle">
                zero
              </text>
            )}
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          <Stat label={t.anchorZero} value={`${d.zeroPoint.date}`} sub={`${num(d.zeroPoint.close, 2)}`} tone="#39C06A" />
          <Stat label={t.anchorHigh} value={d.swingHigh.date} sub={num(d.swingHigh.close, 2)} tone="#5FA8D3" />
          <Stat label={t.anchorBars} value={String(d.zeroPointBarsSearched)} sub={d.latest.date} tone="#8A94A6" />
        </div>

        {d.zeroPointEdgeConstrained && (
          <p className="label mt-3 flex items-start gap-1.5 border border-[rgba(255,178,36,0.35)] bg-[rgba(255,178,36,0.07)] px-2.5 py-2 text-[7.5px] !text-[color:var(--accent)]">
            <TriangleAlert size={11} className="mt-px shrink-0" /> {t.anchorEdge}
          </p>
        )}
      </div>

      {/* ---------- cycle windows ---------- */}
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[13.5px] font-semibold tracking-tight">{t.windowsTitle}</div>
            <p className="label mt-0.5 text-[7.5px]">{t.windowsSub}</p>
          </div>
          {focus && (
            <div className="text-right">
              <div className="label text-[7px]">
                {focus.status === "ACTIVE" ? t.windowActive : t.windowUpcoming}
              </div>
              <div
                className="font-data text-[34px] font-semibold leading-none"
                style={{ color: STATUS_TONE[focus.status] }}
              >
                {Math.abs(focus.daysAway)}
              </div>
              <div className="font-data mt-0.5 text-[8.5px] text-[color:var(--muted)]">
                {focus.daysAway >= 0 ? t.windowIn : t.windowPast} · {CYCLE_LABEL[focus.cycle]}
              </div>
            </div>
          )}
        </div>

        {/* countdown rail: where "today" sits between the zero point and the focus window */}
        {focus && (
          <div className="mt-4">
            <div className="relative h-[5px] w-full bg-[rgba(232,236,241,0.07)]">
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${Math.min(100, Math.max(0, 100 - (Math.abs(focus.daysAway) / Math.max(1, Math.abs(focus.daysAway) + 120)) * 100))}%`,
                  background: STATUS_TONE[focus.status],
                  opacity: 0.55,
                }}
              />
              <div className="absolute -top-1 h-[13px] w-[2px] bg-[color:var(--ink)]" style={{ left: 0 }} />
              <div
                className="absolute -top-1 h-[13px] w-[2px]"
                style={{ left: "100%", background: STATUS_TONE[focus.status] }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-data text-[7.5px] text-[color:var(--muted)]">
              <span>{d.zeroPoint.date} · zero point</span>
              <span>
                {focus.date} · {CYCLE_LABEL[focus.cycle]}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {d.windows.map((w) => {
            const tone = STATUS_TONE[w.status];
            const isFocus = focus?.cycle === w.cycle;
            return (
              <div
                key={w.cycle}
                className="border p-3"
                style={{
                  borderColor: isFocus ? `${tone}77` : "color-mix(in srgb, var(--line) 100%, transparent)",
                  background: isFocus ? `${tone}0f` : "transparent",
                }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-data text-[15px] font-semibold" style={{ color: tone }}>
                    {CYCLE_LABEL[w.cycle]}
                  </span>
                  <span className="font-data text-[8px]" style={{ color: tone }}>
                    {w.status === "ACTIVE" ? t.windowActive : w.status === "UPCOMING" ? t.windowUpcoming : t.windowPassed}
                  </span>
                </div>
                <div className="font-data mt-1 text-[10.5px] text-[color:var(--ink)]">{w.date}</div>
                <div className="font-data mt-0.5 text-[8.5px] text-[color:var(--muted)]">
                  {w.daysAway >= 0 ? `${t.windowIn} ${w.daysAway}${t.windowDays}` : `${t.windowPast} ${Math.abs(w.daysAway)}${t.windowDays}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- derived Fibonacci ladder ---------- */}
      <div className="panel p-5">
        <div className="text-[13.5px] font-semibold tracking-tight">{t.fibTitle}</div>
        <p className="label mt-0.5 text-[7.5px]">{t.fibSub}</p>

        <div className="mt-4 space-y-1.5">
          {d.fib.map((f) => {
            const isPivot = f.ratio === 0.618;
            const isNearest = d.nearestFib?.ratio === f.ratio;
            const tone = f.side === "BELOW" ? "var(--green)" : "var(--red)";
            return (
              <div
                key={f.ratio}
                className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border px-3 py-2"
                style={{
                  borderColor: isNearest ? "var(--accent)" : "var(--line)",
                  background: isNearest ? "rgba(255,178,36,0.06)" : "transparent",
                }}
              >
                <span className="font-data text-[11px] font-semibold" style={{ color: isNearest ? "var(--accent)" : "var(--ink-dim)" }}>
                  {f.ratio.toFixed(3)}
                </span>
                <span className="font-data text-[13px] text-[color:var(--ink)]">{num(f.price, 2)}</span>
                <span className="flex items-center gap-2">
                  {isPivot && <span className="chip !text-[7px]">0.618</span>}
                  {isNearest && <span className="chip !text-[7px] !border-[color:var(--accent)] !text-[color:var(--accent)]">{t.fibNearest}</span>}
                  <span className="font-data w-[62px] text-right text-[10px]" style={{ color: tone }}>
                    {f.distancePct > 0 ? "+" : ""}
                    {f.distancePct.toFixed(1)}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="label mt-3 text-[7.5px]">
          {t.fibAbove} {d.fib.filter((f) => f.side === "ABOVE").length} · {t.fibBelow}{" "}
          {d.fib.filter((f) => f.side === "BELOW").length} · pivot {num(fibPivot.price, 2)}
        </p>
      </div>

      {/* ---------- squaring + seasonal ---------- */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <Sigma size={13} className="text-[color:var(--accent)]" />
            <span className="text-[13.5px] font-semibold tracking-tight">{t.squaringTitle}</span>
          </div>
          <p className="label mt-1 text-[7.5px]">{t.squaringSub}</p>
          <div className="mt-3 space-y-2">
            {d.squaring.targets.map((s2) => (
              <div key={s2.factor} className="border border-[color:var(--line)] px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-data text-[10px] text-[color:var(--muted)]">
                    √{num(d.zeroPoint.close, 2)} = {d.squaring.root} × {s2.factor}
                  </span>
                  <span className="font-data text-[14px] font-semibold text-[color:var(--ink)]">{num(s2.price, 0)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="label text-[7px]">target</span>
                  <span
                    className="font-data text-[9.5px]"
                    style={{ color: s2.distancePct >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {s2.distancePct > 0 ? "+" : ""}
                    {s2.distancePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <Sprout size={13} className="text-[color:var(--accent)]" />
            <span className="text-[13.5px] font-semibold tracking-tight">{t.seasonalTitle}</span>
          </div>
          <p className="label mt-1 text-[7.5px]">{t.seasonalSub}</p>
          <div className="mt-3 space-y-1.5">
            {d.seasonal.map((s2) => {
              const tone =
                s2.status === "ACTIVE" ? "#FFB224" : s2.status === "UPCOMING" ? "#5FA8D3" : "#5a6273";
              return (
                <div key={s2.monthDay} className="flex items-baseline justify-between border-b border-[color:var(--line)] pb-1.5">
                  <span className="flex items-baseline gap-2">
                    <span className="font-data text-[11.5px]" style={{ color: tone }}>
                      {s2.date}
                    </span>
                    <span className="label text-[7.5px]">{s2.label}</span>
                  </span>
                  <span className="font-data text-[9.5px]" style={{ color: tone }}>
                    {s2.daysAway === 0 ? t.windowActive : s2.daysAway > 0 ? `${t.windowIn} ${s2.daysAway}d` : t.windowPassed}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- caveat ---------- */}
      <p className="label border border-[rgba(242,92,92,0.32)] bg-[rgba(242,92,92,0.06)] px-3 py-2.5 text-[7.5px] leading-relaxed !text-[#F25C5C]">
        {t.caveat}
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="border border-[color:var(--line)] px-3 py-2.5">
      <div className="label text-[7px]">{label}</div>
      <div className="font-data mt-1 text-[13px] font-semibold" style={{ color: tone }}>
        {value}
      </div>
      <div className="font-data mt-0.5 text-[8.5px] text-[color:var(--muted)]">{sub}</div>
    </div>
  );
}
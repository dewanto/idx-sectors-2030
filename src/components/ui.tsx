import { STAGE_META, TIMING_META, type Stage, type TimingClass } from "@/lib/system";

/* ---------------- Score dial (circular) ---------------- */

export function ScoreDial({
  value,
  size = 64,
  stroke = 4,
  color = "#FFB224",
  label,
  sub,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(232,236,241,0.08)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={off}
            strokeLinecap="butt"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-data font-semibold" style={{ fontSize: size * 0.26 }}>
            {value}
          </span>
        </div>
      </div>
      {label && (
        <div className="text-center">
          <div className="label text-[9px]">{label}</div>
          {sub && <div className="font-data text-[9px] text-[color:var(--ink-dim)]">{sub}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------- thin score bar ---------------- */

export function ScoreBar({
  label,
  value,
  max = 100,
  color = "#FFB224",
  right,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
  right?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label text-[9px]">{label}</span>
        <span className="font-data text-[11px] text-[color:var(--ink)]">{right ?? value}</span>
      </div>
      <div className="h-[3px] w-full bg-[rgba(232,236,241,0.08)]">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ---------------- badges ---------------- */

export function StageBadge({ stage, big = false }: { stage: string; big?: boolean }) {
  const meta = STAGE_META[stage as Stage];
  if (!meta) return null;
  return (
    <span
      className={`chip ${big ? "px-3 py-1.5 text-[11px]" : ""}`}
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: meta.color }} />
      {stage}
    </span>
  );
}

export function TimingBadge({ t, big = false, win }: { t: string; big?: boolean; win?: string }) {
  const meta = TIMING_META[t as TimingClass];
  if (!meta) return null;
  return (
    <span
      className={`chip ${big ? "px-3 py-1.5 text-[11px]" : ""}`}
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {win ?? `${meta.label} window`}
    </span>
  );
}

export function GoalChip({ n, color, target }: { n: number; color: string; target?: string | null }) {
  return (
    <span className="chip !gap-0 !p-0 overflow-hidden" title={`SDG ${n}`}>
      <span
        className="flex h-[22px] w-[22px] items-center justify-center font-data text-[11px] font-semibold"
        style={{ background: color, color: "#0A0C0E" }}
      >
        {n}
      </span>
      {target && <span className="px-1.5 font-data text-[10px]">{target}</span>}
    </span>
  );
}

export function SignalTypeChip({ type }: { type: string }) {
  return <span className="chip chip-solid">{type}</span>;
}

/* ---------------- section header ---------------- */

export function SectionHead({
  index,
  title,
  sub,
  right,
}: {
  index: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="font-data text-[11px] text-[color:var(--accent)]">{index}</span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ink)] md:text-xl">{title}</h2>
          {sub && <p className="label mt-1 text-[9px] tracking-[0.16em]">{sub}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ---------------- delta % ---------------- */

export function Delta({ v, suffix = "%" }: { v: number; suffix?: string }) {
  const color = v >= 0 ? "var(--green)" : "var(--red)";
  return (
    <span className="font-data text-[12px]" style={{ color }}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}
      {suffix}
    </span>
  );
}

/* ---------------- key/value row ---------------- */

export function KV({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="label text-[9px]">{k}</span>
      <span className={`text-right text-[12px] text-[color:var(--ink)] ${mono ? "font-data" : ""}`}>{v}</span>
    </div>
  );
}

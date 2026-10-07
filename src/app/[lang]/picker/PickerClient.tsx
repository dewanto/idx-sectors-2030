"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ScanSearch,
  Timer,
  RotateCcw,
  ArrowUpRight,
  FileSearch,
  CalendarClock,
  Check,
  Loader2,
  CircleDollarSign,
} from "lucide-react";
import { StageBadge, TimingBadge, GoalChip, ScoreDial } from "@/components/ui";
import { fmtIdr, fmtMonth, STAGE_META, TIMING_META } from "@/lib/system";
import { tpl, type Dict, type Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";

/* ---------------- types ---------------- */

export interface GoalOpt {
  goalNumber: number;
  title: string;
  shortTitle: string;
  color: string;
}
export interface TargetOpt {
  targetCode: string;
  goalNumber: number;
  title: string;
}

interface ResultRow {
  id: number;
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  signalType: string;
  signalStrength: number;
  sdgEvidenceScore: number;
  marketSignalScore: number;
  timingScore: number;
  executionStage: string;
  timingClass: string;
  goalNumber: number;
  goalColor: string;
  goalTitle: string;
  targetCode: string | null;
  targetTitle: string | null;
  eventTitle: string;
  eventDate: string;
  project: string | null;
  expectedCompletion: string | null;
  targetYear: number | null;
  investmentIdr: number | null;
  whyFlagged: string[];
  volumeRatio: number | null;
}

interface ApiResult {
  results: { best: ResultRow; count: number }[];
  summary: {
    companies: number;
    highEvidence: number;
    executing: number;
    deadlineSensitive: number;
    activeWindow: number;
  };
}

const STAGE_ORDER = ["MEASURED", "OPERATIONAL", "EXECUTING", "CONTRACTED", "COMMITTED", "INTENT"];
const TIMING_ORDER = ["EARLY", "ACTIVE", "CRITICAL", "LATE", "COMPLETED"];

function runwayMonths(expectedCompletion: string | null): number | null {
  if (!expectedCompletion) return null;
  const ms =
    (new Date("2030-12-31T00:00:00Z").getTime() - new Date(`${expectedCompletion}T00:00:00Z`).getTime()) /
    1000;
  return Math.round(ms / 86400 / 30.44);
}

/* ---------------- component ---------------- */

export default function PickerClient({
  goals,
  targets,
  sectors,
  initialGoal,
  initialStages,
  initialRightTime,
  t,
  locale,
}: {
  goals: GoalOpt[];
  targets: TargetOpt[];
  sectors: string[];
  initialGoal?: number;
  initialStages?: string[];
  initialRightTime?: boolean;
  t: Dict;
  locale: Locale;
}) {
  const [goal, setGoal] = useState<number | null>(initialGoal ?? null);
  const [target, setTarget] = useState<string | null>(null);
  const [stages, setStages] = useState<Set<string>>(new Set(initialStages ?? []));
  const [timing, setTiming] = useState<Set<string>>(new Set());
  const [selSectors, setSelSectors] = useState<Set<string>>(new Set());
  const [minEvidence, setMinEvidence] = useState(0);
  const [minTiming, setMinTiming] = useState(0);
  const [condition, setCondition] = useState<string | null>(null);
  const [minSignal, setMinSignal] = useState(0);
  const [rightTime, setRightTime] = useState(!!initialRightTime);
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (set: Set<string>, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const run = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (goal) p.set("goal", String(goal));
    if (target) p.set("target", target);
    if (stages.size) p.set("stages", [...stages].join(","));
    if (timing.size) p.set("timing", [...timing].join(","));
    if (selSectors.size) p.set("sectors", [...selSectors].join(","));
    if (minEvidence) p.set("minEvidence", String(minEvidence));
    if (minTiming) p.set("minTiming", String(minTiming));
    if (condition) p.set("condition", condition);
    if (minSignal) p.set("minSignal", String(minSignal));
    if (rightTime) p.set("rightTime", "1");
    try {
      const res = await fetch(`/api/picker?${p.toString()}`);
      const json = (await res.json()) as ApiResult;
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [goal, target, stages, timing, selSectors, minEvidence, minTiming, condition, minSignal, rightTime]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(run, 220);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [run]);

  const goalTargets = useMemo(() => targets.filter((tt) => tt.goalNumber === goal), [targets, goal]);
  const activeGoal = goals.find((g) => g.goalNumber === goal);

  const reset = () => {
    setGoal(null);
    setTarget(null);
    setStages(new Set());
    setTiming(new Set());
    setSelSectors(new Set());
    setMinEvidence(0);
    setMinTiming(0);
    setCondition(null);
    setMinSignal(0);
    setRightTime(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* ---------------- filter panel ---------------- */}
      <aside className="panel h-fit lg:sticky lg:top-[72px]">
        <div className="border-b border-[color:var(--line)] px-4 py-3">
          <div className="text-[13px] font-semibold tracking-tight">{t.scan.titleA}</div>
          <div className="label mt-0.5 text-[7.5px]">{t.scan.methodology.replace("{v}", "2026.1")}</div>
        </div>

        {/* SDG grid */}
                <div className="border-b border-[color:var(--line)] p-4" data-tour="picker-goals">
                  <div className="label mb-2.5 text-[8px]">{t.scan.stepSdg}</div>
          <div className="grid grid-cols-6 gap-1.5">
            {goals.map((g) => {
              const active = goal === g.goalNumber;
              return (
                <button
                  key={g.goalNumber}
                  title={tpl(t.picker.goalTipTpl, { n: g.goalNumber, title: g.title })}
                  onClick={() => {
                    setGoal(active ? null : g.goalNumber);
                    setTarget(null);
                  }}
                  className={`flex aspect-square items-center justify-center border font-data text-[12px] font-semibold transition-all ${
                    active ? "scale-[1.06] border-white/60" : "border-transparent hover:scale-[1.04]"
                  }`}
                  style={{ background: active ? g.color : `${g.color}22`, color: active ? "#0A0C0E" : g.color }}
                >
                  {g.goalNumber}
                </button>
              );
            })}
            <button
              onClick={() => {
                setGoal(null);
                setTarget(null);
              }}
              className={`col-span-1 flex aspect-square items-center justify-center border font-data text-[8px] uppercase tracking-wider transition-colors ${
                goal === null
                  ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                  : "border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--ink)]"
              }`}
            >
              {t.common.all}
            </button>
          </div>
          {activeGoal && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="h-2 w-2" style={{ background: activeGoal.color }} />
              <span className="text-[11px] text-[color:var(--ink-dim)]">{activeGoal.title}</span>
            </div>
          )}
        </div>

        {/* targets */}
        <div className="border-b border-[color:var(--line)] p-4">
          <div className="label mb-2.5 text-[8px]">{t.scan.stepTarget}</div>
          {goalTargets.length === 0 ? (
            <p className="font-data text-[10px] text-[color:var(--muted)]">
              {goal ? t.picker.targetsAllGoal : t.picker.targetsAll}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {goalTargets.map((tg) => {
                const active = target === tg.targetCode;
                return (
                  <button
                    key={tg.targetCode}
                    onClick={() => setTarget(active ? null : tg.targetCode)}
                    className={`border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "border-[color:var(--accent)] bg-[rgba(255,178,36,0.07)]"
                        : "border-[color:var(--line)] hover:border-[color:var(--line-strong)]"
                    }`}
                  >
                    <span className="font-data text-[10.5px] font-semibold text-[color:var(--accent)]">{tg.targetCode}</span>
                    <span className="mt-0.5 block line-clamp-2 text-[10px] leading-snug text-[color:var(--ink-dim)]">{tg.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* stages */}
        <div className="check-row border-b border-[color:var(--line)] p-4">
          <div className="label mb-2.5 text-[8px]">{t.scan.stepStage}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {STAGE_ORDER.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 text-[11px] text-[color:var(--ink-dim)]">
                <input
                  type="checkbox"
                  checked={stages.has(s)}
                  onChange={() => setStages((prev) => toggle(prev, s))}
                  className="h-3 w-3"
                />
                <span className="h-1.5 w-1.5" style={{ background: STAGE_META[s as keyof typeof STAGE_META].color }} />
                {t.stageLabels[s]}
              </label>
            ))}
          </div>
        </div>

        {/* timing */}
        <div className="check-row border-b border-[color:var(--line)] p-4">
          <div className="label mb-2.5 text-[8px]">{t.scan.stepTiming}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {TIMING_ORDER.map((tc) => (
              <label key={tc} className="flex cursor-pointer items-center gap-2 text-[11px] text-[color:var(--ink-dim)]">
                <input
                  type="checkbox"
                  checked={timing.has(tc)}
                  onChange={() => setTiming((prev) => toggle(prev, tc))}
                  className="h-3 w-3"
                />
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: TIMING_META[tc as keyof typeof TIMING_META].color }} />
                {TIMING_META[tc as keyof typeof TIMING_META].label}
              </label>
            ))}
          </div>
        </div>

        {/* sectors */}
        <div className="border-b border-[color:var(--line)] p-4">
          <div className="label mb-2.5 text-[8px]">{t.scan.stepSector}</div>
          <div className="flex flex-wrap gap-1.5">
            {sectors.map((scs) => {
              const active = selSectors.has(scs);
              return (
                <button
                  key={scs}
                  onClick={() => setSelSectors((prev) => toggle(prev, scs))}
                  className={`border px-2 py-1 font-data text-[9px] uppercase tracking-[0.1em] transition-colors ${
                    active
                      ? "border-[color:var(--accent)] bg-[rgba(255,178,36,0.08)] text-[color:var(--accent)]"
                      : "border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                  }`}
                >
                  {scs}
                </button>
              );
            })}
          </div>
        </div>

        {/* thresholds */}
        <div className="border-b border-[color:var(--line)] p-4">
          <div className="label mb-2.5 text-[8px]">{t.scan.stepCondition}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(["DISLOCATION", "CONFIRMATION", "DIVERGENCE", "NEUTRAL"] as const).map((cd) => {
              const active = condition === cd;
              return (
                <button
                  key={cd}
                  onClick={() => setCondition(active ? null : cd)}
                  className={`border px-2 py-1.5 font-data text-[9px] uppercase tracking-[0.08em] transition-colors ${
                    active
                      ? "border-[color:var(--accent)] bg-[rgba(255,178,36,0.08)] text-[color:var(--accent)]"
                      : "border-[color:var(--line)] text-[color:var(--muted)] hover:text-[color:var(--ink)]"
                  }`}
                >
                  {t.scan.conditions[cd]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 border-b border-[color:var(--line)] p-4">
          {[
            { l: t.scan.minSignal, v: minSignal, set: setMinSignal },
            { l: t.picker.minEvidence, v: minEvidence, set: setMinEvidence },
            { l: t.picker.minTiming, v: minTiming, set: setMinTiming },
          ].map((sld) => (
            <div key={sld.l}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label text-[8px]">{sld.l}</span>
                <span className="font-data text-[11px] text-[color:var(--accent)]">
                  {sld.v === 0 ? t.common.any : tpl(t.picker.gteTpl, { v: sld.v })}
                </span>
              </div>
              <input type="range" min={0} max={100} step={5} value={sld.v} onChange={(e) => sld.set(Number(e.target.value))} />
            </div>
          ))}
        </div>

        {/* actions */}
        <div className="space-y-2 p-4">
          <button
                      onClick={run}
                      data-tour="picker-scan"
                      className="flex w-full items-center justify-center gap-2 border border-[color:var(--accent)] bg-[color:var(--accent)] px-4 py-3 font-data text-[11px] font-semibold uppercase tracking-[0.16em] text-[#17110a] transition-opacity hover:opacity-85"
                    >
            <ScanSearch size={14} /> {loading ? t.scan.scanning : t.scan.scanBtn}
          </button>
          <button
            onClick={() => setRightTime((v) => !v)}
            className={`flex w-full items-center justify-center gap-2 border px-4 py-3 font-data text-[11px] uppercase tracking-[0.16em] transition-colors ${
              rightTime
                ? "border-[#00B3A4] bg-[rgba(0,179,164,0.1)] text-[#00B3A4]"
                : "border-[color:var(--line-strong)] text-[color:var(--ink-dim)] hover:border-[color:var(--ink)]"
            }`}
          >
            <Timer size={14} /> {rightTime ? t.picker.rightTimeOn : t.picker.rightTimeOff}
          </button>
          <button
            onClick={reset}
            className="flex w-full items-center justify-center gap-2 py-2 font-data text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--muted)] transition-colors hover:text-[color:var(--ink)]"
          >
            <RotateCcw size={11} /> {t.scan.reset}
          </button>
        </div>
      </aside>

      {/* ---------------- results ---------------- */}
      <section>
        {/* summary bar */}
        <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3">
            {loading ? (
              <Loader2 size={15} className="animate-spin text-[color:var(--accent)]" />
            ) : (
              <span className="font-data text-[26px] font-semibold leading-none text-[color:var(--accent)]">
                {data?.summary.companies ?? 0}
              </span>
            )}
            <div>
              <div className="text-[13px] font-semibold">
                {t.picker.foundWord}
                {goal && (
                  <span className="text-[color:var(--muted)]">
                    {" "}· SDG {goal}
                    {target ? ` · ${target}` : ""}
                  </span>
                )}
              </div>
              {data && !loading && (
                <div className="font-data text-[9.5px] text-[color:var(--muted)]">
                  {tpl(t.picker.summaryTpl, {
                    he: data.summary.highEvidence,
                    e: data.summary.executing,
                    ds: data.summary.deadlineSensitive,
                    aw: data.summary.activeWindow,
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rightTime && (
              <span className="chip !border-[#00B3A4] !text-[#00B3A4]">
                <Timer size={11} /> {t.picker.rankedChip}
              </span>
            )}
            <span className="chip">28 Sep 2026 · D-1,555</span>
          </div>
        </div>

        {/* right-time explainer */}
        {rightTime && (
          <div className="mb-4 border border-[rgba(0,179,164,0.3)] bg-[rgba(0,179,164,0.05)] px-4 py-3">
            <p className="text-[11.5px] leading-relaxed text-[color:var(--ink-dim)]">
              <span className="font-semibold text-[#00B3A4]">{t.picker.rtTitle}</span> {t.picker.rtBody}
            </p>
          </div>
        )}

        {/* result cards */}
        {loading && !data && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="panel h-[240px] animate-pulse" />
            ))}
          </div>
        )}
        {!loading && data && data.results.length === 0 && (
          <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
            <FileSearch size={26} className="text-[color:var(--muted)]" />
            <p className="max-w-[420px] text-[13px] leading-relaxed text-[color:var(--muted)]">{t.picker.emptyBody}</p>
          </div>
        )}
        {data && data.results.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.results.map(({ best, count }, i) => (
              <ResultCard key={best.id} r={best} count={count} rank={i + 1} rightTime={rightTime} t={t} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- result card ---------------- */

function ResultCard({
  r,
  count,
  rank,
  rightTime,
  t,
  locale,
}: {
  r: ResultRow;
  count: number;
  rank: number;
  rightTime: boolean;
  t: Dict;
  locale: Locale;
}) {
  const runway = runwayMonths(r.expectedCompletion);
  return (
    <div className="panel panel-hover group relative flex flex-col overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: r.goalColor }} />
      <div className="flex flex-1 flex-col p-5 pl-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <GoalChip n={r.goalNumber} color={r.goalColor} target={r.targetCode} />
            <span className="font-data text-[15px] font-semibold text-[color:var(--ink)]">{r.ticker}</span>
            {count > 1 && <span className="chip !text-[8px]">{tpl(t.picker.moreTpl, { n: count - 1 })}</span>}
          </div>
          {rightTime && (
            <span className="font-data text-[24px] font-semibold leading-none text-[rgba(0,179,164,0.35)]">
              {String(rank).padStart(2, "0")}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11.5px] text-[color:var(--ink-dim)]">
          {r.companyName} · <span className="text-[color:var(--muted)]">{r.industry}</span>
        </p>

        <div className="mt-4 flex items-end justify-between border-t border-[color:var(--line)] pt-4">
          <div>
            <div className="label text-[7.5px]">{rightTime ? t.picker.composite : t.common.signalStrength}</div>
            <div className="font-data text-[34px] font-semibold leading-none text-[color:var(--accent)]">
              {rightTime ? Math.round(r.timingScore * 0.6 + r.sdgEvidenceScore * 0.4) : r.signalStrength}
            </div>
          </div>
          <div className="flex gap-3.5">
            <ScoreDial value={r.sdgEvidenceScore} size={48} stroke={3.5} color={r.goalColor} label={t.common.sdgEv} />
            <ScoreDial value={r.timingScore} size={48} stroke={3.5} color="#FFB224" label={t.common.timing} />
            <ScoreDial value={r.marketSignalScore} size={48} stroke={3.5} color="#5FA8D3" label={t.common.market} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="border border-[color:var(--line)] px-2.5 py-2">
            <div className="label text-[6.5px]">{t.common.stage}</div>
            <div className="mt-1"><StageBadge stage={r.executionStage} /></div>
          </div>
          <div className="border border-[color:var(--line)] px-2.5 py-2">
            <div className="label text-[6.5px]">{t.common.window2030}</div>
            <div className="mt-1"><TimingBadge t={r.timingClass} win={t.timingWindows[r.timingClass]} /></div>
          </div>
          <div className="border border-[color:var(--line)] px-2.5 py-2">
            <div className="label flex items-center gap-1 text-[6.5px]"><CalendarClock size={9} /> {t.picker.expectedCompletion}</div>
            <div className="mt-1 font-data text-[12.5px] font-semibold">
              {r.expectedCompletion ? fmtMonth(r.expectedCompletion) : r.targetYear ?? t.common.undated}
            </div>
          </div>
          <div className="border border-[color:var(--line)] px-2.5 py-2">
            <div className="label text-[6.5px]">{t.picker.runway}</div>
            <div className={`mt-1 font-data text-[12.5px] font-semibold ${runway !== null && runway >= 18 ? "text-[color:var(--green)]" : runway !== null && runway >= 0 ? "text-[#FFB224]" : ""}`}>
              {runway === null ? "—" : runway > 0 ? `~${runway} ${t.common.monthsShort}` : t.picker.pastDue}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="label text-[6.5px]">{t.picker.recentEvent}</div>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[color:var(--ink-dim)]">{r.eventTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.investmentIdr && (
              <span className="flex items-center gap-1 font-data text-[10px] text-[color:var(--green)]">
                <CircleDollarSign size={10} /> {fmtIdr(r.investmentIdr)}
              </span>
            )}
            {r.volumeRatio && r.volumeRatio >= 1.5 && (
              <span className="font-data text-[10px] text-[#5FA8D3]">vol {r.volumeRatio}×</span>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-1 border-t border-[color:var(--line)] pt-3">
          {r.whyFlagged.slice(0, 2).map((w, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-[color:var(--muted)]">
              <Check size={10} className="mt-0.5 shrink-0 text-[color:var(--green)]" strokeWidth={2.4} />
              <span className="line-clamp-1">{w}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto flex gap-2 pt-4">
          <Link
            href={hrefLang(locale, `/signals/${r.id}`)}
            className="flex flex-1 items-center justify-center gap-1.5 border border-[color:var(--accent)] py-2.5 font-data text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--accent)] transition-colors hover:bg-[color:var(--accent)] hover:text-[#17110a]"
          >
            {t.picker.viewEvidence} <ArrowUpRight size={11} />
          </Link>
          <Link
            href={hrefLang(locale, `/signals/${r.id}`) + "#brief"}
            className="flex flex-1 items-center justify-center gap-1.5 border border-[color:var(--line-strong)] py-2.5 font-data text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--ink-dim)] transition-colors hover:border-[color:var(--ink)] hover:text-[color:var(--ink)]"
          >
            {t.picker.researchBrief}
          </Link>
        </div>
      </div>
    </div>
  );
}

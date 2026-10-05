import Link from "next/link";
import { ArrowUpRight, CalendarClock, Check } from "lucide-react";
import { ScoreDial, StageBadge, TimingBadge, GoalChip } from "./ui";
import { fmtIdr, fmtMonth } from "@/lib/system";
import type { SignalRow } from "@/db/queries";
import type { Dict, Locale } from "@/i18n/dict";
import { hrefLang } from "@/i18n/link";

export default function SignalCard({ sig, rank, t, locale }: { sig: SignalRow; rank?: number; t: Dict; locale: Locale }) {
  return (
    <Link
      href={hrefLang(locale, `/signals/${sig.id}`)}
      className="panel panel-hover group relative block overflow-hidden"
    >
      {/* goal accent spine */}
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: sig.goalColor }} />

      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <GoalChip n={sig.goalNumber} color={sig.goalColor} target={sig.targetCode} />
              <span className="font-data text-[14px] font-semibold tracking-wide text-[color:var(--ink)]">
                {sig.ticker}
              </span>
              <span className="label text-[8.5px]">{sig.sector}</span>
            </div>
            <p className="mt-1.5 truncate text-[12px] text-[color:var(--ink-dim)]">{sig.companyName}</p>
          </div>
          {rank !== undefined && (
            <span className="font-data text-[28px] font-semibold leading-none text-[rgba(232,236,241,0.14)]">
              {String(rank).padStart(2, "0")}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between gap-3 border-t border-[color:var(--line)] pt-3">
          <div>
            <div className="label text-[8px]">{t.common.signalStrength}</div>
            <div className="mt-0.5 font-data text-[30px] font-semibold leading-none text-[color:var(--accent)]">
              {sig.signalStrength}
            </div>
          </div>
          <div className="flex gap-4">
            <ScoreDial value={sig.sdgEvidenceScore} size={46} stroke={3.5} color={sig.goalColor} label={t.common.sdgEv} />
            <ScoreDial value={sig.timingScore} size={46} stroke={3.5} color="#FFB224" label={t.common.timing} />
            <ScoreDial value={sig.marketSignalScore} size={46} stroke={3.5} color="#5FA8D3" label={t.common.market} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="chip chip-solid !text-[9px]">{sig.signalType}</span>
          <StageBadge stage={sig.executionStage} />
          <TimingBadge t={sig.timingClass} win={t.timingWindows[sig.timingClass]} />
        </div>

        <div className="mt-3 space-y-1">
          {sig.whyFlagged.slice(0, 3).map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-[color:var(--ink-dim)]">
              <Check size={11} className="mt-0.5 shrink-0 text-[color:var(--green)]" strokeWidth={2.4} />
              <span className="line-clamp-1">{w}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3">
          <div className="flex items-center gap-3 font-data text-[10px] text-[color:var(--muted)]">
            <span className="flex items-center gap-1.5">
              <CalendarClock size={11} className="text-[color:var(--accent)]" />
              {sig.expectedCompletion
                ? `${t.common.completion} ${fmtMonth(sig.expectedCompletion)}`
                : sig.targetYear
                  ? `${t.common.target} ${sig.targetYear}`
                  : t.common.timelineUndated}
            </span>
            {sig.investmentIdr && <span>{fmtIdr(sig.investmentIdr)}</span>}
          </div>
          <span className="flex items-center gap-1 font-data text-[10px] uppercase tracking-[0.14em] text-[color:var(--accent)] opacity-0 transition-opacity group-hover:opacity-100">
            {t.common.evidence} <ArrowUpRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}

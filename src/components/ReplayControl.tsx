"use client";

import { useState } from "react";
import { History, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { StageBadge } from "./ui";
import Sparkline from "./Sparkline";
import { fmtDate, fmtPrice } from "@/lib/system";

export interface Snapshot {
  label: string;
  snapshotDate: string;
  signalStrength: number;
  timingScore: number;
  stage: string;
  close: number;
  volumeRatio: number;
  note: string;
}

export default function ReplayControl({
  snapshots,
  t = {
    title: "Historical Replay",
    sub: "point-in-time scoring",
    strength: "Signal strength",
    timing: "Timing",
    close: "Close",
    volume: "Volume vs 20D avg",
    trajectory: "Strength trajectory",
    integrityNote:
      "Replay uses only evidence available at each date — no future information leaks into historical scoring",
    prev: "Previous snapshot",
    next: "Next snapshot",
  },
}: {
  snapshots: Snapshot[];
  t?: import("@/i18n/dict").Dict["replay"];
}) {
  const [idx, setIdx] = useState(snapshots.length - 1);
  const snap = snapshots[idx];

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <History size={14} className="text-[color:var(--accent)]" />
          <span className="text-[13px] font-semibold tracking-tight">{t.title}</span>
          <span className="label text-[8px]">{t.sub}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIdx((v) => Math.max(0, v - 1))}
            className="border border-[color:var(--line)] p-1.5 text-[color:var(--muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:opacity-30"
            disabled={idx === 0}
            aria-label={t.prev}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setIdx((v) => Math.min(snapshots.length - 1, v + 1))}
            className="border border-[color:var(--line)] p-1.5 text-[color:var(--muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:opacity-30"
            disabled={idx === snapshots.length - 1}
            aria-label={t.next}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* timeline buttons */}
      <div className="grid grid-cols-6 border-b border-[color:var(--line)]">
        {snapshots.map((sn, i) => (
          <button
            key={sn.label}
            onClick={() => setIdx(i)}
            className={`relative border-r border-[color:var(--line)] px-2 py-3 text-center last:border-r-0 transition-colors ${
              i === idx ? "bg-[rgba(255,178,36,0.07)]" : "hover:bg-[rgba(232,236,241,0.02)]"
            }`}
          >
            {i === idx && <span className="absolute inset-x-0 top-0 h-[2px] bg-[color:var(--accent)]" />}
            <span className={`font-data block text-[11px] font-semibold ${i === idx ? "text-[color:var(--accent)]" : "text-[color:var(--ink-dim)]"}`}>
              {sn.label}
            </span>
            <span className="label mt-1 block text-[7px]">{fmtDate(sn.snapshotDate)}</span>
          </button>
        ))}
      </div>

      {/* selected snapshot */}
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-end gap-5">
            <div>
              <div className="label text-[8px]">{t.strength}</div>
              <div className={`font-data text-[38px] font-semibold leading-none ${snap.signalStrength === 0 ? "text-[color:var(--muted)]" : "text-[color:var(--accent)]"}`}>
                {snap.signalStrength === 0 ? "—" : snap.signalStrength}
              </div>
            </div>
            <div>
              <div className="label text-[8px]">{t.timing}</div>
              <div className="font-data text-[38px] font-semibold leading-none text-[color:var(--ink)]">
                {snap.timingScore === 0 ? "—" : snap.timingScore}
              </div>
            </div>
            <div className="pb-1">
              <StageBadge stage={snap.stage} />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="border border-[color:var(--line)] px-3 py-2">
              <div className="label text-[7.5px]">{t.close}</div>
              <div className="font-data text-[13px] text-[color:var(--ink)]">Rp {fmtPrice(snap.close)}</div>
            </div>
            <div className="border border-[color:var(--line)] px-3 py-2">
              <div className="label text-[7.5px]">{t.volume}</div>
              <div className="font-data text-[13px] text-[color:var(--ink)]">{snap.volumeRatio}×</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3">
          <div>
            <div className="label text-[8px]">{t.trajectory}</div>
            <div className="mt-1.5 border border-[color:var(--line)] p-2">
              <Sparkline
                data={snapshots.slice(0, idx + 1).map((x) => x.signalStrength)}
                width={300}
                height={52}
                color="#FFB224"
              />
            </div>
          </div>
          <p className="border-l-2 border-[color:var(--accent)] pl-3 text-[12px] leading-relaxed text-[color:var(--ink-dim)]">
            {snap.note}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[color:var(--line)] px-4 py-2.5">
        <ShieldCheck size={12} className="text-[color:var(--green)]" />
        <span className="label text-[8px]">{t.integrityNote}</span>
      </div>
    </div>
  );
}

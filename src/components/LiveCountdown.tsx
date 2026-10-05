"use client";

import { useEffect, useState } from "react";
import { DAYS_TO_2030 } from "@/lib/system";

/** Cosmetic live tick, anchored to the product system date (28 Sep 2026). */
export default function LiveCountdown({
  labels = { days: "days", hrs: "hrs", min: "min", sec: "sec" },
}: {
  labels?: { days: string; hrs: string; min: string; sec: string };
}) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const total = DAYS_TO_2030 * 86400 - sec;
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-stretch gap-px bg-[color:var(--line)]">
      {[
        { v: days.toLocaleString("en-US"), l: labels.days },
        { v: pad(h), l: labels.hrs },
        { v: pad(m), l: labels.min },
        { v: pad(s), l: labels.sec },
      ].map((x, i) => (
        <div key={i} className="flex-1 bg-[#0c0f12] px-4 py-5 text-center md:px-6 md:py-7">
          <div className="font-data text-3xl font-semibold tracking-tight text-[color:var(--ink)] md:text-[44px]">
            <span className={i === 0 ? "text-[color:var(--accent)]" : ""}>{x.v}</span>
          </div>
          <div className="label mt-2 text-[9px]">{x.l}</div>
        </div>
      ))}
    </div>
  );
}

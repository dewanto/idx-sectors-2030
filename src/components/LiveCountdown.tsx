"use client";

import { useEffect, useState } from "react";
import { DEADLINE_2030 } from "@/lib/system";

/** Live tick — recomputed from the real clock against the 2030 deadline. */
export default function LiveCountdown({
  labels = { days: "days", hrs: "hrs", min: "min", sec: "sec" },
}: {
  labels?: { days: string; hrs: string; min: string; sec: string };
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const total = Math.max(0, Math.floor((DEADLINE_2030.getTime() - Date.now()) / 1000));
  const days = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
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
            <span suppressHydrationWarning className={i === 0 ? "text-[color:var(--accent)]" : ""}>
              {x.v}
            </span>
          </div>
          <div className="label mt-2 text-[9px]">{x.l}</div>
        </div>
      ))}
    </div>
  );
}

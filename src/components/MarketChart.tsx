"use client";

import { useMemo, useRef, useState } from "react";
import { fmtVol, fmtPrice } from "@/lib/system";

export interface PricePoint {
  date: string;
  close: number;
  volume: number;
}

export default function MarketChart({
  prices,
  events = [],
  height = 320,
}: {
  prices: PricePoint[];
  events?: { date: string; label: string; color?: string }[];
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = height;
  const padL = 8;
  const padR = 8;
  const priceH = Math.round(H * 0.68);
  const volTop = priceH + 14;
  const volH = H - volTop - 18;

  const model = useMemo(() => {
    const closes = prices.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const vMax = Math.max(...prices.map((p) => p.volume)) || 1;
    const stepX = (W - padL - padR) / (prices.length - 1);
    const xs = prices.map((_, i) => padL + i * stepX);
    const ys = closes.map((c) => 8 + (1 - (c - min) / span) * (priceH - 24));
    const path = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    const area = `${path} L${xs[xs.length - 1].toFixed(1)},${priceH} L${padL},${priceH} Z`;
    const vBars = prices.map((p, i) => {
      const h = Math.max(1.5, (p.volume / vMax) * volH);
      return { x: xs[i], y: volTop + volH - h, h };
    });
    return { min, max, xs, ys, path, area, vBars, stepX };
  }, [prices, priceH, volH, volTop]);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round((x - padL) / model.stepX);
    setHover(Math.max(0, Math.min(prices.length - 1, i)));
  };

  const hp = hover !== null ? prices[hover] : null;

  /* month ticks */
  const monthTicks: { x: number; label: string }[] = [];
  let lastMonth = "";
  prices.forEach((p, i) => {
    const m = p.date.slice(0, 7);
    if (m !== lastMonth) {
      lastMonth = m;
      monthTicks.push({
        x: model.xs[i],
        label: new Date(p.date + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
      });
    }
  });

  return (
    <div className="relative w-full" ref={ref}>
      {/* hover readout */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex gap-4 p-2">
        {hp ? (
          <>
            <span className="font-data text-[11px] text-[color:var(--muted)]">{hp.date}</span>
            <span className="font-data text-[11px] text-[color:var(--ink)]">Rp {fmtPrice(hp.close)}</span>
            <span className="font-data text-[11px] text-[color:var(--accent)]">Vol {fmtVol(hp.volume)}</span>
          </>
        ) : (
          <span className="font-data text-[11px] text-[color:var(--muted)]">
            {prices[0]?.date} → {prices[prices.length - 1]?.date} · daily close + volume
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-8 w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        preserveAspectRatio="none"
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={priceH * f} y2={priceH * f} stroke="rgba(232,236,241,0.06)" strokeWidth="1" />
        ))}
        {monthTicks.map((t, i) => (
          <g key={i}>
            <line x1={t.x} x2={t.x} y1={0} y2={H - 16} stroke="rgba(232,236,241,0.05)" strokeWidth="1" />
            <text x={t.x + 3} y={H - 4} fontSize="9" fill="rgba(124,134,152,0.9)" fontFamily="var(--font-mono), monospace">
              {t.label}
            </text>
          </g>
        ))}
        {/* event markers */}
        {events.map((ev, i) => {
          const idx = prices.findIndex((p) => p.date >= ev.date);
          if (idx === -1) return null;
          const x = model.xs[idx];
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={0} y2={priceH} stroke={ev.color ?? "#FFB224"} strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x} cy={model.ys[idx]} r="3" fill={ev.color ?? "#FFB224"} />
              <text
                x={Math.min(W - 130, x + 5)}
                y={12 + (i % 3) * 11}
                fontSize="8.5"
                fill={ev.color ?? "#FFB224"}
                fontFamily="var(--font-mono), monospace"
              >
                {ev.label}
              </text>
            </g>
          );
        })}
        {/* area + line */}
        <path d={model.area} fill="#FFB224" opacity={0.06} />
        <path d={model.path} fill="none" stroke="#FFB224" strokeWidth="1.6" strokeLinejoin="round" />
        {/* volume */}
        {model.vBars.map((b, i) => (
          <rect
            key={i}
            x={b.x - Math.max(1, model.stepX * 0.32)}
            y={b.y}
            width={Math.max(1.4, model.stepX * 0.64)}
            height={b.h}
            fill={hover === i ? "#FFB224" : "rgba(232,236,241,0.18)"}
          />
        ))}
        {/* crosshair */}
        {hover !== null && hp && (
          <g>
            <line x1={model.xs[hover]} x2={model.xs[hover]} y1={0} y2={H - 16} stroke="rgba(255,178,36,0.5)" strokeWidth="1" />
            <circle cx={model.xs[hover]} cy={model.ys[hover]} r="3.4" fill="#FFB224" stroke="#0A0C0E" strokeWidth="1.4" />
          </g>
        )}
      </svg>
    </div>
  );
}

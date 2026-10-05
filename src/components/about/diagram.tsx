import { Fragment } from "react";

/**
 * Institutional flow diagrams for the About page.
 * Vertical + stacked by construction, so the chain stays readable on mobile.
 * `join` picks the connector glyph: ↓ (sequence) or + (sum of evidence).
 * The last step is the outcome and is emphasized with the accent treatment.
 */
export function FlowDiagram({
  steps,
  join = "↓",
  compact = false,
}: {
  steps: string[];
  join?: "↓" | "+";
  compact?: boolean;
}) {
  const last = steps.length - 1;
  return (
    <div className="flex flex-col items-stretch">
      {steps.map((step, i) => (
        <Fragment key={`${i}-${step}`}>
          {i > 0 && (
            <div className="flex justify-center py-1" aria-hidden="true">
              <span className="font-data text-[12px] leading-none text-[color:var(--accent)]">
                {join}
              </span>
            </div>
          )}
          <div
            className={`panel flex items-center justify-center text-center ${
              compact ? "px-3 py-2" : "px-4 py-3"
            } ${
              i === last
                ? "!border-[color:var(--accent)] bg-[rgba(255,178,36,0.06)]"
                : ""
            }`}
          >
            <span
              className={`font-data uppercase tracking-[0.14em] ${
                i === last
                  ? "text-[12px] font-semibold text-[color:var(--accent)]"
                  : "text-[10.5px] text-[color:var(--ink-dim)]"
              }`}
            >
              {step}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

/** Deliberate inequality block: SDG ALIGNMENT ≠ EXECUTION. */
export function NeqBlock({ left, right, neq }: { left: string; right: string; neq: string }) {
  return (
    <div className="flex items-center justify-center gap-4 md:gap-6">
      <span className="panel px-4 py-2.5 font-data text-[11px] uppercase tracking-[0.14em] text-[color:var(--muted)] md:px-6 md:py-3 md:text-[13px]">
        {left}
      </span>
      <span
        aria-label={neq}
        className="font-data text-[20px] font-semibold leading-none text-[#F25C5C] md:text-[24px]"
      >
        {neq}
      </span>
      <span className="panel px-4 py-2.5 font-data text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink)] md:px-6 md:py-3 md:text-[13px]">
        {right}
      </span>
    </div>
  );
}

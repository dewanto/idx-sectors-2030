import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { GannTickerRow } from "@/db/queries";
import { GoalChip, ScoreDial } from "@/components/ui";
import { fmtPrice } from "@/lib/system";
import type { Locale } from "@/i18n/dict";

/**
 * Per-ticker confirmation layer.
 *
 * The Gann window itself is market-wide — every row shares the same timing
 * overlay. What differs per ticker is whether the *confirmations* the framework
 * demands are present: Fib position, RSI/divergence, volume participation,
 * foreign flow, and SDG sector exposure. `confluence.score` is the sum of
 * those independent legs so the UI can show which one is missing.
 *
 * Deliberately NOT a recommendation: no rank is labelled buy/sell, matching the
 * framework's own instruction to use time analysis as confirmation only.
 */

export type MatrixLabels = {
  matrixTitle: string;
  matrixSub: string;
  colTicker: string;
  colPrice: string;
  colChg20: string;
  colVol: string;
  colRsi: string;
  colDiv: string;
  colFlow: string;
  colFib: string;
  colSdg: string;
  colConf: string;
  divBullish: string;
  divBearish: string;
  divNone: string;
  flowNone: string;
  flowNote: string;
  empty: string;
};

const FACTOR_TONE: Record<string, string> = {
  window: "#5FA8D3",
  fib: "#00B3A4",
  rsi: "#FFB224",
  divergence: "#F25C5C",
  volume: "#8A94A6",
  flow: "#39C06A",
};

function flowLabel(idr: number | null, t: MatrixLabels): { text: string; color: string } {
  if (idr === null) return { text: t.flowNone, color: "var(--muted)" };
  if (idr === 0) return { text: "0", color: "var(--muted)" };
  const bn = idr / 1e9;
  return {
    text: `${bn > 0 ? "+" : ""}${bn.toFixed(1)}B`,
    color: bn > 0 ? "var(--green)" : "var(--red)",
  };
}

export default function GannMatrix({
  rows,
  locale,
  t,
}: {
  rows: GannTickerRow[];
  locale: Locale;
  t: MatrixLabels;
}) {
  if (rows.length === 0) {
    return (
      <p className="border border-dashed border-[color:var(--line)] px-3 py-6 text-center font-data text-[10px] text-[color:var(--muted)]">
        {t.empty}
      </p>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[color:var(--line-strong)]">
            <th className="label px-3 py-3 text-left text-[7.5px]">{t.colTicker}</th>
            <th className="label px-3 py-3 text-right text-[7.5px]">{t.colPrice}</th>
            <th className="label px-3 py-3 text-right text-[7.5px]">{t.colChg20}</th>
            <th className="label px-3 py-3 text-right text-[7.5px]">{t.colVol}</th>
            <th className="label px-3 py-3 text-right text-[7.5px]">{t.colRsi}</th>
            <th className="label px-3 py-3 text-center text-[7.5px]">{t.colDiv}</th>
            <th className="label px-3 py-3 text-right text-[7.5px]">{t.colFlow}</th>
            <th className="label px-3 py-3 text-right text-[7.5px]">{t.colFib}</th>
            <th className="label px-3 py-3 text-left text-[7.5px]">{t.colSdg}</th>
            <th className="label px-3 py-3 text-center text-[7.5px]">{t.colConf}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const flow = flowLabel(r.netForeignFlowIdr, t);
            const divColor =
              r.divergence === "BULLISH" ? "var(--green)" : r.divergence === "BEARISH" ? "var(--red)" : "var(--muted)";
            const divText =
              r.divergence === "BULLISH" ? t.divBullish : r.divergence === "BEARISH" ? t.divBearish : t.divNone;
            const rsiColor =
              r.rsi === null ? "var(--muted)" : r.rsi <= 35 ? "var(--green)" : r.rsi >= 65 ? "var(--red)" : "var(--ink-dim)";
            return (
              <tr key={r.ticker} className="border-b border-[color:var(--line)] last:border-b-0 hover:bg-[rgba(255,178,36,0.03)]">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/${locale}/companies/${r.ticker}`}
                    className="group inline-flex items-center gap-1.5"
                  >
                    <span className="font-data text-[12px] font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--accent)]">
                      {r.ticker}
                    </span>
                    <ArrowUpRight size={9} className="text-[color:var(--muted)] opacity-0 group-hover:opacity-100" />
                  </Link>
                  <div className="label mt-0.5 line-clamp-1 text-[7px]">{r.sector}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-data text-[11.5px] text-[color:var(--ink)]">{fmtPrice(r.close)}</td>
                <td
                  className="px-3 py-2.5 text-right font-data text-[11px]"
                  style={{ color: r.pc20 >= 0 ? "var(--green)" : "var(--red)" }}
                >
                  {r.pc20 >= 0 ? "+" : ""}
                  {r.pc20.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5 text-right font-data text-[11px] text-[color:var(--ink-dim)]">
                  {r.volumeRatio.toFixed(2)}×
                </td>
                <td className="px-3 py-2.5 text-right font-data text-[11px]" style={{ color: rsiColor }}>
                  {r.rsi === null ? "—" : r.rsi.toFixed(0)}
                </td>
                <td className="px-3 py-2.5 text-center font-data text-[9px]" style={{ color: divColor }}>
                  {divText}
                </td>
                <td className="px-3 py-2.5 text-right font-data text-[11px]" style={{ color: flow.color }}>
                  {flow.text}
                </td>
                <td className="px-3 py-2.5 text-right font-data text-[11px] text-[color:var(--ink-dim)]">
                  {r.fibDistancePct > 0 ? "+" : ""}
                  {r.fibDistancePct.toFixed(1)}%
                </td>
                <td className="px-3 py-2.5">
                  {r.goalNumber !== null ? (
                    <GoalChip n={r.goalNumber} color={r.goalColor ?? "#8A94A6"} />
                  ) : (
                    <span className="font-data text-[9px] text-[color:var(--muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-2">
                    <ScoreDial value={r.confluence.score} size={34} stroke={3} />
                    <div className="hidden min-w-[104px] space-y-[3px] lg:block">
                      {r.confluence.factors.map((f) => (
                        <div key={f.key} className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-1 w-1 shrink-0 rounded-full"
                            style={{ background: f.met ? FACTOR_TONE[f.key] : "rgba(232,236,241,0.16)" }}
                            title={f.detail}
                          />
                          <span className="label truncate text-[6.5px]">{f.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="label border-t border-[color:var(--line)] px-3 py-2.5 text-[7px]">{t.flowNote}</p>
    </div>
  );
}
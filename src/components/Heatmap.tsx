import { tpl, type Dict } from "@/i18n/dict";

interface Cell {
  sector: string;
  goal: number;
  color: string;
  count: number;
  strong: number;
}

export default function Heatmap({
  cells,
  sectors,
  goals,
  t,
}: {
  cells: Cell[];
  sectors: string[];
  goals: { n: number; color: string }[];
  t: Dict["heat"];
}) {
  const lookup = new Map(cells.map((c) => [`${c.sector}|${c.goal}`, c]));
  const max = Math.max(1, ...cells.map((c) => c.count));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: goals.length * 44 + 180 }}>
        <thead>
          <tr>
            <th className="label pb-3 pr-4 text-left text-[8.5px]">{t.corner}</th>
            {goals.map((g) => (
              <th key={g.n} className="pb-3" style={{ width: 44 }}>
                <span
                  className="mx-auto flex h-7 w-7 items-center justify-center font-data text-[11px] font-semibold"
                  style={{ background: `${g.color}26`, color: g.color, border: `1px solid ${g.color}44` }}
                >
                  {g.n}
                </span>
              </th>
            ))}
            <th className="label pb-3 text-right text-[8.5px]">{t.total}</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((sec) => {
            const rowCells = goals.map((g) => lookup.get(`${sec}|${g.n}`));
            const total = rowCells.reduce((a, b) => a + (b?.count ?? 0), 0);
            return (
              <tr key={sec} className="group">
                <td className="pr-4 py-1.5">
                  <span className="text-[11.5px] text-[color:var(--ink-dim)]">{sec}</span>
                </td>
                {rowCells.map((c, i) => (
                  <td key={i} className="p-[3px]">
                    <div
                      className="relative flex h-9 items-center justify-center border transition-transform group-hover:border-transparent"
                      style={{
                        borderColor: "rgba(232,236,241,0.05)",
                        background: c && c.count ? `${c.color}${Math.round(12 + (c.count / max) * 78).toString(16).padStart(2, "0")}` : "rgba(232,236,241,0.015)",
                      }}
                      title={
                        c && c.count
                          ? tpl(t.tipHasTpl, { sector: sec, goal: c.goal, count: c.count, strong: c.strong })
                          : tpl(t.tipNoneTpl, { sector: sec, goal: goals[i].n })
                      }
                    >
                      {c && c.count > 0 && (
                        <>
                          <span className="font-data text-[11px] font-semibold" style={{ color: c.color === "#FCC30B" || c.color === "#FD9D24" || c.color === "#26BDE2" || c.color === "#56C02B" ? "#0A0C0E" : "#E8ECF1" }}>
                            {c.count}
                          </span>
                          {c.strong > 0 && <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-white/80" />}
                        </>
                      )}
                    </div>
                  </td>
                ))}
                <td className="pl-3 text-right">
                  <span className="font-data text-[12px] text-[color:var(--ink)]">{total}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="label text-[8.5px]">{t.intensity}</span>
        <span className="label flex items-center gap-1.5 text-[8.5px]">
          <span className="inline-block h-1 w-1 rounded-full bg-white/80" /> {t.strongNote}
        </span>
      </div>
    </div>
  );
}

/**
 * Sectors API smoke test — ±2 credits.
 *
 * Verifies live endpoint shapes against the expectations encoded in
 * src/lib/sectors.ts, comparing with the MCP verification of 2026-10-03.
 * Run: npm run db:smoke
 */
import "dotenv/config";
import { fetchCompanies, fetchDailyPrice, stripJk, sectorsBaseUrl } from "@/lib/sectors";

let failures = 0;
const check = (name: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

async function main() {
  console.log(`Base URL: ${sectorsBaseUrl()}`);

  /* 1 — daily price series (1 credit) */
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const series = await fetchDailyPrice("BBCA", start, end);
  check("daily series non-empty", series.length > 0, `${series.length} rows`);
  const row = series[series.length - 1];
  check("symbol has .JK suffix", row?.symbol === "BBCA.JK", row?.symbol);
  check("date format YYYY-MM-DD", !!row && /^\d{4}-\d{2}-\d{2}$/.test(row.date), row?.date);
  check("close is a positive number", !!row && row.close > 0, String(row?.close));
  check("volume is a positive number", !!row && row.volume > 0, String(row?.volume));
  check("market_cap is full IDR (> 1e12)", !!row && row.market_cap > 1e12, String(row?.market_cap));
  check(
    "stripJk() matches DB ticker convention",
    stripJk(row?.symbol ?? "") === "BBCA",
    stripJk(row?.symbol ?? ""),
  );

  /* 2 — company screener (1 credit) */
  const screen = await fetchCompanies({
    where: "sub_sector='banks'",
    orderBy: "-market_cap",
    limit: 3,
  });
  check("screener returns results array", Array.isArray(screen.results), `${screen.results.length} rows`);
  check("screener carries pagination envelope", typeof screen.pagination?.total_count === "number", `total=${screen.pagination?.total_count}`);
  check("screener rows have symbol+company_name", screen.results.every((r) => typeof r.symbol === "string" && typeof r.company_name === "string"), "ok");

  console.log(failures === 0 ? "\nSmoke test PASSED ✔" : `\nSmoke test FAILED (${failures} check(s) ✘)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test errored:", err instanceof Error ? err.message : err);
  process.exit(1);
});

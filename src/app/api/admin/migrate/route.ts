/**
 * TEMPORARY one-click migration endpoint (local dev only).
 *
 *   GET /api/admin/migrate?token=<MIGRATE_TOKEN>
 *
 * Runs the exact same guarded, idempotent migration as
 * `npm run db:migrate:supabase` (local Postgres → Supabase) inside the dev
 * server — useful when running the CLI is inconvenient. The long-running
 * work happens server-side, so keep the tab open until JSON appears.
 *
 * Protected by the MIGRATE_TOKEN env var. DELETE this route and the token
 * from .env once the migration has succeeded and been verified.
 */
import { runMigration } from "@/db/migrate-to-supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = process.env.MIGRATE_TOKEN;
  const provided = new URL(req.url).searchParams.get("token");
  if (!token || !provided || provided !== token) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await runMigration((m) => console.log(`[migrate] ${m}`));
    console.log(
      `[migrate] done — companies ${report.companyCount}, mismatches ${report.mismatches}`,
    );
    return Response.json({
      ok: report.mismatches === 0,
      source: report.sourceLabel,
      target: report.targetLabel,
      companies: report.companyCount,
      mismatches: report.mismatches,
      tables: report.rows,
    });
  } catch (err) {
    console.error("[migrate] failed:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * TEMPORARY one-click seed endpoint (diagnostic + repair).
 *
 *   GET /api/admin/seed?token=<MIGRATE_TOKEN>[&force=1]
 *
 * Seeds the deterministic demo dataset (src/db/seed.ts) into the database
 * that DATABASE_URL currently points to — useful when the app was pointed at
 * a freshly migrated (empty) database such as Supabase.
 *
 * The response always includes diagnostics: masked DATABASE_URL host, a live
 * `select 1` probe, and per-table row counts — so a connection failure or a
 * missing schema surfaces with the REAL underlying error message.
 *
 * Guard: the seed TRUNCATES the demo tables first, so it refuses to run when
 * `companies` already has rows unless `force=1` is appended.
 * DELETE this route once the database has been populated and verified.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { runSeed } from "@/db/seed";

export const dynamic = "force-dynamic";

function mask(url: string | undefined): string {
  if (!url) return "(unset)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? `${u.username}:***@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

async function rowCounts(): Promise<Record<string, number>> {
  const [companies] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.companies);
  const [signals] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.signals);
  const [events] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.businessEvents);
  const [prices] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.marketPrices);
  return { companies: companies.n, signals: signals.n, events: events.n, prices: prices.n };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = process.env.MIGRATE_TOKEN;
  const provided = url.searchParams.get("token");
  const force = url.searchParams.get("force") === "1";
  if (!token || !provided || provided !== token) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const diagnostics: Record<string, unknown> = {
    databaseUrl: mask(process.env.DATABASE_URL),
  };

  try {
    await db.execute(sql`select 1`);
    diagnostics.select1 = "ok";
  } catch (err) {
    diagnostics.select1 = "failed";
    diagnostics.error = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, stage: "connect", ...diagnostics },
      { status: 500 },
    );
  }

  try {
    diagnostics.countsBefore = await rowCounts();
  } catch (err) {
    diagnostics.countsBefore = null;
    diagnostics.countsError = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        ok: false,
        stage: "schema",
        message:
          "Connected, but app tables are missing — run `npm run db:push` against this DATABASE_URL first.",
        ...diagnostics,
      },
      { status: 500 },
    );
  }

  const before = diagnostics.countsBefore as Record<string, number>;
  if (before.companies > 0 && !force) {
    return Response.json({
      ok: false,
      stage: "guard",
      message:
        "Database already contains data — seed refused (it TRUNCATES the demo tables). Append &force=1 to reseed anyway.",
      ...diagnostics,
    });
  }

  try {
    const seeded = await runSeed();
    const countsAfter = await rowCounts();
    console.log(`[seed] done — companies ${seeded.companies}, signals ${seeded.signals}`);
    return Response.json({ ok: true, seeded, ...diagnostics, countsAfter });
  } catch (err) {
    console.error("[seed] failed:", err);
    return Response.json(
      {
        ok: false,
        stage: "seed",
        error: err instanceof Error ? err.message : String(err),
        ...diagnostics,
      },
      { status: 500 },
    );
  }
}

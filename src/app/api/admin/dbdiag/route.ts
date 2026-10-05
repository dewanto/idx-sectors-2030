/**
 * TEMPORARY read-only database diagnostic endpoint.
 *
 *   GET /api/admin/dbdiag?token=<MIGRATE_TOKEN>
 *
 * Reports, with credentials masked:
 *   - the DATABASE_URL the runtime ACTUALLY uses (process.env)
 *   - every DATABASE_URL line found in the .env file (exposes duplicates and
 *     env-injection: when process.env differs from the file)
 *   - a live `select 1` probe with the REAL underlying Postgres/driver error
 *   - row counts of the core tables when connected
 *
 * Changes nothing. DELETE this route once the database issue is resolved.
 */
import { readFileSync } from "node:fs";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

export const dynamic = "force-dynamic";

function mask(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? `${u.username}:***@` : ""}${u.host}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function describe(url: string | undefined): Record<string, unknown> {
  if (!url) return { set: false };
  try {
    const u = new URL(url);
    return {
      set: true,
      masked: mask(url),
      host: u.hostname,
      port: u.port || "(default)",
      username: u.username || "(none)",
      sslmode: u.searchParams.get("sslmode") ?? "(not set)",
    };
  } catch {
    return { set: true, masked: "(unparseable)" };
  }
}

function envFileDatabaseUrls(): { line: number; url: string }[] {
  try {
    const lines = readFileSync(".env", "utf8").split(/\r?\n/);
    return lines
      .map((l, i) => ({ l: l.trim(), n: i + 1 }))
      .filter(({ l }) => l.startsWith("DATABASE_URL="))
      .map(({ l, n }) => ({ line: n, url: mask(l.slice("DATABASE_URL=".length)) }));
  } catch {
    return [];
  }
}

function errorFields(err: unknown): Record<string, unknown> {
  const e = err as { message?: string; code?: string; errno?: number; detail?: string; hint?: string; severity?: string };
  return {
    message: e?.message ?? String(err),
    code: e?.code ?? null,
    errno: e?.errno ?? null,
    severity: e?.severity ?? null,
    detail: e?.detail ?? null,
    hint: e?.hint ?? null,
  };
}

export async function GET(req: Request) {
  const token = process.env.MIGRATE_TOKEN;
  const provided = new URL(req.url).searchParams.get("token");
  if (!token || !provided || provided !== token) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const runtime = describe(process.env.DATABASE_URL);
  const fromFile = envFileDatabaseUrls();

  let probe: Record<string, unknown>;
  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    probe = { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    probe = { ok: false, ...errorFields(err) };
  }

  let tables: Record<string, unknown> | null = null;
  if (probe.ok) {
    try {
      const [companies] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.companies);
      const [signals] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.signals);
      const [prices] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.marketPrices);
      tables = { companies: companies.n, signals: signals.n, marketPrices: prices.n };
    } catch (err) {
      tables = { error: errorFields(err) };
    }
  }

  /* Deterministic advice for the two known failure shapes. */
  let advice: string | null = null;
  if (!probe.ok && runtime.port === "5432" && runtime.host !== "localhost" && runtime.host !== "127.0.0.1") {
    advice =
      "Direct port 5432 terdeteksi. Ganti DATABASE_URL ke pooler (host ...pooler.supabase.com, port 6543) — direct 5432 sering diblokir ISP dan butuh IPv4 add-on di project gratis. Pastikan password di-URL-encode.";
  } else if (!probe.ok) {
    advice = "Koneksi gagal — cek pesan error asli di atas (auth = 28P01, koneksi = ECONNREFUSED/ENOTFOUND/timeout).";
  } else if (tables && typeof tables.companies === "number" && tables.companies === 0) {
    advice = "Koneksi OK tapi database kosong — lanjut Tahap 3: migrasi data dari Postgres lokal.";
  }

  return Response.json({
    ok: true,
    runtimeDatabaseUrl: runtime,
    envFileDatabaseUrls: fromFile,
    probe,
    tables,
    advice,
  });
}

import { NextResponse } from "next/server";
import { runSync, SYNC_OK, SYNC_ABORTED } from "@/db/sync";

/* Vercel cron invocations can outlive the default function timeout on a full
   fundamentals refresh — request the maximum allowed on the current plan. */
export const maxDuration = 60;

/** Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.SYNC_CRON_SECRET ?? "";
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSync();
    const status = result.exitCode === SYNC_OK ? 200 : result.exitCode === SYNC_ABORTED ? 424 : 500;
    return NextResponse.json(result, { status });
  } catch (err) {
    console.error("[api/sync] sync failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "sync failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/* Vercel Cron Jobs trigger the path with GET; POST stays for manual triggers. */
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
import { NextResponse } from "next/server";
import { runSync, SYNC_OK, SYNC_FAILED, SYNC_ABORTED } from "@/db/sync";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.SYNC_CRON_SECRET ?? "";

  if (!secret || auth !== `Bearer ${secret}`) {
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

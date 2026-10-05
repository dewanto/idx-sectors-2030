import { NextRequest, NextResponse } from "next/server";
import { runPicker } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = q.get(k);
    return v ? Number(v) : undefined;
  };
  const csv = (k: string) => {
    const v = q.get(k);
    return v ? v.split(",").filter(Boolean) : undefined;
  };

  try {
    const data = await runPicker({
      goal: num("goal"),
      target: q.get("target") ?? undefined,
      stages: csv("stages"),
      timing: csv("timing"),
      sectors: csv("sectors"),
      minEvidence: num("minEvidence"),
      minTiming: num("minTiming"),
      minStrength: num("minStrength"),
      condition: q.get("condition") ?? undefined,
      minSignal: num("minSignal"),
      rightTime: q.get("rightTime") === "1",
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "picker_failed" }, { status: 500 });
  }
}

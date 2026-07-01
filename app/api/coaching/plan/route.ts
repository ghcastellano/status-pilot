import { NextRequest, NextResponse } from "next/server";
import { fetchPlan, savePlan } from "@/lib/coaching-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_FIELDS = ["coach", "main_gap", "hypothesis", "next_step", "ask", "review_at"] as const;

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  try {
    const plan = await fetchPlan(teamId);
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const teamId = typeof body?.teamId === "string" ? body.teamId : null;
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  // presence-aware: só escreve as chaves enviadas; strings saneadas
  const patch: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const v = body[f];
      patch[f] = typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : null;
    }
  }
  if ("coaching" in body) patch.coaching = !!body.coaching;
  try {
    const plan = await savePlan(teamId, patch);
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

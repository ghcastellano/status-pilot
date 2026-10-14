import { withWorkspaceAuth } from "@/lib/auth/route";
import { NextRequest, NextResponse } from "next/server";
import { fetchAssessment, saveAssessment } from "@/lib/coaching-db";
import { RUBRIC, signalDefs } from "@/lib/coaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_KEYS = new Set(signalDefs("scrum").map((s) => s.key));

export const GET = withWorkspaceAuth(async (req: NextRequest, user) => {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  try {
    const assessment = await fetchAssessment(teamId);
    return NextResponse.json({ assessment });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

export const POST = withWorkspaceAuth(async (req: NextRequest, user) => {
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
  // só keys e valores canônicos passam
  const signals: Record<string, string> = {};
  for (const [k, v] of Object.entries(body?.signals ?? {})) {
    if (VALID_KEYS.has(k) && typeof v === "string" && v in RUBRIC) signals[k] = v;
  }
  const note =
    typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
  const changedBy = user.email ?? user.id;
  try {
    const assessment = await saveAssessment(teamId, signals, note, changedBy);
    return NextResponse.json({ assessment });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

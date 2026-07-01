import { NextRequest, NextResponse } from "next/server";
import { fetchExperiments, saveExperiment, deleteExperiment } from "@/lib/coaching-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLARS = new Set(["flow", "quality", "ownership"]);
const STATUSES = new Set(["active", "done", "dropped"]);
const s = (v: unknown, max = 500) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  try {
    const experiments = await fetchExperiments(teamId);
    return NextResponse.json({ experiments });
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
  const behavior = s(body?.behavior);
  const pillar = typeof body?.pillar === "string" && PILLARS.has(body.pillar) ? body.pillar : null;
  if (!teamId || !behavior || !pillar) {
    return NextResponse.json(
      { error: "teamId, pillar e behavior são obrigatórios" },
      { status: 400 }
    );
  }
  const status = typeof body?.status === "string" && STATUSES.has(body.status) ? body.status : undefined;
  try {
    const experiment = await saveExperiment({
      id: typeof body?.id === "number" ? body.id : undefined,
      team_id: teamId,
      pillar,
      behavior,
      metric: s(body?.metric, 120),
      hypothesis: s(body?.hypothesis),
      outcome: s(body?.outcome),
      status,
    } as any);
    return NextResponse.json({ experiment });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  try {
    await deleteExperiment(id);
    return NextResponse.json({ removed: 1 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const teamId = p.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  try {
    const { team, sprints, issues, epics } = await fetchTeamData(teamId);
    if (!team) {
      return NextResponse.json({ error: "Time não encontrado" }, { status: 404 });
    }
    const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));
    const weeks = Math.min(26, Math.max(4, Number(p.get("weeks")) || 12));
    const metrics = computeTeamMetrics(team, sprints, issues, {
      epic: p.get("epic"),
      type: p.get("type"),
      weeks,
      epicNames,
    });
    return NextResponse.json(metrics);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

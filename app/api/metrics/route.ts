import { withWorkspaceAuth } from "@/lib/auth/route";
import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { resolveWindow } from "@/lib/window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withWorkspaceAuth(async (req: NextRequest, user) => {
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
    // MESMA janela da maturidade (/api/coaching/team) → KPIs e tier consistentes.
    const win = resolveWindow(team, sprints, { sprintIds: p.get("sprintIds"), weeks: p.get("weeks") });
    const metrics = computeTeamMetrics(team, sprints, issues, {
      epic: p.get("epic"),
      type: p.get("type"),
      weeks: win.cycleWeeks ?? 12,
      epicNames,
      sprintIds: win.sprintIds,
      cycleWeeks: win.cycleWeeks,
    });
    return NextResponse.json({
      ...metrics,
      window: {
        mode: team.board_type,
        sprintIds: win.sprintIds ?? [],
        cycleWeeks: win.cycleWeeks ?? null,
        label: win.label,
        labelEn: win.labelEn,
        availableSprints: win.availableSprints,
        activeSprintSelected: win.activeSprintSelected,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

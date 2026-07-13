import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { computeMaturity } from "@/lib/maturity";
import { fetchHistory, fetchPlan, fetchAssessment, fetchExperiments, fetchCommentsForTeam, fetchFieldHistory } from "@/lib/coaching-db";
import { classifyEngagement } from "@/lib/coaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detalhe do time em UMA request: maturidade + histórico + plano + sinais +
// experimentos + os dados dos charts de evidência.
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  try {
    const { team, sprints, issues, epics } = await fetchTeamData(teamId);
    if (!team) {
      return NextResponse.json({ error: "Time não encontrado" }, { status: 404 });
    }
    const [history, plan, assessment, experiments, comments, fieldHistory] = await Promise.all([
      fetchHistory(teamId),
      fetchPlan(teamId),
      fetchAssessment(teamId),
      fetchExperiments(teamId),
      fetchCommentsForTeam(teamId),
      fetchFieldHistory(teamId),
    ]);
    const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));

    // Janela de maturidade: Scrum = últimas 6 sprints (ou ?sprintIds=csv);
    // Kanban = rolling ?weeks= (4/8/12, default 8).
    const teamSprints = sprints
      .filter((s) => s.team_id === team.id)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    let sprintIds: string[] | undefined;
    let cycleWeeks: number | undefined;
    const availableSprints = teamSprints.map((s) => ({ id: s.id, name: s.name, state: s.state }));
    if (team.board_type === "scrum") {
      const q = req.nextUrl.searchParams.get("sprintIds");
      const picked = q ? q.split(",").map((s) => s.trim()).filter(Boolean) : null;
      const closedIds = teamSprints.filter((s) => s.state === "closed").map((s) => s.id);
      // sem sprints fechadas ainda (board novo) → usa as disponíveis, p/ a janela
      // exibida bater com os dados (senão o UI diz "6 sprints" e a métrica usa tudo).
      const base = closedIds.length ? closedIds : teamSprints.map((s) => s.id);
      sprintIds = picked && picked.length ? picked : base.slice(-6);
    } else {
      const w = Number(req.nextUrl.searchParams.get("weeks"));
      cycleWeeks = [4, 8, 12].includes(w) ? w : 8;
    }
    const metrics = computeTeamMetrics(team, sprints, issues, {
      weeks: cycleWeeks ?? 12,
      epicNames,
      sprintIds,
      cycleWeeks,
    });
    const maturity = computeMaturity(metrics);
    const coaching = plan ? plan.coaching : true;
    const status = classifyEngagement({
      tier: maturity.tier,
      historyTiers: history.map((h) => h.tier),
      coaching,
    });
    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        board_type: team.board_type,
        description: team.description,
      },
      maturity,
      window: {
        mode: team.board_type,
        sprintIds: sprintIds ?? [],
        cycleWeeks: cycleWeeks ?? null,
        availableSprints,
      },
      status,
      coach: plan?.coach ?? null,
      metrics, // TeamMetrics completo (para os gráficos dos pilares no dashboard)
      history,
      plan,
      assessment,
      experiments,
      comments,
      fieldHistory,
      evidence: {
        scatter: metrics.flow.scatter,
        cycleP50: metrics.flow.deliveryCycleTime.median,
        cycleP85: metrics.flow.deliveryCycleTime.p85,
        velocity: metrics.scrum?.velocity ?? null,
        throughputSeries: metrics.flow.throughput.series,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

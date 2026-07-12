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
    const metrics = computeTeamMetrics(team, sprints, issues, { weeks: 12, epicNames });
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

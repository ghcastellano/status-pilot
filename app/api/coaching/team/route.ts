import { withWorkspaceAuth } from "@/lib/auth/route";
import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { computeMaturity } from "@/lib/maturity";
import { resolveWindow } from "@/lib/window";
import { fetchHistory, fetchPlan, fetchAssessment, fetchExperiments, fetchCommentsForTeam, fetchFieldHistory } from "@/lib/coaching-db";
import { classifyEngagement } from "@/lib/coaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Detalhe do time em UMA request: maturidade + histórico + plano + sinais +
// experimentos + os dados dos charts de evidência.
export const GET = withWorkspaceAuth(async (req: NextRequest, user) => {
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

    // Janela ÚNICA (mesma do /api/metrics) → tier e KPIs consistentes.
    const win = resolveWindow(team, sprints, {
      sprintIds: req.nextUrl.searchParams.get("sprintIds"),
      weeks: req.nextUrl.searchParams.get("weeks"),
    });
    const sprintIds = win.sprintIds;
    const cycleWeeks = win.cycleWeeks;
    const availableSprints = win.availableSprints;
    const metrics = computeTeamMetrics(team, sprints, issues, {
      weeks: cycleWeeks ?? 12,
      epicNames,
      sprintIds,
      cycleWeeks,
    });
    // Só o sprint ATIVO selecionado → métricas atuais, SEM maturidade (não fechou).
    const maturity = win.activeSprintSelected ? null : computeMaturity(metrics);
    const coaching = plan ? plan.coaching : true;
    const status = classifyEngagement({
      tier: maturity?.tier ?? null,
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
        label: win.label,
        labelEn: win.labelEn,
        availableSprints,
        activeSprintSelected: win.activeSprintSelected,
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
});

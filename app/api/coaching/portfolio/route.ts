import { NextResponse } from "next/server";
import { fetchTeams, fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { computeMaturity } from "@/lib/maturity";
import { fetchHistory, fetchPlan, fetchAssessment, fetchExperiments } from "@/lib/coaching-db";
import { behavioralReadiness, classifyEngagement, tierMovement } from "@/lib/coaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portfolio inteiro em UMA request: maturidade ao vivo + histórico + engajamento
// (status, working-on, behavioral, movimento) de cada time.
export async function GET() {
  try {
    const teams = await fetchTeams();
    const boards = await Promise.all(
      teams.map(async (team) => {
        const [{ sprints, issues, epics }, history, plan, assessment, experiments] = await Promise.all([
          fetchTeamData(team.id),
          fetchHistory(team.id),
          fetchPlan(team.id),
          fetchAssessment(team.id),
          fetchExperiments(team.id),
        ]);
        const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));
        const metrics = computeTeamMetrics(team, sprints, issues, { weeks: 12, epicNames });
        const maturity = computeMaturity(metrics);

        const historyTiers = history.map((h) => h.tier);
        // "em programa" por padrão neste demo (times exibidos SÃO os coachados),
        // salvo opt-out explícito no plano.
        const coaching = plan ? plan.coaching : true;
        const status = classifyEngagement({ tier: maturity.tier, historyTiers, coaching });
        const mv = tierMovement(historyTiers);
        const behavioral = behavioralReadiness(assessment?.signals ?? {});
        const workingOn = Array.from(
          new Set(experiments.filter((e) => e.status === "active").map((e) => e.pillar))
        );

        const caption =
          team.board_type === "scrum"
            ? `média das últimas ${metrics.scrum?.closedSprintCount ?? 0} sprints fechadas`
            : `últimas ${history.length || 12} semanas`;

        return {
          team: {
            id: team.id,
            name: team.name,
            board_type: team.board_type,
            description: team.description,
          },
          maturity,
          history: history.map((h) => ({ as_of: h.as_of, tier: h.tier })),
          status,
          coaching,
          coach: plan?.coach ?? null,
          ask: plan?.ask ?? null,
          mainGap: plan?.main_gap ?? null,
          workingOn,
          behavioral,
          movement: mv.movement, // up | down | flat | recovered (NET no período)
          leveledUp: mv.leveledUp,
          caption,
        };
      })
    );
    return NextResponse.json({ boards });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

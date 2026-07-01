import { NextResponse } from "next/server";
import { fetchTeams, fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { computeMaturity } from "@/lib/maturity";
import { fetchHistory } from "@/lib/coaching-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portfolio inteiro em UMA request: maturidade ao vivo + histórico de cada time.
export async function GET() {
  try {
    const teams = await fetchTeams();
    const boards = await Promise.all(
      teams.map(async (team) => {
        const [{ sprints, issues, epics }, history] = await Promise.all([
          fetchTeamData(team.id),
          fetchHistory(team.id),
        ]);
        const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));
        const metrics = computeTeamMetrics(team, sprints, issues, { weeks: 12, epicNames });
        return {
          team: {
            id: team.id,
            name: team.name,
            board_type: team.board_type,
            description: team.description,
          },
          maturity: computeMaturity(metrics),
          history: history.map((h) => ({ as_of: h.as_of, tier: h.tier })),
        };
      })
    );
    return NextResponse.json({ boards });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

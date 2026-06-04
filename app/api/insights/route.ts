import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { isValidTeamId } from "@/lib/validate";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { generateMetricInsights } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSIGHT_KEY = "__insight__";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const teamId = body?.teamId;
  if (!isValidTeamId(teamId)) {
    return NextResponse.json({ error: "Time inválido." }, { status: 400 });
  }
  try {
    const cached = await getCachedAnswer(teamId, INSIGHT_KEY);
    if (cached) return NextResponse.json({ insights: JSON.parse(cached), cached: true });

    const { team, sprints, issues, epics } = await fetchTeamData(teamId);
    if (!team) return NextResponse.json({ error: "Time não encontrado." }, { status: 404 });
    const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));
    const metrics = computeTeamMetrics(team, sprints, issues, { epicNames });
    const insights = await generateMetricInsights(metrics);

    await setCachedAnswer(teamId, INSIGHT_KEY, JSON.stringify(insights));
    return NextResponse.json({ insights, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

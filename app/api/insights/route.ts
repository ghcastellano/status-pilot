import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics, computeAnalysisBundle } from "@/lib/metrics";
import { isValidTeamId } from "@/lib/validate";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { generateMetricInsights } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSIGHT_KEY = "__insight__";
const EMPTY = { cycleTime: "", secondary: "", flowEfficiency: "", predictability: "", chart: "" };

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
    if (cached) {
      try {
        return NextResponse.json({ insights: JSON.parse(cached), cached: true });
      } catch {
        /* cache corrompido → regenera abaixo */
      }
    }

    const { team, sprints, issues, epics } = await fetchTeamData(teamId);
    if (!team) return NextResponse.json({ insights: EMPTY, cached: false });
    const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));
    const metrics = computeTeamMetrics(team, sprints, issues, { epicNames });
    const bundle = computeAnalysisBundle(metrics, issues, epicNames);
    const insights = await generateMetricInsights(bundle);

    // só cacheia se veio conteúdo (não cacheia fallback vazio → próximo load tenta de novo)
    if (Object.values(insights).some((v) => v)) {
      await setCachedAnswer(teamId, INSIGHT_KEY, JSON.stringify(insights));
    }
    return NextResponse.json({ insights, cached: false });
  } catch (e) {
    console.error("/api/insights:", (e as Error).message);
    return NextResponse.json({ insights: EMPTY, cached: false }); // UI nunca quebra
  }
}

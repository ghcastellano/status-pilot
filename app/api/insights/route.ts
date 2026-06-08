import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics, computeAnalysisBundle } from "@/lib/metrics";
import { isValidTeamId } from "@/lib/validate";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { generateMetricInsights } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSIGHT_KEY = "__insight_v2__";
const EMPTY = { cycleTime: "", secondary: "", flowEfficiency: "", predictability: "", chart: "" };

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const { teamId, epic, type, weeks, sprintId } = body ?? {};
  if (!isValidTeamId(teamId)) {
    return NextResponse.json({ error: "Time inválido." }, { status: 400 });
  }

  // chave de cache inclui filtros — cada combinação tem seu próprio insight
  const filterSuffix = [epic ?? "all", type ?? "all", String(weeks ?? 12), sprintId ?? "all"].join("|");
  const cacheKey = `${INSIGHT_KEY}_${filterSuffix}`;

  try {
    const cached = await getCachedAnswer(teamId, cacheKey);
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
    const metrics = computeTeamMetrics(team, sprints, issues, {
      epicNames,
      epic: epic && epic !== "all" ? epic : undefined,
      type: type && type !== "all" ? type : undefined,
      weeks: weeks ? Number(weeks) : 12,
      sprintId: sprintId && sprintId !== "all" ? sprintId : undefined,
    });
    const bundle = computeAnalysisBundle(metrics, issues, epicNames);
    const insights = await generateMetricInsights(bundle);

    // só cacheia se veio conteúdo (não cacheia fallback vazio → próximo load tenta de novo)
    if (Object.values(insights).some((v) => v)) {
      await setCachedAnswer(teamId, cacheKey, JSON.stringify(insights));
    }
    return NextResponse.json({ insights, cached: false });
  } catch (e) {
    console.error("/api/insights:", (e as Error).message);
    return NextResponse.json({ insights: EMPTY, cached: false }); // UI nunca quebra
  }
}

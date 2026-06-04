import { NextRequest, NextResponse } from "next/server";
import { fetchTeams, fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { validateQuestion, normalizeForCache, isValidTeamId } from "@/lib/validate";
import { checkRateLimit, bucketFrom, RATE_LIMIT } from "@/lib/rate-limit";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { answerAcrossTeams } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { teamId, question, sessionId } = body ?? {};
  if (!isValidTeamId(teamId)) {
    return NextResponse.json({ error: "Time inválido." }, { status: 400 });
  }
  const v = validateQuestion(question);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    // 1) cache primeiro — hit não gasta LLM nem cota
    const norm = normalizeForCache(v.value);
    const cached = await getCachedAnswer(teamId, norm);
    if (cached) return NextResponse.json({ answer: cached, cached: true });

    // 2) rate limit (só quando vamos chamar o LLM)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const rl = await checkRateLimit(bucketFrom(ip, sessionId ?? null));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite de ${RATE_LIMIT} perguntas por sessão atingido. Tente mais tarde.`, remaining: 0 },
        { status: 429 }
      );
    }

    // 3) métricas de TODOS os times + LLM sobre os snapshots combinados
    const teams = await fetchTeams();
    const list = [];
    for (const t of teams) {
      const { team, sprints, issues, epics } = await fetchTeamData(t.id);
      if (!team) continue;
      const epicNames = Object.fromEntries(epics.map((e) => [e.epic_key, e.name]));
      list.push(computeTeamMetrics(team, sprints, issues, { epicNames }));
    }
    const answer = await answerAcrossTeams(list, v.value);

    await setCachedAnswer(teamId, norm, answer);
    return NextResponse.json({ answer, cached: false, remaining: rl.remaining });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

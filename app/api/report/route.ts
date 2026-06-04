import { NextRequest, NextResponse } from "next/server";
import { fetchTeamData } from "@/lib/data";
import { computeTeamMetrics } from "@/lib/metrics";
import { isValidTeamId } from "@/lib/validate";
import { checkRateLimit, bucketFrom, RATE_LIMIT } from "@/lib/rate-limit";
import { getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { generateReport } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_KEY = "__status_report__";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const { teamId, sessionId } = body ?? {};
  if (!isValidTeamId(teamId)) {
    return NextResponse.json({ error: "Time inválido." }, { status: 400 });
  }

  try {
    const cached = await getCachedAnswer(teamId, REPORT_KEY);
    if (cached) return NextResponse.json({ report: cached, cached: true });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const rl = await checkRateLimit(bucketFrom(ip, sessionId ?? null));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite de ${RATE_LIMIT} chamadas por sessão atingido.`, remaining: 0 },
        { status: 429 }
      );
    }

    const { team, sprints, issues } = await fetchTeamData(teamId);
    if (!team) return NextResponse.json({ error: "Time não encontrado." }, { status: 404 });
    const metrics = computeTeamMetrics(team, sprints, issues);
    const report = await generateReport(metrics);

    await setCachedAnswer(teamId, REPORT_KEY, report);
    return NextResponse.json({ report, cached: false, remaining: rl.remaining });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

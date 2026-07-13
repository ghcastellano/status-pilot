import { NextResponse } from "next/server";
import { jiraProviderFromEnv } from "@/lib/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
}

/**
 * GET /api/jira/boards?q=<busca> — lista PROJETOS de software do Jira conectado
 * (via /rest/api/3, pois a Agile API /rest/agile é bloqueada pela política OAuth
 * do Jira corporativo). O tipo scrum/kanban é DETECTADO na ingestão (presença de
 * sprints), então aqui `type` vem "unknown". Sem `q`, retorna os primeiros 50.
 * Não conectado → 409 com boards vazio.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  try {
    const jira = jiraProviderFromEnv();
    const qs = new URLSearchParams({ maxResults: "50", typeKey: "software", orderBy: "name" });
    if (q) qs.set("query", q);
    const data = await jira.raw<{ values?: JiraProject[]; total?: number }>(
      "GET",
      `/rest/api/3/project/search?${qs.toString()}`
    );
    const boards = (data.values ?? []).map((p) => ({
      id: p.key, // usamos a project key como identificador do "time"
      name: p.name,
      type: "unknown" as const, // detectado na ingestão (scrum se houver sprints)
      projectKey: p.key,
      projectName: p.name,
    }));
    return NextResponse.json({ boards, total: data.total ?? boards.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, boards: [] }, { status: 409 });
  }
}

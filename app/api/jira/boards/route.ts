import { withWorkspaceAuth } from "@/lib/auth/route";
import { NextRequest, NextResponse } from "next/server";
import { jiraProviderFromEnv } from "@/lib/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgileBoard {
  id: number;
  name: string;
  type: string; // scrum | kanban | simple
  location?: { projectKey?: string; projectName?: string };
}
interface JiraProject {
  id: string;
  key: string;
  name: string;
}

/**
 * GET /api/jira/boards?q=<busca> — lista BOARDS do Jira conectado.
 * HÍBRIDO: com Basic auth (acesso pleno) usa a Agile API e traz o TIPO REAL
 * scrum/kanban do board; se a Agile falhar (OAuth 3LO na Indeed bloqueia),
 * cai p/ busca de PROJETOS (/rest/api/3) com tipo "unknown" (detectado na
 * ingestão). Não conectado → 409.
 */
export const GET = withWorkspaceAuth(async (req: NextRequest, user) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  try {
    const jira = jiraProviderFromEnv();
    // 1) Agile boards (tipo real). name= filtra no servidor.
    try {
      const qs = new URLSearchParams({ maxResults: "50" });
      if (q) qs.set("name", q);
      const data = await jira.raw<{ values?: AgileBoard[]; total?: number }>(
        "GET",
        `/rest/agile/1.0/board?${qs.toString()}`
      );
      const boards = (data.values ?? []).map((b) => ({
        id: b.id, // id numérico do board (distingue de projeto na ingestão)
        name: b.name,
        type: b.type === "scrum" ? "scrum" : "kanban", // simple → kanban
        projectKey: b.location?.projectKey ?? null,
        projectName: b.location?.projectName ?? null,
      }));
      return NextResponse.json({ boards, total: data.total ?? boards.length, source: "agile" });
    } catch {
      // 2) Fallback v3: busca de projetos (Agile bloqueada no OAuth).
      const qs = new URLSearchParams({ maxResults: "50", typeKey: "software", orderBy: "name" });
      if (q) qs.set("query", q);
      const data = await jira.raw<{ values?: JiraProject[]; total?: number }>(
        "GET",
        `/rest/api/3/project/search?${qs.toString()}`
      );
      const boards = (data.values ?? []).map((p) => ({
        id: p.key,
        name: p.name,
        type: "unknown" as const,
        projectKey: p.key,
        projectName: p.name,
      }));
      return NextResponse.json({ boards, total: data.total ?? boards.length, source: "projects" });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, boards: [] }, { status: 409 });
  }
});

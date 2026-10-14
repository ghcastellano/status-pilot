import { withWorkspaceAuth } from "@/lib/auth/route";
import { NextRequest, NextResponse } from "next/server";
import { fetchTeams } from "@/lib/data";
import { getDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withWorkspaceAuth(async (req: NextRequest, user) => {
  try {
    const teams = await fetchTeams();
    return NextResponse.json({ teams });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

interface CreateTeamBody {
  boardId: number | string;
  name: string;
  boardType: "scrum" | "kanban";
  projectKey?: string;
  projectName?: string;
  active?: boolean;
}

/**
 * POST /api/teams — cria/atualiza um time a partir de um board do Jira (upsert
 * por id `board-<id>`). Ligar um board no /config passa por aqui.
 */
export const POST = withWorkspaceAuth(async (req: NextRequest, user) => {
  try {
    const body = (await req.json()) as Partial<CreateTeamBody>;
    const { boardId, name } = body;

    if (boardId === undefined || boardId === null || String(boardId).length === 0) {
      return NextResponse.json({ error: "boardId é obrigatório." }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name é obrigatório." }, { status: 400 });
    }
    // tipo real é DETECTADO na ingestão (presença de sprints); aqui é só um default.
    const boardType = body.boardType === "kanban" ? "kanban" : "scrum";

    const row = {
      id: `board-${boardId}`,
      name,
      board_type: boardType,
      jira_project_key: body.projectKey ?? null,
      jira_board_id: String(boardId),
      jira_board_name: name,
      active: body.active !== false,
      description: body.projectName ? `${body.projectName} · board ${boardId}` : null,
    };

    const sb = getDatabase();
    const { data, error } = await sb.upsert("teams", row, { onConflict: "id", single: 'required' });
    if (error) throw new Error(error.message);

    return NextResponse.json({ team: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

/**
 * DELETE /api/teams?id=board-123 — desliga o time (active=false). NÃO é hard
 * delete: dados de coaching/métricas fazem cascade e devem ser preservados.
 */
export const DELETE = withWorkspaceAuth(async (req: NextRequest, user) => {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
    }
    const sb = getDatabase();
    const { error } = await sb.update("teams", { active: false }, { where: { ["id"]: id } });
    if (error) throw new Error(error.message);
    return NextResponse.json({ deactivated: 1 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

import { withWorkspaceAuth } from "@/lib/auth/route";
import { NextRequest, NextResponse } from "next/server";
import { fetchCommentsForTeam, addComment, deleteComment } from "@/lib/coaching-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s = (v: unknown, max = 2000) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export const GET = withWorkspaceAuth(async (req: NextRequest, user) => {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) {
    return NextResponse.json({ error: "teamId é obrigatório" }, { status: 400 });
  }
  try {
    const comments = await fetchCommentsForTeam(teamId);
    return NextResponse.json({ comments });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

export const POST = withWorkspaceAuth(async (req: NextRequest, user) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const teamId = typeof body?.teamId === "string" ? body.teamId : null;
  const experimentId = typeof body?.experimentId === "number" ? body.experimentId : null;
  const bodyText = s(body?.body);
  if (!teamId || !experimentId || !bodyText) {
    return NextResponse.json(
      { error: "teamId, experimentId e body são obrigatórios" },
      { status: 400 }
    );
  }
  const author = user.email ?? user.id;
  try {
    const comment = await addComment({
      experiment_id: experimentId,
      team_id: teamId,
      author,
      body: bodyText,
    });
    return NextResponse.json({ comment });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

export const DELETE = withWorkspaceAuth(async (req: NextRequest, user) => {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });
  }
  try {
    await deleteComment(id);
    return NextResponse.json({ removed: 1 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

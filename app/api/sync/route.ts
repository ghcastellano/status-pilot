import { NextResponse } from "next/server";
import { syncIssuesFromJira } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // { teamId } opcional → sincroniza só aquele time (auto-sync ao selecionar).
    let teamId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.teamId === "string") teamId = body.teamId;
    } catch {
      /* sem body → sincroniza todos os ativos */
    }
    const result = await syncIssuesFromJira(teamId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

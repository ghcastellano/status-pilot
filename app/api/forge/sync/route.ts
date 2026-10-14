/**
 * app/api/forge/sync/route.ts — endpoint invocado pelo FORGE REMOTE.
 *
 * É aqui que o app Forge fino "aterrissa" no nosso backend. Chamado pelo
 * scheduledTrigger (sync em background) ou pela page do app. Fluxo:
 *   1. valida o FIT + pega o token asApp (verifyForgeRequest);
 *   2. monta um ForgeProvider (asApp) apontando p/ o cloudId do tenant;
 *   3. roda a MESMA ingestão do caminho Basic (syncIssuesFromJira), agora
 *      autenticando como o app — o que passa onde o OAuth 3LO é bloqueado.
 *
 * Multi-tenant (Fase 2): filtrar times por `forge_cloud_id = ctx.cloudId`. No
 * spike, sincroniza os times ativos com board usando o provider Forge, e devolve
 * `myself()` como prova de que o token asApp chegou e a Agile API respondeu.
 */
import { NextResponse } from "next/server";
import { verifyForgeRequest, ForgeAuthError } from "@/lib/forge-auth";
import { ForgeProvider } from "@/lib/jira";
import { syncIssuesFromJira } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ctx = await verifyForgeRequest(req.headers);
    const jira = new ForgeProvider({ apiBaseUrl: ctx.apiBaseUrl, systemToken: ctx.systemToken });

    // corpo opcional: { teamId } p/ sincronizar só um time (page interativa).
    let teamId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.teamId === "string") teamId = body.teamId;
    } catch {
      /* sem corpo → todos os times ativos do tenant */
    }

    const result = await syncIssuesFromJira(teamId, jira, "forge-asApp");
    return NextResponse.json({ ok: true, cloudId: ctx.cloudId, ...result });
  } catch (e) {
    const status = e instanceof ForgeAuthError ? e.status : 500;
    return NextResponse.json({ ok: false, error: e instanceof ForgeAuthError ? e.message : "Unable to synchronize workspace." }, { status });
  }
}

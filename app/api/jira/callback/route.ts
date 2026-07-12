/**
 * GET /api/jira/callback — retorno do OAuth 2.0 (3LO) da Atlassian.
 * Valida o `state` (CSRF), troca o `code` por tokens, descobre o cloudId/site e
 * o usuário, persiste em `jira_connections` e volta para "/".
 */
import { NextRequest, NextResponse } from "next/server";
import { saveJiraConnection } from "@/lib/jira-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { origin, searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = req.cookies.get("jira_oauth_state")?.value;

  try {
    if (!code || !state) throw new Error("code/state ausentes na callback.");
    if (!cookieState || cookieState !== state) {
      // flui pelo catch → redireciona p/ o banner e limpa o cookie de state
      throw new Error("state inválido (possível CSRF).");
    }

    const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
    const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.JIRA_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        "Env OAuth incompleta: JIRA_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI."
      );
    }

    // 1) troca o code por tokens
    const tokRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokRes.ok) {
      throw new Error(`token → ${tokRes.status}: ${(await tokRes.text()).slice(0, 300)}`);
    }
    const tok = (await tokRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };

    // 2) recursos acessíveis → cloudId + site_url (pega o primeiro)
    const resRes = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" } }
    );
    if (!resRes.ok) {
      throw new Error(`accessible-resources → ${resRes.status}: ${(await resRes.text()).slice(0, 300)}`);
    }
    const resources = (await resRes.json()) as Array<{
      id: string;
      url: string;
      name?: string;
    }>;
    const site = resources[0];
    if (!site) throw new Error("Nenhum site Jira acessível para esta conta.");

    // 3) usuário (opcional — não bloqueia a conexão se falhar)
    let accountId: string | null = null;
    let accountName: string | null = null;
    try {
      const meRes = await fetch(
        `https://api.atlassian.com/ex/jira/${site.id}/rest/api/3/myself`,
        { headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" } }
      );
      if (meRes.ok) {
        const me = (await meRes.json()) as { accountId?: string; displayName?: string };
        accountId = me.accountId ?? null;
        accountName = me.displayName ?? null;
      }
    } catch {
      /* segue sem os dados do usuário */
    }

    await saveJiraConnection({
      cloud_id: site.id,
      site_url: site.url,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      scopes: tok.scope ?? null,
      account_id: accountId,
      account_name: accountName ?? site.name ?? null,
    });

    const ok = NextResponse.redirect(new URL("/?jira=connected", origin));
    ok.cookies.delete("jira_oauth_state");
    return ok;
  } catch (e) {
    // loga server-side; NÃO joga o detalhe do erro na URL (histórico/logs/Referer)
    console.error("jira oauth callback falhou:", (e as Error).message);
    const fail = NextResponse.redirect(new URL("/?jira=error", origin));
    fail.cookies.delete("jira_oauth_state");
    return fail;
  }
}

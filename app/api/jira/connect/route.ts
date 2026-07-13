/**
 * GET /api/jira/connect — inicia o fluxo OAuth 2.0 (3LO) da Atlassian.
 * Gera um `state` (CSRF) num cookie httpOnly e redireciona para a tela de
 * consentimento. O callback é /api/jira/callback.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SCOPES 100% GRANULARES (sem clássicos). Misturar clássico (read:jira-work) com
// granular quebra a Agile API com "scope does not match" — então tudo granular:
//   read:board-scope:jira-software → boards (Agile)
//   read:sprint:jira-software      → sprints (Agile)
//   read:issue-details:jira        → issues + changelog (search/jql)
//   read:project:jira              → project/search
// (/field, /status, /myself degradam com fallback se não vierem — ingestão é resiliente)
const SCOPE =
  "read:board-scope:jira-software read:sprint:jira-software read:issue-details:jira read:project:jira offline_access";

export async function GET() {
  const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
  const redirectUri = process.env.JIRA_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "JIRA_OAUTH_CLIENT_ID e JIRA_OAUTH_REDIRECT_URI são obrigatórias (defina em .env.local).",
      },
      { status: 500 }
    );
  }

  const state = randomUUID();
  const authorize = new URL("https://auth.atlassian.com/authorize");
  authorize.searchParams.set("audience", "api.atlassian.com");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", SCOPE);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("jira_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min p/ concluir o consentimento
  });
  return res;
}

import { withWorkspaceAuth } from "@/lib/auth/route";
/**
 * POST /api/jira/connect-basic — conecta o Jira via Basic auth (email + API
 * token), como o formulário do Scrum Maturity Dashboard. Valida em /myself,
 * grava a conexão (multi-empresa: cada um informa o seu Jira). SSRF: só
 * *.atlassian.net por https.
 */
import { NextRequest, NextResponse } from "next/server";
import { saveBasicConnection, clearJiraConnection } from "@/lib/jira-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/jira/connect-basic — desconecta (limpa a conexão armazenada). */
export const DELETE = withWorkspaceAuth(async (req: NextRequest, user) => {
  try {
    await clearJiraConnection();
    return NextResponse.json({ disconnected: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

const HOST_OK = /^[a-z0-9-]+\.atlassian\.net$/i;

export const POST = withWorkspaceAuth(async (req: NextRequest, user) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const rawUrl = typeof body?.jiraUrl === "string" ? body.jiraUrl.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!rawUrl || !email || !token) {
    return NextResponse.json({ error: "Informe a URL do Jira, o e-mail e o API token." }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return NextResponse.json({ error: "URL inválida." }, { status: 400 });
  }
  if (url.protocol !== "https:" || !HOST_OK.test(url.hostname)) {
    return NextResponse.json({ error: "A URL deve ser https://SEU-SITE.atlassian.net" }, { status: 400 });
  }
  const base = `https://${url.hostname}`;
  const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
  try {
    const res = await fetch(`${base}/rest/api/3/myself`, {
      headers: { Authorization: auth, Accept: "application/json" },
      redirect: "manual",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Credenciais inválidas (HTTP ${res.status}). Confira o e-mail e o API token.` },
        { status: 401 }
      );
    }
    const me = (await res.json()) as { displayName?: string };
    await saveBasicConnection({ site_url: base, email, token, account_name: me.displayName ?? email });
    return NextResponse.json({ connected: true, site_url: base, account_name: me.displayName ?? email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
});

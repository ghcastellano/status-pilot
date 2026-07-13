/**
 * lib/jira-connections.ts — persistência da conexão Basic (email + API token)
 * com o Jira na tabela `jira_connections` (SOMENTE backend, usa service_role).
 *
 * Multi-tenant por linha única id='default': o site conectado no /config e suas
 * credenciais. O token fica só no servidor — nunca importe em "use client".
 */
import { getSupabaseAdmin } from "./supabase";

export interface JiraConnection {
  site_url: string;
  account_name: string | null;
  basic_email: string | null; // Basic auth (form no /config)
  basic_token: string | null;
}

export async function getJiraConnection(): Promise<JiraConnection | null> {
  const sb = getSupabaseAdmin();
  // select("*") em vez de colunas nomeadas: o PostgREST do Supabase pode ter o
  // schema cache defasado p/ uma coluna adicionada via ALTER (ex.: account_name),
  // e um select nomeado dessa coluna volta vazio no runtime do Vercel.
  const { data, error } = await sb
    .from("jira_connections")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JiraConnection | null;
}

/** Conexão Basic (email + API token) — form do /config, multi-empresa. */
export async function saveBasicConnection(input: {
  site_url: string;
  email: string;
  token: string;
  account_name?: string | null;
}): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("jira_connections").upsert(
    {
      id: "default",
      auth_type: "basic",
      site_url: input.site_url.replace(/\/$/, ""),
      basic_email: input.email,
      basic_token: input.token,
      account_name: input.account_name ?? input.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(error.message);
}

export async function clearJiraConnection(): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("jira_connections").delete().eq("id", "default");
  if (error) throw new Error(error.message);
}

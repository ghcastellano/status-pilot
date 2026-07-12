/**
 * lib/jira-connections.ts — persistência da conexão OAuth 2.0 (3LO) com o Jira
 * na tabela `jira_connections` (SOMENTE backend, usa service_role).
 *
 * Linha única id='default': o site conectado e seus tokens. Tokens ficam só no
 * servidor — nunca importe este módulo em "use client".
 */
import { getSupabaseAdmin } from "./supabase";

export interface JiraConnection {
  cloud_id: string;
  site_url: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string; // ISO 8601
  scopes: string | null;
  account_id: string | null;
  account_name: string | null;
}

const COLS =
  "cloud_id, site_url, access_token, refresh_token, expires_at, scopes, account_id, account_name";

export async function getJiraConnection(): Promise<JiraConnection | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("jira_connections")
    .select(COLS)
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as JiraConnection | null;
}

export async function saveJiraConnection(conn: JiraConnection): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("jira_connections")
    .upsert(
      { id: "default", ...conn, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw new Error(error.message);
}

export async function clearJiraConnection(): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("jira_connections").delete().eq("id", "default");
  if (error) throw new Error(error.message);
}

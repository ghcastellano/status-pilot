/**
 * lib/jira-connections.ts — persistência da conexão Basic (email + API token)
 * com o Jira na tabela `jira_connections` (SOMENTE backend, uses the restricted server database role).
 *
 * Multi-tenant por linha única id='default': o site conectado no /config e suas
 * credenciais. O token fica só no servidor — nunca importe em "use client".
 */
import { getDatabase } from "./db";

export interface JiraConnection {
  site_url: string;
  account_name: string | null;
  basic_email: string | null; // Basic auth (form no /config)
  basic_token: string | null;
}

export async function getJiraConnection(): Promise<JiraConnection | null> {
  const sb = getDatabase();
  const { data, error } = await sb.select("jira_connections", { single: 'optional', where: { ["id"]: "default" }, columns: "*" });
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
  const sb = getDatabase();
  const { error } = await sb.upsert("jira_connections", {
      id: "default",
      auth_type: "basic",
      site_url: input.site_url.replace(/\/$/, ""),
      basic_email: input.email,
      basic_token: input.token,
      account_name: input.account_name ?? input.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function clearJiraConnection(): Promise<void> {
  const sb = getDatabase();
  const { error } = await sb.delete("jira_connections", { where: { ["id"]: "default" } });
  if (error) throw new Error(error.message);
}

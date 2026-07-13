/**
 * lib/jira.ts — cliente mínimo da Jira Cloud REST API v3.
 *
 * Dois modos de autenticação, atrás da MESMA interface `JiraProvider`:
 *   1. Basic (email + API token) — `JiraClient`. Usado por scripts/lib/sync.ts
 *      (Node/tsx), base `https://SEUNOME.atlassian.net`.
 *   2. OAuth 2.0 (3LO) — `OAuthProvider`. Resolve token/cloudId da tabela
 *      `jira_connections`, base `https://api.atlassian.com/ex/jira/{cloudId}`,
 *      com auto-refresh do access_token.
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
 *
 * Nada aqui vai para o frontend (usa fetch server-side + segredos).
 */
import {
  getJiraConnection,
  saveJiraConnection,
  type JiraConnection,
} from "./jira-connections";

export interface JiraConfig {
  baseUrl: string; // https://SEUNOME.atlassian.net
  email: string;
  token: string;
  scrumKey: string; // projeto Scrum (ex: LS)
  kanbanKey: string; // projeto Kanban (ex: LK)
}

export function jiraConfigFromEnv(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const scrumKey =
    process.env.JIRA_SCRUM_KEY || process.env.JIRA_PROJECT_KEY_SCRUM || "LS";
  const kanbanKey =
    process.env.JIRA_KANBAN_KEY || process.env.JIRA_PROJECT_KEY_KANBAN || "LK";
  if (!baseUrl || !email || !token) {
    throw new Error(
      "JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN são obrigatórias (defina em .env.local)."
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), email, token, scrumKey, kanbanKey };
}

/**
 * Superfície de rede da Jira — os 11 métodos que scripts/sync usam. `raw` é
 * load-bearing (toda chamada Agile/admin passa por ele). Implementado por
 * `JiraClient` (Basic) e `OAuthProvider` (3LO).
 */
export interface JiraProvider {
  raw<T = any>(method: string, path: string, body?: unknown): Promise<T>;
  myself(): Promise<{ accountId: string; displayName: string; emailAddress?: string }>;
  fields(): Promise<Array<{ id: string; name: string; custom: boolean }>>;
  projects(): Promise<Array<{ key: string; name: string; id: string }>>;
  issueTypesForProject(projectKey: string): Promise<Array<{ id: string; name: string }>>;
  projectStatuses(
    projectKey: string
  ): Promise<Array<{ name: string; statuses: Array<{ id: string; name: string }> }>>;
  createIssue(
    fields: Record<string, unknown>
  ): Promise<{ id: string; key: string; self: string }>;
  editIssue(issueKey: string, fields: Record<string, unknown>): Promise<void>;
  transitions(
    issueKey: string
  ): Promise<{ transitions: Array<{ id: string; name: string; to: { name: string } }> }>;
  doTransition(issueKey: string, transitionId: string): Promise<void>;
  searchJql(jql: string, fields: string[], maxResults?: number, expand?: string[], maxTotal?: number): Promise<JiraIssue[]>;
}

/**
 * Lógica de request compartilhada — UM lugar só. Parametrizada por `getBase`,
 * que resolve (a) a URL base e (b) o header Authorization a cada chamada
 * (necessário para o OAuth, que pode renovar o token antes de cada request).
 */
async function jiraRequest<T>(
  getBase: () => Promise<{ baseUrl: string; authHeader: string }>,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { baseUrl, authHeader } = await getBase();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "X-Atlassian-Token": "no-check",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Base abstrata: implementa os 11 métodos em cima de `jiraRequest`. As
 * subclasses só precisam dizer COMO montar base/header via `getBase()`.
 */
abstract class JiraBase implements JiraProvider {
  protected abstract getBase(): Promise<{ baseUrl: string; authHeader: string }>;

  private req<T>(method: string, path: string, body?: unknown): Promise<T> {
    return jiraRequest<T>(() => this.getBase(), method, path, body);
  }

  /** Acesso genérico (para sondagem/capacidades da API). */
  raw<T = any>(method: string, path: string, body?: unknown) {
    return this.req<T>(method, path, body);
  }

  /** Verifica credenciais. Retorna o usuário autenticado. */
  myself() {
    return this.req<{ accountId: string; displayName: string; emailAddress?: string }>(
      "GET",
      "/rest/api/3/myself"
    );
  }

  /** Lista os campos para descobrir o id do "Story Points". */
  fields() {
    return this.req<Array<{ id: string; name: string; custom: boolean }>>(
      "GET",
      "/rest/api/3/field"
    );
  }

  /** Projetos visíveis para o usuário. */
  async projects(): Promise<Array<{ key: string; name: string; id: string }>> {
    const data = await this.req<{ values: Array<{ key: string; name: string; id: string }> }>(
      "GET",
      "/rest/api/3/project/search?maxResults=50"
    );
    return data.values ?? [];
  }

  /** Tipos de issue disponíveis no projeto (nomes variam por idioma/template). */
  async issueTypesForProject(
    projectKey: string
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await this.req<{
      projects: Array<{ issuetypes: Array<{ id: string; name: string }> }>;
    }>(
      "GET",
      `/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`
    );
    return data.projects[0]?.issuetypes ?? [];
  }

  /** Status disponíveis no projeto, agrupados por tipo de issue. */
  projectStatuses(projectKey: string) {
    return this.req<
      Array<{ name: string; statuses: Array<{ id: string; name: string }> }>
    >("GET", `/rest/api/3/project/${projectKey}/statuses`);
  }

  createIssue(fields: Record<string, unknown>) {
    return this.req<{ id: string; key: string; self: string }>(
      "POST",
      "/rest/api/3/issue",
      { fields }
    );
  }

  /** Edita campos de uma issue (PUT). Retorna 204. */
  editIssue(issueKey: string, fields: Record<string, unknown>) {
    return this.req<void>("PUT", `/rest/api/3/issue/${issueKey}`, { fields });
  }

  /** Transições disponíveis para uma issue. */
  transitions(issueKey: string) {
    return this.req<{ transitions: Array<{ id: string; name: string; to: { name: string } }> }>(
      "GET",
      `/rest/api/3/issue/${issueKey}/transitions`
    );
  }

  doTransition(issueKey: string, transitionId: string) {
    return this.req<void>("POST", `/rest/api/3/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }

  /** Busca issues por JQL (endpoint novo, pós-deprecação do /search). */
  async searchJql(
    jql: string,
    fields: string[],
    maxResults = 100,
    expand?: string[],
    maxTotal?: number
  ): Promise<JiraIssue[]> {
    const all: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const body: Record<string, unknown> = { jql, fields, maxResults };
      if (expand?.length) body.expand = expand.join(","); // /search/jql espera string (CSV), não array
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const data = await this.req<{
        issues: JiraIssue[];
        nextPageToken?: string;
        isLast?: boolean;
      }>("POST", "/rest/api/3/search/jql", body);
      all.push(...(data.issues ?? []));
      // cap total (projetos grandes têm milhares de issues; ingestão só precisa de uma janela recente)
      if (maxTotal != null && all.length >= maxTotal) break;
      nextPageToken = data.isLast ? undefined : data.nextPageToken;
    } while (nextPageToken);
    return all;
  }
}

/**
 * Cliente Basic (email + API token). Superfície pública INALTERADA:
 * `new JiraClient(jiraConfigFromEnv())`, `JiraClient.adf(text)`, os 11 métodos.
 */
export class JiraClient extends JiraBase implements JiraProvider {
  private authHeader: string;
  constructor(private cfg: JiraConfig) {
    super();
    this.authHeader =
      "Basic " + Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  }

  protected async getBase() {
    return { baseUrl: this.cfg.baseUrl, authHeader: this.authHeader };
  }

  /** Converte texto simples em ADF (Atlassian Document Format). */
  static adf(text: string) {
    return {
      type: "doc",
      version: 1,
      content: text
        .split("\n")
        .map((line) => ({
          type: "paragraph",
          content: line ? [{ type: "text", text: line }] : [],
        })),
    };
  }
}

/**
 * Cliente OAuth 2.0 (3LO). Resolve access_token + cloudId de `jira_connections`
 * a cada request e renova o token automaticamente quando está perto de expirar.
 */
export class OAuthProvider extends JiraBase implements JiraProvider {
  // Dedupe de refresh concorrente: o refresh_token rotaciona a cada uso, então N
  // requests perto do vencimento não podem disparar N refreshes (revogaria a
  // token family). Todos aguardam o mesmo refresh em voo.
  private static refreshing: Promise<JiraConnection> | null = null;
  // Cache da conexão na instância: evita reler o Supabase a cada request (um
  // sync faz dezenas de chamadas). Revalida só perto do vencimento.
  private cached: JiraConnection | null = null;

  protected async getBase(): Promise<{ baseUrl: string; authHeader: string }> {
    const conn = await this.ensureFreshConnection();
    return {
      baseUrl: `https://api.atlassian.com/ex/jira/${conn.cloud_id}`,
      authHeader: `Bearer ${conn.access_token}`,
    };
  }

  private fresh(conn: JiraConnection): boolean {
    const expMs = Date.parse(conn.expires_at);
    return Number.isFinite(expMs) && expMs - Date.now() > 60_000;
  }

  /** Garante um access_token válido (renova se faltar < ~60s p/ expirar ou se
   *  expires_at for inválido). Usa cache da instância; refresh é deduplicado. */
  private async ensureFreshConnection(): Promise<JiraConnection> {
    if (this.cached && this.fresh(this.cached)) return this.cached;
    const conn = await getJiraConnection();
    if (!conn) {
      throw new Error("Jira não conectado — autorize em /api/jira/connect");
    }
    if (this.fresh(conn)) {
      this.cached = conn;
      return conn;
    }
    if (!OAuthProvider.refreshing) {
      OAuthProvider.refreshing = this.refresh(conn).finally(() => {
        OAuthProvider.refreshing = null;
      });
    }
    this.cached = await OAuthProvider.refreshing;
    return this.cached;
  }

  private async refresh(conn: JiraConnection): Promise<JiraConnection> {
    const clientId = process.env.JIRA_OAUTH_CLIENT_ID;
    const clientSecret = process.env.JIRA_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "JIRA_OAUTH_CLIENT_ID e JIRA_OAUTH_CLIENT_SECRET são obrigatórias para renovar o token."
      );
    }
    if (!conn.refresh_token) {
      throw new Error("Sem refresh_token — reconecte em /api/jira/connect");
    }
    const res = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: conn.refresh_token,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira OAuth refresh → ${res.status}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
    };
    const updated: JiraConnection = {
      ...conn,
      access_token: data.access_token,
      // a Atlassian rotaciona o refresh_token; se vier um novo, guarda-o.
      refresh_token: data.refresh_token ?? conn.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      scopes: data.scope ?? conn.scopes,
    };
    await saveJiraConnection(updated);
    return updated;
  }
}

/**
 * Factory (uso futuro): OAuth quando `JIRA_OAUTH_CLIENT_ID` está setado, senão
 * o cliente Basic. NÃO é usado por scripts/sync — esses seguem com
 * `new JiraClient(jiraConfigFromEnv())`. A conexão do OAuth é resolvida
 * preguiçosamente por request (construção é síncrona).
 */
export function jiraProviderFromEnv(): JiraProvider {
  if (process.env.JIRA_OAUTH_CLIENT_ID) return new OAuthProvider();
  return new JiraClient(jiraConfigFromEnv());
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, any>;
  changelog?: { histories?: JiraHistory[] };
}

export interface JiraHistory {
  id: string;
  created: string;
  items: Array<{ field: string; fieldId?: string; fromString: string | null; toString: string | null }>;
}

/** normaliza o nome do status ao vivo do Jira p/ casar com os nomes dos estágios. */
export function normStageName(name: string): string {
  return /^em andamento$/i.test(name.trim()) ? "In Progress" : name.trim();
}

/** status normalizado (To Do/In Progress/Done) por PAPEL do estágio (delivery = In Progress). */
const DELIVERY_STAGES = new Set(["in progress", "in development", "code review / qa", "ready for release"]);
export function stageToStatus(stage: string): "To Do" | "In Progress" | "Done" {
  const s = stage.toLowerCase().trim();
  if (s === "live / done" || s === "done") return "Done";
  if (DELIVERY_STAGES.has(s)) return "In Progress";
  return "To Do";
}

/** Busca recursiva pelo bloco SPMETA na descrição ADF de uma issue. */
export function extractSpmeta(node: any): any | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = extractSpmeta(n);
      if (r) return r;
    }
    return null;
  }
  if (node.type === "text" && typeof node.text === "string" && node.text.startsWith("SPMETA:")) {
    try {
      return JSON.parse(node.text.slice("SPMETA:".length));
    } catch {
      return null;
    }
  }
  if (node.content) return extractSpmeta(node.content);
  return null;
}

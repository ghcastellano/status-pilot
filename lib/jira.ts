/**
 * lib/jira.ts — cliente mínimo da Jira Cloud REST API v3.
 *
 * Autenticação: Basic com email + API token (base64).
 *   Authorization: Basic base64(email:token)
 * Docs: https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/
 *
 * Usado pelos scripts de populate e sync (Node/tsx) — não vai para o frontend.
 */

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

export class JiraClient {
  private authHeader: string;
  constructor(private cfg: JiraConfig) {
    this.authHeader =
      "Basic " + Buffer.from(`${cfg.email}:${cfg.token}`).toString("base64");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
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

  /** Acesso genérico (para sondagem/capacidades da API). */
  raw<T = any>(method: string, path: string, body?: unknown) {
    return this.request<T>(method, path, body);
  }

  /** Verifica credenciais. Retorna o usuário autenticado. */
  myself() {
    return this.request<{ accountId: string; displayName: string; emailAddress?: string }>(
      "GET",
      "/rest/api/3/myself"
    );
  }

  /** Lista os campos para descobrir o id do "Story Points". */
  fields() {
    return this.request<Array<{ id: string; name: string; custom: boolean }>>(
      "GET",
      "/rest/api/3/field"
    );
  }

  /** Projetos visíveis para o usuário. */
  async projects(): Promise<Array<{ key: string; name: string; id: string }>> {
    const data = await this.request<{ values: Array<{ key: string; name: string; id: string }> }>(
      "GET",
      "/rest/api/3/project/search?maxResults=50"
    );
    return data.values ?? [];
  }

  /** Tipos de issue disponíveis no projeto (nomes variam por idioma/template). */
  async issueTypesForProject(
    projectKey: string
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await this.request<{
      projects: Array<{ issuetypes: Array<{ id: string; name: string }> }>;
    }>(
      "GET",
      `/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`
    );
    return data.projects[0]?.issuetypes ?? [];
  }

  /** Status disponíveis no projeto, agrupados por tipo de issue. */
  projectStatuses(projectKey: string) {
    return this.request<
      Array<{ name: string; statuses: Array<{ id: string; name: string }> }>
    >("GET", `/rest/api/3/project/${projectKey}/statuses`);
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

  createIssue(fields: Record<string, unknown>) {
    return this.request<{ id: string; key: string; self: string }>(
      "POST",
      "/rest/api/3/issue",
      { fields }
    );
  }

  /** Edita campos de uma issue (PUT). Retorna 204. */
  editIssue(issueKey: string, fields: Record<string, unknown>) {
    return this.request<void>("PUT", `/rest/api/3/issue/${issueKey}`, { fields });
  }

  /** Transições disponíveis para uma issue. */
  transitions(issueKey: string) {
    return this.request<{ transitions: Array<{ id: string; name: string; to: { name: string } }> }>(
      "GET",
      `/rest/api/3/issue/${issueKey}/transitions`
    );
  }

  doTransition(issueKey: string, transitionId: string) {
    return this.request<void>("POST", `/rest/api/3/issue/${issueKey}/transitions`, {
      transition: { id: transitionId },
    });
  }

  /** Busca issues por JQL (endpoint novo, pós-deprecação do /search). */
  async searchJql(
    jql: string,
    fields: string[],
    maxResults = 100
  ): Promise<JiraIssue[]> {
    const all: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const body: Record<string, unknown> = { jql, fields, maxResults };
      if (nextPageToken) body.nextPageToken = nextPageToken;
      const data = await this.request<{
        issues: JiraIssue[];
        nextPageToken?: string;
        isLast?: boolean;
      }>("POST", "/rest/api/3/search/jql", body);
      all.push(...(data.issues ?? []));
      nextPageToken = data.isLast ? undefined : data.nextPageToken;
    } while (nextPageToken);
    return all;
  }
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: Record<string, any>;
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

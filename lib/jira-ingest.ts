/**
 * lib/jira-ingest.ts — ingestão de um BOARD REAL do Jira (SOMENTE backend).
 *
 * Diferente do path sintético (SPMETA em lib/sync.ts), aqui derivamos tudo de
 * dados reais: cycle time e stages do CHANGELOG (transições de status), story
 * points do campo descoberto, sprints da Agile API. Espelha o Scrum Maturity
 * Dashboard da Indeed (changelog: início = 1ª entrada "em andamento", fim = 1ª
 * "concluído"). Escreve nas mesmas tabelas issues/sprints que o motor de
 * métricas já consome.
 */
import type { JiraProvider, JiraIssue } from "./jira";
import { getSupabaseAdmin } from "./supabase";
import type { IssueRow, SprintRow, StageStamp, IssueType, IssueStatus, TeamRow } from "./metrics";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function issueTypeOf(name?: string): IssueType {
  const n = (name || "").toLowerCase();
  if (/bug|defect|incident|hotfix/.test(n)) return "bug";
  if (/task|chore|sub-?task|spike/.test(n)) return "task";
  return "story";
}

// kind do estágio: prioriza a CATEGORIA do status (new/indeterminate/done); se
// desconhecida (status renomeado/removido, ou /status 403), cai numa heurística
// por nome — senão um "In Progress" fora do mapa viraria "wait" e zeraria o
// cycle time / flow efficiency (os drivers de tier).
const kindOf = (name: string, cat?: string): StageStamp["kind"] => {
  if (cat === "done") return "done";
  if (cat === "indeterminate") return "active";
  if (cat === "new") return "wait";
  const n = name.toLowerCase();
  if (/done|closed|resolv|complete|released|live|shipped|cancel/.test(n)) return "done";
  if (/progress|doing|develop|review|qa|test|build|deploy|implement|code|andamento|desenvolv/.test(n)) return "active";
  return "wait";
};

// Cycle time — nomes de status que marcam início/fim (lógica do marvin, fonte de verdade).
const IN_PROGRESS_STATUSES = ["in progress", "development", "doing"];
const DONE_STATUSES = ["closed", "done", "resolved", "complete", "completed"];
const incl = (s: string, arr: string[]) => arr.some((x) => s.toLowerCase().includes(x));

const statusFromCategory = (cat?: string): IssueStatus =>
  cat === "done" ? "Done" : cat === "indeterminate" ? "In Progress" : "To Do";

/**
 * Candidatos a campo Story Points, EM ORDEM de preferência. Projetos diferentes
 * usam campos diferentes ("Story Points" company-managed = customfield_10061 na
 * Indeed; "Story point estimate" team-managed). Retornamos TODOS os candidatos e
 * o mapIssue usa o 1º que tiver valor — robusto sem depender de qual projeto é.
 */
async function detectStoryPointsFields(jira: JiraProvider): Promise<string[]> {
  const fallback = ["customfield_10061", "customfield_10016"];
  try {
    const fields = await jira.fields();
    const ids = fields.filter((f) => /story point/i.test(f.name)).map((f) => f.id);
    return Array.from(new Set([...ids, ...fallback]));
  } catch {
    return fallback;
  }
}

/** id do campo "Sprint" (array greenhopper) — p/ membership quando a Agile API não for usada. */
async function detectSprintField(jira: JiraProvider): Promise<string | null> {
  try {
    const fields = await jira.fields();
    return fields.find((f) => f.name === "Sprint")?.id || fields.find((f) => /sprint/i.test(f.name))?.id || null;
  } catch {
    return null;
  }
}

/** mapa nome-do-status (lower) → categoria (new|indeterminate|done), p/ classificar transições do changelog. */
async function fetchStatusCategories(jira: JiraProvider): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const all = await jira.raw<Array<{ name?: string; statusCategory?: { key?: string } }>>("GET", "/rest/api/3/status");
    for (const s of all) if (s?.name) m.set(s.name.toLowerCase(), s.statusCategory?.key ?? "new");
  } catch {
    /* segue com map vazio — cai no fallback pela categoria do status atual */
  }
  return m;
}

/** Constrói stages[] + started_at/done_at a partir do changelog de status. */
function deriveTimeline(
  issue: JiraIssue,
  currentStatus: string,
  currentCat: string | undefined,
  catOf: Map<string, string>
): { stages: StageStamp[]; startedAt: string | null; doneAt: string | null } {
  const created = issue.fields.created as string;
  // categoria conhecida do status (do mapa /status; ou a do status atual). undefined ⇒ heurística por nome.
  const rawCat = (name?: string | null): string | undefined =>
    name ? catOf.get(name.toLowerCase()) ?? (name.toLowerCase() === currentStatus.toLowerCase() ? currentCat : undefined) : undefined;
  const kindFor = (name?: string | null) => kindOf(name ?? "", rawCat(name));

  // transições de status, em ordem cronológica
  const transitions = (issue.changelog?.histories ?? [])
    .flatMap((h) => h.items.filter((it) => it.field === "status").map((it) => ({ at: h.created, from: it.fromString, to: it.toString })))
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  const stages: StageStamp[] = [];
  if (transitions.length === 0) {
    // nunca se moveu → único estágio = status atual, carimbado no created
    stages.push({ key: slug(currentStatus), jira: currentStatus, kind: kindFor(currentStatus), at: created });
  } else {
    // estágio inicial = "from" da 1ª transição, no created. Se from=null (imports),
    // NÃO herda o status atual (poluiria done_at=created p/ issue já Done): assume wait.
    const from = transitions[0].from;
    stages.push({ key: slug(from ?? "inicio"), jira: from ?? "(início)", kind: from ? kindFor(from) : "wait", at: created });
    for (const t of transitions) {
      if (!t.to) continue;
      stages.push({ key: slug(t.to), jira: t.to, kind: kindFor(t.to), at: t.at });
    }
  }

  // START/END do cycle time — lógica do marvin: start = 1º "add ao Sprint"
  // (campo Sprint) senão 1ª entrada em progress/development/doing; end = 1ª
  // transição p/ done, em/após o start.
  const hist = (issue.changelog?.histories ?? []).slice().sort((a, b) => (a.created < b.created ? -1 : 1));
  let startedAt: string | null = null;
  for (const h of hist) {
    if (h.items.some((it) => it.field === "Sprint" && it.toString)) {
      startedAt = h.created;
      break;
    }
  }
  if (!startedAt) {
    for (const h of hist) {
      if (h.items.some((it) => it.field === "status" && it.toString && incl(it.toString, IN_PROGRESS_STATUSES))) {
        startedAt = h.created;
        break;
      }
    }
  }
  let doneAt: string | null = null;
  if (startedAt) {
    const startMs = Date.parse(startedAt);
    for (const h of hist) {
      if (Date.parse(h.created) < startMs) continue;
      if (h.items.some((it) => it.field === "status" && it.toString && incl(it.toString, DONE_STATUSES))) {
        doneAt = h.created;
        break;
      }
    }
  }
  return { stages, startedAt, doneAt };
}

function mapIssue(
  issue: JiraIssue,
  teamId: string,
  spFields: string[],
  sprintField: string | null,
  catOf: Map<string, string>
): IssueRow {
  const f = issue.fields;
  const statusName: string = f.status?.name ?? "To Do";
  const cat: string | undefined = f.status?.statusCategory?.key;
  const { stages, startedAt, doneAt } = deriveTimeline(issue, statusName, cat, catOf);
  // 1º campo candidato de SP que tiver valor numérico (projetos usam campos distintos).
  let story_points: number | null = null;
  for (const id of spFields) {
    const v = f[id];
    const n = typeof v === "number" ? v : v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
    if (n != null) {
      story_points = n;
      break;
    }
  }

  // sprint atual/último a partir do campo Sprint (fallback; membership pode ser sobrescrita depois).
  // id do sprint ESCOPADO por time (mesmo sprint pode existir em >1 board/time sem colidir na pk).
  let sprint_id: string | null = null;
  if (sprintField && Array.isArray(f[sprintField]) && f[sprintField].length) {
    const arr = f[sprintField];
    const last = arr[arr.length - 1];
    sprint_id = last?.id != null ? `${teamId}::${last.id}` : null;
  }

  return {
    // id ESCOPADO por time: a MESMA issue do Jira pode pertencer a 2 boards
    // (times) diferentes — ex.: boards do mesmo projeto — sem violar a pk.
    id: `${teamId}::${issue.key}`,
    team_id: teamId,
    sprint_id,
    epic_key: f.parent?.key ?? null,
    issue_key: issue.key,
    title: f.summary ?? issue.key,
    type: issueTypeOf(f.issuetype?.name),
    status: statusFromCategory(cat),
    current_stage: statusName,
    story_points,
    created_at: f.created,
    discovery_started_at: null,
    discovery_done_at: null,
    committed_at: null,
    started_at: startedAt,
    review_started_at: null,
    done_at: doneAt,
    released_at: (f.resolutiondate as string) ?? doneAt,
    stages,
  };
}

/**
 * Sprints extraídos do campo Sprint das issues (v3) — evita a Agile API
 * (/rest/agile), que a política OAuth do Jira corporativo bloqueia. O campo
 * Sprint traz objetos {id,state,name,startDate,endDate,completeDate,goal}.
 */
function sprintsFromIssues(
  issues: JiraIssue[],
  issueRows: IssueRow[],
  sprintField: string | null,
  teamId: string
): SprintRow[] {
  if (!sprintField) return [];
  const today = new Date().toISOString().slice(0, 10);
  const meta = new Map<string, Omit<SprintRow, "committed_points">>();
  for (const i of issues) {
    const arr = i.fields[sprintField];
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (!s || s.id == null) continue;
      const id = `${teamId}::${s.id}`; // escopado por time (igual ao issue.sprint_id)
      if (meta.has(id)) continue;
      const start = ((s.startDate ?? s.activatedDate ?? "") as string).slice(0, 10) || today;
      const end = ((s.completeDate ?? s.endDate ?? s.startDate ?? "") as string).slice(0, 10) || start;
      const state: SprintRow["state"] = s.state === "closed" ? "closed" : s.state === "active" ? "active" : "future";
      meta.set(id, { id, team_id: teamId, name: s.name ?? id, goal: s.goal ?? null, start_date: start, end_date: end, state });
    }
  }
  const spBy = new Map<string, number>();
  for (const r of issueRows) if (r.sprint_id) spBy.set(r.sprint_id, (spBy.get(r.sprint_id) ?? 0) + (r.story_points ?? 0));
  return Array.from(meta.values()).map((s) => ({ ...s, committed_points: Math.round(spBy.get(s.id) ?? 0) }));
}

/**
 * JQL REAL do board (Agile) → cada board pega SUAS issues, não o projeto
 * inteiro. Board = filtro salvo; buscamos o filtro e sua JQL. Sem a Agile API
 * (ou board sem filtro) retorna null e o caller cai p/ `project = KEY`.
 */
async function boardJql(jira: JiraProvider, boardId: string): Promise<string | null> {
  try {
    const cfg = await jira.raw<{ filter?: { id?: string | number } }>(
      "GET",
      `/rest/agile/1.0/board/${boardId}/configuration`
    );
    const fid = cfg?.filter?.id;
    if (fid == null) return null;
    const filter = await jira.raw<{ jql?: string }>("GET", `/rest/api/3/filter/${fid}`);
    const jql = filter?.jql?.trim();
    if (!jql) return null;
    // remove ORDER BY existente — anexamos o nosso (janela + updated DESC).
    return jql.replace(/\s+order\s+by\s+[\s\S]*$/i, "").trim();
  } catch {
    return null;
  }
}

/**
 * Ingesta um BOARD real do Jira. Escopo por JQL DO BOARD (Agile) quando
 * disponível — senão `project = KEY`. Deriva cycle time/stages do changelog e
 * sprints do campo Sprint. board_type DETECTADO (scrum se há sprints) e corrigido.
 * Retorna nº de issues.
 */
export async function ingestBoard(jira: JiraProvider, team: TeamRow): Promise<number> {
  const projectKey = team.jira_project_key;
  const sb = getSupabaseAdmin();

  const numericBoard = /^\d+$/.test(team.jira_board_id ?? "");
  const [spFields, sprintField, catOf, boardScope] = await Promise.all([
    detectStoryPointsFields(jira),
    detectSprintField(jira),
    fetchStatusCategories(jira),
    numericBoard ? boardJql(jira, team.jira_board_id!) : Promise.resolve(null),
  ]);

  // Escopo: JQL do board (SUAS issues) → fallback projeto inteiro.
  const scope = boardScope ?? (projectKey ? `project = "${projectKey}"` : null);
  if (!scope) throw new Error(`Time ${team.id} sem JQL de board nem jira_project_key.`);

  // Janela: não-Done OU resolvidas nas últimas ~13 semanas; cap 500 issues mais
  // recentes (projetos grandes têm milhares — limite de 60s serverless + p85).
  const jql = `(${scope}) AND (statusCategory != Done OR resolved >= -91d) ORDER BY updated DESC`;
  const fields = ["summary", "issuetype", "status", "created", "resolutiondate", "parent", ...spFields, sprintField].filter(
    (x): x is string => !!x
  );
  const issues = await jira.searchJql(jql, fields, 100, ["changelog"], 500);
  // dedupe por id (issue pode reaparecer na paginação da janela)
  const seen = new Set<string>();
  const issueRows = issues
    .map((i) => mapIssue(i, team.id, spFields, sprintField, catOf))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

  // Sprints do campo Sprint. Tipo detectado: scrum se há sprints, senão kanban.
  const sprintRows = sprintsFromIssues(issues, issueRows, sprintField, team.id);
  const detectedType: TeamRow["board_type"] = sprintRows.length > 0 ? "scrum" : "kanban";

  // FK: issue.sprint_id precisa existir em sprints (ou null)
  const sprintIds = new Set(sprintRows.map((s) => s.id));
  for (const r of issueRows) if (r.sprint_id && !sprintIds.has(r.sprint_id)) r.sprint_id = null;

  // Escrita: sprints antes das issues (FK). delete-then-insert por time.
  await sb.from("issues").delete().eq("team_id", team.id);
  await sb.from("sprints").delete().eq("team_id", team.id);
  if (sprintRows.length) {
    const { error } = await sb.from("sprints").upsert(sprintRows);
    if (error) throw new Error(`sprints ${team.id}: ${error.message}`);
  }
  for (let k = 0; k < issueRows.length; k += 200) {
    const { error } = await sb.from("issues").upsert(issueRows.slice(k, k + 200), { onConflict: "id" });
    if (error) throw new Error(`issues ${team.id}: ${error.message}`);
  }
  // Board da Agile (id numérico) tem tipo REAL — respeita. Projeto v3 (id = key) → detecta.
  const fromAgileBoard = /^\d+$/.test(team.jira_board_id ?? "");
  if (!fromAgileBoard && detectedType !== team.board_type) {
    await sb.from("teams").update({ board_type: detectedType }).eq("id", team.id);
  }
  await sb.from("qa_cache").delete().eq("team_id", team.id);
  return issueRows.length;
}

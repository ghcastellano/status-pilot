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

const statusFromCategory = (cat?: string): IssueStatus =>
  cat === "done" ? "Done" : cat === "indeterminate" ? "In Progress" : "To Do";

/** Story Points field id: "Story point estimate" (team-managed) → "Story Points" → default Indeed. */
async function detectStoryPointsField(jira: JiraProvider): Promise<string> {
  try {
    const fields = await jira.fields();
    const find = (re: RegExp) => fields.find((f) => re.test(f.name))?.id;
    return find(/story point estimate/i) || find(/^story points?$/i) || find(/story point/i) || "customfield_10061";
  } catch {
    return "customfield_10061";
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

  const startedAt = stages.find((s) => s.kind === "active")?.at ?? null;
  const doneAt = stages.find((s) => s.kind === "done")?.at ?? null;
  return { stages, startedAt, doneAt };
}

function mapIssue(
  issue: JiraIssue,
  teamId: string,
  spField: string,
  sprintField: string | null,
  catOf: Map<string, string>
): IssueRow {
  const f = issue.fields;
  const statusName: string = f.status?.name ?? "To Do";
  const cat: string | undefined = f.status?.statusCategory?.key;
  const { stages, startedAt, doneAt } = deriveTimeline(issue, statusName, cat, catOf);
  const spRaw = spField ? f[spField] : null;
  const story_points = typeof spRaw === "number" ? spRaw : spRaw != null && !Number.isNaN(Number(spRaw)) ? Number(spRaw) : null;

  // sprint atual/último a partir do campo Sprint (fallback; membership pode ser sobrescrita depois)
  let sprint_id: string | null = null;
  if (sprintField && Array.isArray(f[sprintField]) && f[sprintField].length) {
    const arr = f[sprintField];
    const last = arr[arr.length - 1];
    sprint_id = last?.id != null ? String(last.id) : null;
  }

  return {
    id: issue.key,
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
      const id = String(s.id);
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
 * Ingesta um PROJETO real do Jira (só /rest/api/3 — sem Agile API). Deriva
 * cycle time/stages do changelog e sprints do campo Sprint das issues.
 * board_type é DETECTADO (scrum se há sprints, senão kanban) e corrigido no time.
 * Retorna nº de issues.
 */
export async function ingestBoard(jira: JiraProvider, team: TeamRow): Promise<number> {
  const projectKey = team.jira_project_key;
  if (!projectKey) throw new Error(`Time ${team.id} sem jira_project_key.`);
  const sb = getSupabaseAdmin();

  const [spField, sprintField, catOf] = await Promise.all([
    detectStoryPointsField(jira),
    detectSprintField(jira),
    fetchStatusCategories(jira),
  ]);

  // Janela: não-Done OU resolvidas nas últimas ~13 semanas; cap 500 issues mais
  // recentes (projetos grandes têm milhares — limite de 60s serverless + p85).
  const jql = `project = "${projectKey}" AND (statusCategory != Done OR resolved >= -91d) ORDER BY updated DESC`;
  const fields = ["summary", "issuetype", "status", "created", "resolutiondate", "parent", spField, sprintField].filter(
    (x): x is string => !!x
  );
  const issues = await jira.searchJql(jql, fields, 100, ["changelog"], 500);
  const issueRows = issues.map((i) => mapIssue(i, team.id, spField, sprintField, catOf));

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
    const { error } = await sb.from("issues").insert(issueRows.slice(k, k + 200));
    if (error) throw new Error(`issues ${team.id}: ${error.message}`);
  }
  if (detectedType !== team.board_type) {
    await sb.from("teams").update({ board_type: detectedType }).eq("id", team.id);
  }
  await sb.from("qa_cache").delete().eq("team_id", team.id);
  return issueRows.length;
}

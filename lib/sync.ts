import { replaceTeamSnapshot } from "./snapshot";
/**
 * lib/sync.ts — sincroniza as ISSUES do Jira para o Supabase (somente backend).
 * Reutilizável pela rota /api/sync (botão "Sincronizar agora") e pelos scripts.
 *
 * Resolve os campos de data REAIS por nome (deploy-safe, sem arquivo local) e lê
 * a granularidade dos estágios do bloco SPMETA. Times/sprints/épicos são config
 * já no banco e não são tocados aqui.
 */
import { jiraProviderFromEnv, extractSpmeta, normStageName, stageToStatus, type JiraProvider } from "./jira";
import { ingestBoard } from "./jira-ingest";
import type { TeamRow } from "./metrics";
import { getSupabaseAdmin } from "./supabase";

// marco (coluna no banco) → nome do custom field de data no Jira
const MILESTONE_FIELD: Record<string, string> = {
  discovery_started_at: "SP Discovery Start",
  discovery_done_at: "SP Discovery Done",
  committed_at: "SP Committed",
  started_at: "SP Dev Start",
  review_started_at: "SP Review Start",
  done_at: "SP Work Done",
  released_at: "SP Released",
};

export interface SyncResult {
  byTeam: { team: string; count: number }[];
  total: number;
}

/**
 * Sincroniza os times ativos a partir do Jira. `onlyTeamId` restringe a UM time
 * (auto-sync em background ao selecionar um board no /config) — bem mais barato
 * que re-sincronizar tudo a cada seleção.
 *
 * `provider` injeta um `JiraProvider` alternativo — usado pelo endpoint Forge
 * Remote, que passa um `ForgeProvider` (asApp) já autenticado. Sem ele, cai na
 * conexão Basic do /config (fallback env). A ingestão em si é idêntica nos dois
 * caminhos: é o que torna "PoC via Basic" e "produto Forge" o MESMO código.
 */
export async function syncIssuesFromJira(
  onlyTeamId?: string,
  provider?: JiraProvider,
  source: "basic" | "forge-asApp" = "basic"
): Promise<SyncResult> {
  // Provider injetado (Forge asApp) ou a conexão Basic do /config (fallback env).
  const jira = provider ?? jiraProviderFromEnv();
  const sb = getSupabaseAdmin();

  // resolve fieldId por nome (deploy-safe)
  const allFields: any[] = await jira.raw("GET", "/rest/api/3/field");
  const byName = new Map(allFields.map((f) => [f.name, f.id]));
  const fieldId: Record<string, string> = {};
  for (const [key, name] of Object.entries(MILESTONE_FIELD)) {
    const id = byName.get(name);
    if (id) fieldId[key] = id;
  }
  const dateFieldIds = Object.values(fieldId);

  // times ATIVOS (config já no banco) — ou só UM, no auto-sync por seleção.
  let query = sb
    .from("teams")
    .select("id, name, board_type, description, jira_project_key, jira_board_id, jira_board_name, active")
    .eq("active", true);
  if (onlyTeamId) query = query.eq("id", onlyTeamId);
  const { data: teams, error } = await query;
  if (error) throw new Error(error.message);

  const byTeam: { team: string; count: number }[] = [];
  for (const team of teams ?? []) {
    // Board REAL do Jira → ingestão via changelog. Sem board_id → path SPMETA (seed).
    if (team.jira_board_id) {
      const count = await ingestBoard(jira, team as TeamRow, source);
      byTeam.push({ team: team.id, count });
      continue;
    }
    const pk = team.jira_project_key as string | null;
    if (!pk) {
      byTeam.push({ team: team.id, count: 0 });
      continue;
    }
    const issues = await jira.searchJql(
      `project = ${pk}`,
      ["summary", "description", "status", ...dateFieldIds],
      300
    );
    const rows = [];
    for (const i of issues) {
      const meta = extractSpmeta(i.fields.description);
      if (!meta) continue;
      const milestone = (key: string) =>
        (fieldId[key] ? i.fields[fieldId[key]] : null) ?? meta[key] ?? null;
      // ESTADO ATUAL vem da coluna AO VIVO do Jira (mover um card + sync reflete aqui);
      // a timeline histórica continua sintética (Jira não backdata).
      const liveStage = i.fields.status?.name ? normStageName(i.fields.status.name) : meta.current_stage;
      rows.push({
        id: i.key,
        team_id: team.id,
        sprint_id: meta.sprint_id,
        epic_key: meta.epic,
        issue_key: i.key,
        title: i.fields.summary,
        type: meta.type,
        status: stageToStatus(liveStage),
        current_stage: liveStage,
        story_points: meta.story_points,
        created_at: meta.created_at,
        discovery_started_at: milestone("discovery_started_at"),
        discovery_done_at: milestone("discovery_done_at"),
        committed_at: milestone("committed_at"),
        started_at: milestone("started_at"),
        review_started_at: milestone("review_started_at"),
        done_at: milestone("done_at"),
        released_at: milestone("released_at"),
        stages: meta.stages ?? [],
      });
    }
    await replaceTeamSnapshot(team.id, rows, null, null, source);
    byTeam.push({ team: team.id, count: rows.length });
  }

  // dados mudaram → invalida o cache de respostas/insights/reports
  // Each successful snapshot invalidates only its own cache inside the transaction.

  return { byTeam, total: byTeam.reduce((a, b) => a + b.count, 0) };
}

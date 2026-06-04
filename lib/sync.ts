/**
 * lib/sync.ts — sincroniza as ISSUES do Jira para o Supabase (somente backend).
 * Reutilizável pela rota /api/sync (botão "Sincronizar agora") e pelos scripts.
 *
 * Resolve os campos de data REAIS por nome (deploy-safe, sem arquivo local) e lê
 * a granularidade dos estágios do bloco SPMETA. Times/sprints/épicos são config
 * já no banco e não são tocados aqui.
 */
import { JiraClient, jiraConfigFromEnv, extractSpmeta } from "./jira";
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

export async function syncIssuesFromJira(): Promise<SyncResult> {
  const jira = new JiraClient(jiraConfigFromEnv());
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

  // times (config já no banco)
  const { data: teams, error } = await sb.from("teams").select("id, jira_project_key");
  if (error) throw new Error(error.message);

  const byTeam: { team: string; count: number }[] = [];
  for (const team of teams ?? []) {
    const pk = team.jira_project_key as string;
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
      rows.push({
        id: i.key,
        team_id: meta.team_id,
        sprint_id: meta.sprint_id,
        epic_key: meta.epic,
        issue_key: i.key,
        title: i.fields.summary,
        type: meta.type,
        status: meta.status,
        current_stage: meta.current_stage,
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
    await sb.from("issues").delete().eq("team_id", team.id);
    for (let k = 0; k < rows.length; k += 200) {
      const res = await sb.from("issues").insert(rows.slice(k, k + 200));
      if (res.error) throw new Error(`issues ${pk}: ${res.error.message}`);
    }
    byTeam.push({ team: team.id, count: rows.length });
  }

  return { byTeam, total: byTeam.reduce((a, b) => a + b.count, 0) };
}

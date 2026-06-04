/**
 * scripts/sync-jira-to-supabase.ts
 * Lê as issues DO JIRA (via API) e grava no Supabase, junto com teams/sprints/
 * epics (config canônica). A timeline de cada issue vem do bloco SPMETA — que
 * foi lido de volta da API do Jira: "os dados vêm do Jira" é literal.
 *
 * Rodar: npx tsx scripts/sync-jira-to-supabase.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { getSupabaseAdmin } from "../lib/supabase";
import { dataset, EPICS } from "./data/cafe-aurora";
import { extractSpmeta } from "./jira-desc";

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  const sb = getSupabaseAdmin();
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  const keyMap: Record<string, string> = existsSync("scripts/.jira-keymap.json")
    ? JSON.parse(readFileSync("scripts/.jira-keymap.json", "utf8"))
    : {};
  // mapa marco→fieldId (campos de data REAIS do Jira); se existir, lê dos campos
  const fmap: Record<string, string> = existsSync("scripts/.jira-datefields.json")
    ? JSON.parse(readFileSync("scripts/.jira-datefields.json", "utf8"))
    : {};
  const dateFieldIds = Object.values(fmap);
  const projectKey = (teamId: string) => (teamId === "espresso" ? cfg.scrumKey : cfg.kanbanKey);

  // 1) teams
  const teamRows = dataset.teams.map((t) => ({
    id: t.id,
    name: t.name,
    board_type: t.board_type,
    description: t.description,
    jira_label: t.jira_label,
    jira_project_key: projectKey(t.id),
  }));
  let r = await sb.from("teams").upsert(teamRows);
  if (r.error) throw new Error("teams: " + r.error.message);
  console.log(`✓ teams: ${teamRows.length}`);

  // 2) sprints
  r = await sb.from("sprints").upsert(dataset.sprints);
  if (r.error) throw new Error("sprints: " + r.error.message);
  console.log(`✓ sprints: ${dataset.sprints.length}`);

  // 3) epics (com a chave real do Jira, do keymap)
  const epicRows = dataset.teams.flatMap((t) =>
    EPICS.map((e) => ({
      team_id: t.id,
      epic_key: e.key,
      name: e.name,
      summary: e.summary,
      jira_key: keyMap[`epic:${projectKey(t.id)}:${e.key}`] ?? null,
    }))
  );
  r = await sb.from("epics").upsert(epicRows);
  if (r.error) throw new Error("epics: " + r.error.message);
  console.log(`✓ epics: ${epicRows.length}`);

  // 4) issues — lidas DO JIRA
  let total = 0;
  for (const team of dataset.teams) {
    const pk = projectKey(team.id);
    const issues = await jira.searchJql(
      `project = ${pk}`,
      ["summary", "description", "status", ...dateFieldIds],
      300
    );
    const rows = [];
    for (const i of issues) {
      const meta = extractSpmeta(i.fields.description);
      if (!meta) continue; // épicos não têm SPMETA → ignorados
      // marco: lê do CAMPO DE DATA real do Jira; fallback no SPMETA
      const milestone = (key: string) =>
        (fmap[key] ? i.fields[fmap[key]] : null) ?? meta[key] ?? null;
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
    // limpa as issues do time e regrava (sync idempotente)
    await sb.from("issues").delete().eq("team_id", team.id);
    for (let k = 0; k < rows.length; k += 200) {
      const slice = rows.slice(k, k + 200);
      const res = await sb.from("issues").insert(slice);
      if (res.error) throw new Error(`issues ${pk}: ` + res.error.message);
    }
    console.log(`✓ ${team.name} (${pk}): ${rows.length} issues do Jira → Supabase`);
    total += rows.length;
  }

  console.log(`\n✓ Sync completo: ${total} issues. Pronto para o dashboard.`);
}

main().catch((e) => {
  console.error("Erro:", e.message || e);
  process.exit(1);
});

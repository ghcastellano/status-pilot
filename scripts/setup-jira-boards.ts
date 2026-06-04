/**
 * scripts/setup-jira-boards.ts
 * Mapeia os 10 status em colunas, na ordem do fluxo, em cada board:
 *   LS (Scrum) e LK (Kanban). Usa a API interna do Jira Software (greenhopper)
 *   — a mesma que a UI usa para configurar colunas.
 *
 * Também renomeia o status de sistema id 3 ("Em andamento") para "In Progress"
 * para manter os termos em inglês no board do Kanban.
 *
 * Rodar: npx tsx scripts/setup-jira-boards.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { SCRUM_STAGES, KANBAN_STAGES, type StageDef } from "./data/cafe-aurora";

const GH_COLUMNS = "/rest/greenhopper/1.0/rapidviewconfig/columns";

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  const me = await jira.myself();
  console.log("✓ autenticado:", me.displayName, "\n");

  // renomeia "Em andamento" (id 3) → "In Progress" (consistência EN)
  try {
    await jira.raw("PUT", "/rest/api/3/statuses", {
      statuses: [{ id: "3", name: "In Progress", statusCategory: "IN_PROGRESS" }],
    });
    console.log("✓ status id 3 renomeado para 'In Progress'");
  } catch (e) {
    console.log("· id 3 não renomeado (segue como está):", (e as Error).message.slice(0, 100));
  }

  const setups = [
    { key: cfg.scrumKey, stages: SCRUM_STAGES },
    { key: cfg.kanbanKey, stages: KANBAN_STAGES },
  ];

  for (const s of setups) {
    const boards: any = await jira.raw("GET", `/rest/agile/1.0/board?projectKeyOrId=${s.key}`);
    const board = boards.values?.[0];
    if (!board) {
      console.log(`✗ board de ${s.key} não encontrado`);
      continue;
    }

    // name → id dos status do projeto
    const groups = await jira.projectStatuses(s.key);
    const nameToId = new Map<string, string>();
    for (const g of groups) for (const st of g.statuses) nameToId.set(st.name.toLowerCase(), st.id);
    const idFor = (stage: StageDef): string | undefined =>
      nameToId.get(stage.jira.toLowerCase()) ??
      (/in progress/i.test(stage.jira) ? nameToId.get("em andamento") : undefined);

    const mappedColumns = s.stages.map((st) => {
      const id = idFor(st);
      if (!id) console.log(`  ! status não encontrado p/ coluna "${st.jira}"`);
      return {
        name: st.jira,
        mappedStatuses: id ? [{ id: String(id) }] : [],
        min: "",
        max: "",
      };
    });

    await jira.raw("PUT", GH_COLUMNS, {
      currentStatisticsField: { id: "none_" },
      rapidViewId: board.id,
      mappedColumns,
    });
    console.log(`✓ ${s.key} (board ${board.id}, ${board.name}): ${mappedColumns.length} colunas mapeadas`);
  }

  console.log("\n✓ Boards configurados. Confira no Jira — colunas na ordem do fluxo.");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

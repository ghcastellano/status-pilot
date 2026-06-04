/**
 * scripts/setup-jira-sprints.ts
 * Cria os sprints reais no board do Scrum (LS), distribui as issues do Espresso
 * em cada sprint e ajusta o estado (fechados S-12..S-15, ativo S-16).
 *
 * Só um sprint pode estar ativo por vez → processa em ordem: cada fechado é
 * criado → recebe issues → iniciado → fechado; o ativo fica aberto no fim.
 *
 * Rodar: npx tsx scripts/setup-jira-sprints.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { dataset } from "./data/cafe-aurora";

const KEYMAP_PATH = "scripts/.jira-keymap.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoStart = (ymd: string) => `${ymd}T09:00:00.000Z`;
const isoEnd = (ymd: string) => `${ymd}T18:00:00.000Z`;

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  const keyMap: Record<string, string> = existsSync(KEYMAP_PATH)
    ? JSON.parse(readFileSync(KEYMAP_PATH, "utf8"))
    : {};
  const saveMap = () => writeFileSync(KEYMAP_PATH, JSON.stringify(keyMap, null, 2));

  // board do Scrum (LS)
  const boards: any = await jira.raw("GET", `/rest/agile/1.0/board?projectKeyOrId=${cfg.scrumKey}`);
  const boardId = boards.values?.[0]?.id;
  console.log("board Scrum:", boardId);

  const sprints = [...dataset.sprints].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  for (const sp of sprints) {
    const mapKey = `sprint:${sp.id}`;
    let sprintId = keyMap[mapKey] ? Number(keyMap[mapKey]) : null;

    // 1) cria (estado future)
    if (!sprintId) {
      const created: any = await jira.raw("POST", "/rest/agile/1.0/sprint", {
        name: sp.name,
        originBoardId: boardId,
        startDate: isoStart(sp.start_date),
        endDate: isoEnd(sp.end_date),
        goal: sp.goal,
      });
      sprintId = created.id;
      keyMap[mapKey] = String(sprintId);
      saveMap();
    }
    console.log(`\n${sp.name} (id ${sprintId}, ${sp.state})`);

    // 2) distribui issues do Espresso desse sprint
    const keys = dataset.issues
      .filter((i) => i.team_id === "espresso" && i.sprint_id === sp.id)
      .map((i) => keyMap[i.id])
      .filter(Boolean);
    for (let k = 0; k < keys.length; k += 50) {
      await jira.raw("POST", `/rest/agile/1.0/sprint/${sprintId}/issue`, {
        issues: keys.slice(k, k + 50),
      });
    }
    console.log(`  ✓ ${keys.length} issues atribuídas`);

    // 3) estado: inicia (e fecha, se for sprint fechado)
    try {
      await jira.raw("POST", `/rest/agile/1.0/sprint/${sprintId}`, {
        state: "active",
        startDate: isoStart(sp.start_date),
        endDate: isoEnd(sp.end_date),
      });
      console.log("  ✓ iniciado");
      await sleep(300);
      if (sp.state === "closed") {
        await jira.raw("POST", `/rest/agile/1.0/sprint/${sprintId}`, { state: "closed" });
        console.log("  ✓ fechado");
      }
    } catch (e) {
      console.log("  · estado:", (e as Error).message.slice(0, 120));
    }
    await sleep(300);
  }

  console.log("\n✓ Sprints configurados. Próximo: cutoff de done no board.");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

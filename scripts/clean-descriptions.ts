/**
 * scripts/clean-descriptions.ts
 * Reescreve as descrições das issues já criadas para o formato LIMPO:
 * texto humano + bloco recolhível (expand) com o SPMETA. Roda sobre o keymap.
 *
 * Rodar: npx tsx scripts/clean-descriptions.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { dataset } from "./data/cafe-aurora";
import { buildDescription } from "./jira-desc";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const jira = new JiraClient(jiraConfigFromEnv());
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  const keyMap: Record<string, string> = existsSync("scripts/.jira-keymap.json")
    ? JSON.parse(readFileSync("scripts/.jira-keymap.json", "utf8"))
    : {};
  const sprintName = (id: string | null) =>
    id ? dataset.sprints.find((s) => s.id === id)?.name ?? null : null;

  let n = 0,
    fail = 0;
  for (const issue of dataset.issues) {
    const jiraKey = keyMap[issue.id];
    if (!jiraKey) continue;
    try {
      await jira.editIssue(jiraKey, {
        description: buildDescription(issue, sprintName(issue.sprint_id)),
      });
      n++;
      if (n % 20 === 0) console.log(`  …${n}`);
      await sleep(90);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${jiraKey}:`, (e as Error).message.slice(0, 120));
    }
  }
  console.log(`\n✓ ${n} descrições limpas${fail ? `, ${fail} falhas` : ""}.`);
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

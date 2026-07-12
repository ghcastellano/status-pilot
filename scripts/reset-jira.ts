/**
 * scripts/reset-jira.ts — apaga TODAS as issues dos projetos LS e LK e limpa o
 * keymap, para um repopulate limpo. NÃO mexe em workflows/status/boards.
 *
 * Rodar: npx tsx scripts/reset-jira.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, rmSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  for (const key of [cfg.scrumKey, cfg.kanbanKey]) {
    const issues = await jira.searchJql(`project = ${key}`, ["summary"], 200);
    console.log(`\n${key}: apagando ${issues.length} issues…`);
    let n = 0;
    for (const i of issues) {
      try {
        await jira.raw("DELETE", `/rest/api/3/issue/${i.key}?deleteSubtasks=true`);
        n++;
        if (n % 20 === 0) console.log(`  …${n}`);
        await sleep(80);
      } catch (e) {
        console.log(`  ✗ ${i.key}:`, (e as Error).message.slice(0, 120));
      }
    }
    console.log(`  ✓ ${n} apagadas de ${key}`);
  }

  const KEYMAP = "scripts/.jira-keymap.json";
  if (existsSync(KEYMAP)) {
    rmSync(KEYMAP);
    console.log("\n✓ keymap removido");
  }
  console.log("Pronto. Próximo: npx tsx scripts/populate-jira.ts");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

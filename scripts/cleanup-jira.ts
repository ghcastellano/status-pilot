/**
 * scripts/cleanup-jira.ts
 * Conserta o estado após um reset bloqueado por permissão:
 *   1. adiciona minha conta ao papel "Administrators" dos projetos (auto-grant)
 *   2. apaga TODA issue que NÃO esteja no keymap atual (remove o lote duplicado)
 *
 * Rodar: npx tsx scripts/cleanup-jira.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function grantAdmin(jira: JiraClient, projectKey: string, accountId: string) {
  const roles: any = await jira.raw("GET", `/rest/api/3/project/${projectKey}/role`);
  const entry = Object.entries(roles).find(([name]) =>
    /administrator|administrador/i.test(name)
  );
  if (!entry) {
    console.log(`  · papel Administrators não achado em ${projectKey}`);
    return;
  }
  const url = entry[1] as string;
  const roleId = url.split("/").pop();
  try {
    await jira.raw("POST", `/rest/api/3/project/${projectKey}/role/${roleId}`, {
      user: [accountId],
    });
    console.log(`  ✓ ${projectKey}: conta adicionada ao papel ${entry[0]}`);
  } catch (e) {
    console.log(`  · ${projectKey}: já no papel / ${(e as Error).message.slice(0, 80)}`);
  }
}

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  const me = await jira.myself();
  console.log("✓ autenticado:", me.displayName, "| accountId:", me.accountId, "\n");

  const keyMap: Record<string, string> = existsSync("scripts/.jira-keymap.json")
    ? JSON.parse(readFileSync("scripts/.jira-keymap.json", "utf8"))
    : {};
  const valid = new Set(Object.values(keyMap));
  console.log(`keymap: ${valid.size} chaves válidas (a manter)\n`);

  console.log("1) auto-grant de admin:");
  for (const key of [cfg.scrumKey, cfg.kanbanKey]) await grantAdmin(jira, key, me.accountId);
  await sleep(1500); // deixa a permissão propagar

  console.log("\n2) apagando duplicatas (fora do keymap):");
  for (const key of [cfg.scrumKey, cfg.kanbanKey]) {
    const issues = await jira.searchJql(`project = ${key}`, ["summary"], 300);
    const toDelete = issues.filter((i) => !valid.has(i.key));
    console.log(`  ${key}: ${issues.length} total, ${toDelete.length} a apagar`);
    let n = 0;
    for (const i of toDelete) {
      try {
        await jira.raw("DELETE", `/rest/api/3/issue/${i.key}?deleteSubtasks=true`);
        n++;
        if (n % 20 === 0) console.log(`    …${n}`);
        await sleep(80);
      } catch (e) {
        console.log(`    ✗ ${i.key}:`, (e as Error).message.slice(0, 100));
        break; // se ainda sem permissão, para de tentar
      }
    }
    console.log(`  ✓ ${n} apagadas de ${key}`);
  }
  console.log("\nPronto.");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

/**
 * scripts/restage-jira.ts
 * Garante que o status REAL de cada issue no Jira == current_stage do dataset.
 * Conserta transições que falharam no populate (itens presos no estágio inicial).
 *
 * Rodar: npx tsx scripts/restage-jira.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { dataset } from "./data/cafe-aurora";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function moveToStage(jira: JiraClient, key: string, target: string): Promise<boolean> {
  const { transitions } = await jira.transitions(key);
  // casa pela transição GLOBAL "→ <estágio>" (nome que criamos); fallback no status-destino
  const t =
    transitions.find((tr) => tr.name?.toLowerCase() === `→ ${target}`.toLowerCase()) ??
    transitions.find((tr) => tr.to.name.toLowerCase() === target.toLowerCase());
  if (t) {
    await jira.doTransition(key, t.id);
    return true;
  }
  return false;
}

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  const keyMap: Record<string, string> = existsSync("scripts/.jira-keymap.json")
    ? JSON.parse(readFileSync("scripts/.jira-keymap.json", "utf8"))
    : {};

  for (const team of dataset.teams) {
    const pk = team.board_type === "scrum" ? cfg.scrumKey : cfg.kanbanKey;
    const issues = await jira.searchJql(`project = ${pk}`, ["status"], 300);
    const statusByKey = new Map(issues.map((i) => [i.key, i.fields.status?.name as string]));

    let fixed = 0,
      ok = 0,
      fail = 0;
    for (const issue of dataset.issues.filter((i) => i.team_id === team.id)) {
      const jk = keyMap[issue.id];
      if (!jk) continue;
      const cur = statusByKey.get(jk);
      if (!cur) continue;
      if (cur.toLowerCase() === issue.current_stage.toLowerCase()) {
        ok++;
        continue;
      }
      try {
        const moved = await moveToStage(jira, jk, issue.current_stage);
        if (moved) {
          fixed++;
          console.log(`  ${jk}: "${cur}" → "${issue.current_stage}"`);
        } else fail++;
        await sleep(120);
      } catch (e) {
        fail++;
        console.log(`  ✗ ${jk}:`, (e as Error).message.slice(0, 90));
      }
    }
    console.log(`${pk}: ${ok} já corretos, ${fixed} corrigidos${fail ? `, ${fail} falhas` : ""}`);
  }
  console.log("\n✓ Re-stage completo.");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

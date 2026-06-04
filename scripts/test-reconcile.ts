/**
 * scripts/test-reconcile.ts
 * Testa que os dados do JIRA batem com o Supabase e com as métricas do dashboard.
 * Lê contagens reais do Jira, do Supabase e recalcula as métricas; faz asserts.
 *
 * Rodar: npx tsx scripts/test-reconcile.ts   (exit !=0 se algo divergir)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { fetchTeamData } from "../lib/data";
import { computeTeamMetrics } from "../lib/metrics";

// nomes de status equivalentes (o id 3 do sistema exibe "Em andamento")
const norm = (s: string) =>
  s.trim().toLowerCase().replace(/^em andamento$/, "in progress");

const isFunnel = (s: string) => /opportunity backlog/i.test(s);
const isDone = (s: string) => /live\s*\/\s*done/i.test(s);
const isDelivery = (s: string) =>
  ["in progress", "in development", "code review / qa", "ready for release"].includes(norm(s));

let pass = 0,
  fail = 0;
function check(label: string, a: number, b: number) {
  const ok = a === b;
  console.log(`  ${ok ? "✓" : "✗"} ${label}: jira/real=${a} app=${b}`);
  ok ? pass++ : fail++;
}

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);

  for (const team of [
    { id: "espresso", pk: cfg.scrumKey },
    { id: "coldbrew", pk: cfg.kanbanKey },
  ]) {
    console.log(`\n── ${team.id} (${team.pk}) ──`);
    // Jira (exclui épicos)
    const jiraIssues = (
      await jira.searchJql(`project = ${team.pk}`, ["status", "issuetype"], 300)
    ).filter((i) => !/epic|épico/i.test(i.fields.issuetype?.name || ""));
    const jStatus = jiraIssues.map((i) => i.fields.status?.name as string);

    const jTotal = jiraIssues.length;
    const jDone = jStatus.filter(isDone).length;
    const jInFlight = jStatus.filter((s) => !isFunnel(s) && !isDone(s)).length;
    const jDelivery = jStatus.filter(isDelivery).length;

    // App (Supabase → métricas)
    const { team: t, sprints, issues } = await fetchTeamData(team.id);
    const m = computeTeamMetrics(t!, sprints, issues);

    check("total de issues", jTotal, m.totals.issues);
    check("entregues (Live/Done)", jDone, m.flow.totalReleased);
    check("WIP em fluxo", jInFlight, m.flow.wip);
    check("delivery WIP", jDelivery, m.flow.deliveryWip);

    // sanidade: Supabase current_stage == Jira status (normalizado), por issue
    const jByKey = new Map(jiraIssues.map((i) => [i.key, norm(i.fields.status?.name || "")]));
    let mismatch = 0;
    for (const i of issues) {
      const real = jByKey.get(i.id);
      if (real && real !== norm(i.current_stage)) mismatch++;
    }
    check("issues com estágio divergente (Jira vs banco)", 0, mismatch);
  }

  console.log(`\n${fail === 0 ? "✅ TODOS PASSARAM" : "❌ FALHAS"}: ${pass} ok, ${fail} falhas`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

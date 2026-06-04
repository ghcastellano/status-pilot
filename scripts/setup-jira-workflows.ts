/**
 * scripts/setup-jira-workflows.ts
 * Cria, 100% via REST API, os workflows dual-track de 10 estágios e associa
 * aos projetos company-managed LS (Scrum) e LK (Kanban).
 *
 * Passos:
 *   1. lê status globais existentes (reusa por nome; cria os que faltam)
 *   2. valida o payload (endpoint de validação) e cria os 2 workflows
 *   3. cria um workflow scheme por projeto (defaultWorkflow = workflow do time)
 *   4. associa cada scheme ao seu projeto (projetos vazios → associação limpa)
 *
 * Rodar: npx tsx scripts/setup-jira-workflows.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { SCRUM_STAGES, KANBAN_STAGES, type StageDef } from "./data/cafe-aurora";

// referências de status DEVEM ser UUID. Mapeia stage.key → uuid estável no run.
const refMap = new Map<string, string>();
const ref = (key: string) => {
  if (!refMap.has(key)) refMap.set(key, randomUUID());
  return refMap.get(key)!;
};

const SCRUM_WF = "Café Lavra Scrum Flow";
const KANBAN_WF = "Café Lavra Kanban Flow";

const TODO_KEYS = new Set([
  "opportunity", "ready_refinement", "product_backlog", "sprint_backlog", "validated", "ready_dev",
]);
function categoryFor(stage: StageDef): "TODO" | "IN_PROGRESS" | "DONE" {
  if (stage.kind === "done") return "DONE";
  if (TODO_KEYS.has(stage.key)) return "TODO";
  return "IN_PROGRESS";
}

function buildWorkflow(name: string, stages: StageDef[]) {
  const statuses = stages.map((s, i) => ({
    statusReference: ref(s.key),
    layout: { x: (i % 5) * 200, y: Math.floor(i / 5) * 150 },
  }));
  const transitions: any[] = [
    { id: "1", name: "Create", type: "INITIAL", toStatusReference: ref(stages[0].key), links: [] },
  ];
  stages.forEach((s, i) => {
    transitions.push({
      id: String(100 + i),
      name: `→ ${s.jira}`,
      type: "GLOBAL",
      toStatusReference: ref(s.key),
      links: [],
    });
  });
  return { name, description: `Fluxo dual-track Café Lavra — ${name}`, statuses, transitions };
}

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  const me = await jira.myself();
  console.log("✓ autenticado:", me.displayName, "\n");

  // 1) status existentes (paginado)
  const existing = new Map<string, { id: string; category: string }>();
  let startAt = 0;
  while (true) {
    const page: any = await jira.raw(
      "GET",
      `/rest/api/3/statuses/search?maxResults=200&startAt=${startAt}`
    );
    for (const s of page.values ?? []) {
      existing.set(s.name.toLowerCase(), { id: s.id, category: s.statusCategory });
    }
    if (page.isLast || !(page.values?.length)) break;
    startAt += page.values.length;
  }
  console.log(`status globais existentes: ${existing.size}`);

  // declarações de status (reusa por nome; cria os que faltam)
  const allStages = [...SCRUM_STAGES, ...KANBAN_STAGES];
  const byKey = new Map<string, StageDef>();
  for (const s of allStages) if (!byKey.has(s.key)) byKey.set(s.key, s);

  const statusDecls = Array.from(byKey.values()).map((s) => {
    const ex = existing.get(s.jira.toLowerCase());
    const base: any = { statusReference: ref(s.key), name: s.jira, statusCategory: categoryFor(s) };
    if (ex) base.id = ex.id;
    return base;
  });
  const toCreate = statusDecls.filter((d: any) => !d.id);
  console.log(`status a criar: ${toCreate.length} (${toCreate.map((d: any) => d.name).join(", ")})\n`);

  const payload = {
    scope: { type: "GLOBAL" },
    statuses: statusDecls,
    workflows: [
      buildWorkflow(SCRUM_WF, SCRUM_STAGES),
      buildWorkflow(KANBAN_WF, KANBAN_STAGES),
    ],
  };

  // 2) valida
  console.log("validando payload…");
  const val: any = await jira.raw("POST", "/rest/api/3/workflows/create/validation", { payload });
  const errs = (val?.errors ?? []).filter((e: any) => e.level === "ERROR");
  if (errs.length) {
    console.log("✗ erros de validação:");
    for (const e of errs) console.log("   -", e.message || JSON.stringify(e));
    process.exit(1);
  }
  console.log("✓ validação ok. Criando workflows…");

  // 2b) cria
  const created: any = await jira.raw("POST", "/rest/api/3/workflows/create", payload);
  const wfNames = (created?.workflows ?? []).map((w: any) => w.name);
  console.log("✓ workflows criados:", wfNames.join(", "));

  // 3 + 4) scheme por projeto + associação
  const projects: any = await jira.raw("GET", "/rest/api/3/project/search?maxResults=50");
  const findProj = (key: string) => projects.values.find((p: any) => p.key === key);

  const setups = [
    { key: cfg.scrumKey, wf: SCRUM_WF, scheme: "Café Lavra Scrum Scheme" },
    { key: cfg.kanbanKey, wf: KANBAN_WF, scheme: "Café Lavra Kanban Scheme" },
  ];

  for (const s of setups) {
    const proj = findProj(s.key);
    if (!proj) {
      console.log(`✗ projeto ${s.key} não encontrado`);
      continue;
    }
    console.log(`\n── ${s.key} (${proj.name}, id ${proj.id}) ──`);
    const scheme: any = await jira.raw("POST", "/rest/api/3/workflowscheme", {
      name: s.scheme,
      description: `Scheme do fluxo ${s.wf}`,
      defaultWorkflow: s.wf,
    });
    console.log(`   ✓ scheme criado: ${s.scheme} (id ${scheme.id})`);

    await jira.raw("PUT", "/rest/api/3/workflowscheme/project", {
      workflowSchemeId: String(scheme.id),
      projectId: String(proj.id),
    });
    console.log(`   ✓ scheme associado ao projeto ${s.key}`);
  }

  console.log("\n✓ Workflows configurados. Próximo: npx tsx scripts/populate-jira.ts");
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});

/**
 * scripts/simulate-jira-flow.ts — SIMULADOR DE FLUXO REAL no Jira (lavrai).
 *
 * NÃO é mock: faz transições REAIS via API (o changelog carimba as datas de
 * verdade, a partir de agora). Rodado repetidamente (cron/agendado), gera
 * andamento e conclusão de cards ao longo do tempo real — cycle time, throughput,
 * velocity e sprints nascem de dados genuínos.
 *
 * Um "tick" (uma execução) faz, para os projetos LS (scrum) e LK (kanban):
 *   1. avança ~60% dos cards em fluxo um passo adiante (transição real);
 *      os outros ~40% "ficam" (rollover natural = falha realista);
 *   2. cria 1–3 cards novos no backlog (mix story/task/bug);
 *   3. [scrum] se a sprint ativa passou da data de fim: fecha, cria e inicia a
 *      próxima, levando os itens não concluídos (rollover) para ela.
 *
 * Uso:  npx tsx --env-file=.env.local scripts/simulate-jira-flow.ts
 * Determinístico o suficiente p/ ser seguro repetir; idempotente por natureza
 * (só empurra o que existe). Cada ação é try/catch — uma falha não aborta o tick.
 */
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";

// ── ordem do fluxo (rank baixo = cedo, alto = done). cobre LS e LK. ──
const RANK: { re: RegExp; rank: number }[] = [
  { re: /opportunity backlog/i, rank: 0 },
  { re: /ready for refinement|backlog refinement/i, rank: 1 },
  { re: /refining|slicing|validated/i, rank: 2 },
  { re: /discovery in progress|prototype|test/i, rank: 3 },
  { re: /sprint backlog|ready for dev/i, rank: 4 },
  { re: /in development|em andamento|in progress/i, rank: 5 },
  { re: /code review|qa/i, rank: 6 },
  { re: /live|done|closed|resolv/i, rank: 7 },
];
const DONE_RANK = 7;
const rankOf = (name: string): number => {
  for (const r of RANK) if (r.re.test(name)) return r.rank;
  return 0;
};

// PRNG determinístico (sem Math.random p/ reprodutibilidade entre runs no mesmo dia)
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES = ["Story", "Task", "Bug"];
const SUMMARIES = [
  "Ajuste no fluxo de checkout",
  "Refino do relatório de métricas",
  "Correção de bug no filtro de período",
  "Melhoria de performance na listagem",
  "Nova regra de validação de formulário",
  "Investigação de erro intermitente",
  "Atualização de dependência crítica",
  "Refatoração do módulo de export",
  "Ajuste de acessibilidade nos botões",
  "Spike: viabilidade de cache distribuído",
];

interface Ctx {
  jira: JiraClient;
  rnd: () => number;
  log: (m: string) => void;
}

/** Avança um passo os cards em fluxo (não-backlog, não-done); ~60% andam. */
async function advanceIssues(ctx: Ctx, projectKey: string) {
  const { jira, rnd, log } = ctx;
  const issues = await jira.searchJql(
    `project = ${projectKey} AND statusCategory != Done ORDER BY updated ASC`,
    ["summary", "status"],
    100,
    undefined,
    100
  );
  let moved = 0;
  for (const i of issues) {
    const cur = i.fields.status?.name ?? "";
    const curRank = rankOf(cur);
    if (curRank >= DONE_RANK) continue;
    // ~40% ficam parados (rollover/falha realista)
    if (rnd() < 0.4) continue;
    try {
      const { transitions } = await jira.transitions(i.key);
      // escolhe a transição que leva ao MENOR rank estritamente > atual (um passo)
      const fwd = transitions
        .map((t) => ({ t, r: rankOf(t.to?.name ?? "") }))
        .filter((x) => x.r > curRank)
        .sort((a, b) => a.r - b.r)[0];
      if (!fwd) continue;
      await jira.doTransition(i.key, fwd.t.id);
      moved++;
      log(`  ${projectKey} ${i.key}: ${cur} → ${fwd.t.to.name}`);
    } catch (e) {
      log(`  ${projectKey} ${i.key}: transição falhou (${(e as Error).message.slice(0, 80)})`);
    }
  }
  log(`${projectKey}: ${moved} cards avançaram (de ${issues.length} em fluxo)`);
}

/** Cria 1–3 cards novos no backlog. */
async function createNew(ctx: Ctx, projectKey: string) {
  const { jira, rnd, log } = ctx;
  // tipos disponíveis no projeto (nomes variam)
  const types = await jira.issueTypesForProject(projectKey).catch(() => []);
  const typeByName = new Map(types.map((t) => [t.name.toLowerCase(), t.id]));
  const pickType = (want: string) => {
    const id = typeByName.get(want.toLowerCase());
    if (id) return id;
    // fallback: primeiro tipo não-subtask
    return types.find((t) => !/sub/i.test(t.name))?.id ?? types[0]?.id;
  };
  const n = 1 + Math.floor(rnd() * 3);
  let created = 0;
  for (let k = 0; k < n; k++) {
    const typeName = TYPES[Math.floor(rnd() * TYPES.length)];
    const typeId = pickType(typeName);
    if (!typeId) break;
    const summary = SUMMARIES[Math.floor(rnd() * SUMMARIES.length)];
    try {
      const res = await jira.createIssue({
        project: { key: projectKey },
        issuetype: { id: typeId },
        summary,
      });
      created++;
      log(`  ${projectKey} novo ${res.key}: ${typeName} — ${summary}`);
    } catch (e) {
      log(`  ${projectKey} criar card falhou (${(e as Error).message.slice(0, 100)})`);
    }
  }
  log(`${projectKey}: ${created} cards novos`);
}

/** [scrum] fecha a sprint vencida e abre a próxima, levando o rollover. */
async function rollSprint(ctx: Ctx, boardId: number, projectKey: string) {
  const { jira, log } = ctx;
  const data: any = await jira
    .raw("GET", `/rest/agile/1.0/board/${boardId}/sprint?state=active&maxResults=1`)
    .catch(() => ({ values: [] }));
  const active = data.values?.[0];
  if (!active) {
    log(`${projectKey}: sem sprint ativa (nada a rolar)`);
    return;
  }
  const end = active.endDate ? Date.parse(active.endDate) : NaN;
  const nowIso = new Date().toISOString();
  if (!Number.isFinite(end) || end > Date.now()) {
    log(`${projectKey}: sprint "${active.name}" ainda dentro do prazo (fim ${active.endDate ?? "?"})`);
    return;
  }
  // itens não concluídos da sprint ativa → rollover
  const incomplete = await jira.searchJql(
    `sprint = ${active.id} AND statusCategory != Done`,
    ["summary"],
    100,
    undefined,
    100
  );
  try {
    // fecha a sprint vencida
    await jira.raw("POST", `/rest/agile/1.0/sprint/${active.id}`, { state: "closed" });
    log(`${projectKey}: sprint "${active.name}" fechada`);
    // cria a próxima (2 semanas), inicia e leva o rollover
    const num = Number(String(active.name).match(/(\d+)/)?.[1] ?? 0) + 1;
    const start = new Date();
    const endNext = new Date(Date.now() + 14 * 86400000);
    const created: any = await jira.raw("POST", "/rest/agile/1.0/sprint", {
      name: `Sprint ${num}`,
      originBoardId: boardId,
      startDate: start.toISOString(),
      endDate: endNext.toISOString(),
    });
    await jira.raw("POST", `/rest/agile/1.0/sprint/${created.id}`, {
      state: "active",
      startDate: start.toISOString(),
      endDate: endNext.toISOString(),
    });
    log(`${projectKey}: sprint "Sprint ${num}" criada e iniciada (fim ${endNext.toISOString().slice(0, 10)})`);
    if (incomplete.length) {
      await jira.raw("POST", `/rest/agile/1.0/sprint/${created.id}/issue`, {
        issues: incomplete.map((i) => i.key),
      });
      log(`${projectKey}: ${incomplete.length} itens não concluídos levados p/ a nova sprint (rollover)`);
    }
  } catch (e) {
    log(`${projectKey}: roll de sprint falhou (${(e as Error).message.slice(0, 120)})`);
  }
  void nowIso;
}

async function main() {
  const jira = new JiraClient(jiraConfigFromEnv());
  // seed do dia (determinístico por data — passa a data via env p/ evitar Date.now no core)
  const daySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
  const rnd = mulberry32(daySeed);
  const log = (m: string) => console.log(m);
  const ctx: Ctx = { jira, rnd, log };

  const projects: { key: string; board: number; scrum: boolean }[] = [
    { key: "LS", board: 4, scrum: true },
    { key: "LK", board: 5, scrum: false },
  ];

  for (const p of projects) {
    log(`\n=== ${p.key} (${p.scrum ? "scrum" : "kanban"}) ===`);
    if (p.scrum) await rollSprint(ctx, p.board, p.key);
    await advanceIssues(ctx, p.key);
    await createNew(ctx, p.key);
  }
  log("\n✔ tick concluído");
}

main().catch((e) => {
  console.error("ERRO:", (e as Error).message);
  process.exit(1);
});

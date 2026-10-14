/**
 * scripts/seed-mock.ts — semeia DADOS MOCADOS (100% fictícios) para demonstração.
 *
 * Times: "Time Phoenix" (scrum, PHX-*) e "Time Aurora" (kanban, AUR-*), com
 * jira_board_id = null ⇒ o sync do Jira e o resync transparente os IGNORAM.
 * Gera issues/sprints sintéticos plausíveis (cycle time, say-do, bugs, aging),
 * grava no Neon e roda a análise retroativa (metrics_history).
 *
 * Idempotente. Rodar: npx tsx --env-file=.env.local scripts/seed-mock.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDatabase } from "../lib/db";
import { storeMaturityHistory } from "../lib/maturity-history";
import type { TeamRow, SprintRow, IssueRow, StageStamp } from "../lib/metrics";

const DAY = 86_400_000;
const NOW = Date.now();

// PRNG determinístico (reproduzível)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const TITLES = [
  "Ajustar fluxo de onboarding", "Refatorar serviço de notificações", "Novo filtro de busca",
  "Melhorar tempo de carregamento", "Corrigir validação de formulário", "Integração com gateway de pagamento",
  "Painel de preferências do usuário", "Exportação de relatório CSV", "Testes de regressão do checkout",
  "Atualizar biblioteca de UI", "Cache de resultados de busca", "Padronizar mensagens de erro",
  "Suporte a tema escuro", "Otimizar consulta de pedidos", "Webhook de status de entrega",
  "Revisar política de retries", "Acessibilidade na tela de login", "Compactar imagens do catálogo",
];
const EPICS = [
  { key: "onboarding", name: "Onboarding" },
  { key: "checkout", name: "Checkout" },
  { key: "catalogo", name: "Catálogo" },
  { key: "plataforma", name: "Plataforma" },
];

/** timeline de uma issue entregue: To Do → In Progress → (Review) → Done. */
function doneTimeline(createdMs: number, startMs: number, doneMs: number): StageStamp[] {
  const stages: StageStamp[] = [{ key: "to-do", jira: "To Do", kind: "wait", at: iso(createdMs) }];
  stages.push({ key: "in-progress", jira: "In Progress", kind: "active", at: iso(startMs) });
  if (doneMs - startMs > 2 * DAY && rnd() < 0.7) {
    // pausa em review (espera) — alimenta flow efficiency < 100%
    const revAt = startMs + (doneMs - startMs) * between(0.5, 0.8);
    stages.push({ key: "code-review", jira: "Code Review", kind: "wait", at: iso(revAt) });
    stages.push({ key: "done", jira: "Done", kind: "done", at: iso(doneMs) });
  } else {
    stages.push({ key: "done", jira: "Done", kind: "done", at: iso(doneMs) });
  }
  return stages;
}

function wipTimeline(createdMs: number, startMs: number | null): StageStamp[] {
  const stages: StageStamp[] = [{ key: "to-do", jira: "To Do", kind: "wait", at: iso(createdMs) }];
  if (startMs != null) stages.push({ key: "in-progress", jira: "In Progress", kind: "active", at: iso(startMs) });
  return stages;
}

interface Built { team: TeamRow; sprints: SprintRow[]; issues: IssueRow[] }

/** Scrum: 8 sprints fechadas + 1 ativa (2 semanas cada); say-do ~70–95%. */
function buildPhoenix(): Built {
  const team: TeamRow = {
    id: "mock-phoenix", name: "Time Phoenix", board_type: "scrum",
    description: "Time fictício de demonstração (dados mocados)",
    jira_project_key: "PHX", jira_board_id: null, jira_board_name: null, active: true,
  };
  const sprints: SprintRow[] = [];
  const issues: IssueRow[] = [];
  let seq = 1;

  const SPRINTS = 9; // 8 fechadas + 1 ativa
  const activeStart = NOW - 6 * DAY; // ativa no dia 6 de 14
  for (let k = 0; k < SPRINTS; k++) {
    const idx = SPRINTS - 1 - k; // 0 = mais antiga
    const start = activeStart - (SPRINTS - 1 - idx) * 14 * DAY;
    const end = start + 13 * DAY;
    const state: SprintRow["state"] = end < NOW ? "closed" : "active";
    const id = `mock-phoenix::sp-${idx + 1}`;
    const nIssues = Math.round(between(10, 14));
    let committed = 0, completed = 0;
    const doneRatio = state === "closed" ? between(0.68, 0.95) : between(0.3, 0.5);

    for (let j = 0; j < nIssues; j++) {
      const sp = pick([1, 2, 3, 3, 5, 5, 8]);
      committed += sp;
      const isBug = rnd() < 0.08;
      const createdMs = start - between(2, 10) * DAY;
      const willDone = j < Math.round(nIssues * doneRatio);
      const startMs = start + between(0, 4) * DAY;
      let done_at: string | null = null;
      let stages: StageStamp[];
      let status: IssueRow["status"] = "In Progress";
      let current = "In Progress";
      if (willDone) {
        // cycle time alvo: p50 ~4d, p85 ~9d, outlier raro
        const cycle = rnd() < 0.06 ? between(12, 18) : between(1.5, 9.5);
        const doneMs = Math.min(startMs + cycle * DAY, end - between(0, 1) * DAY);
        done_at = iso(doneMs);
        stages = doneTimeline(createdMs, startMs, doneMs);
        status = "Done"; current = "Done";
        completed += sp;
      } else {
        stages = state === "closed" ? wipTimeline(createdMs, startMs) : wipTimeline(createdMs, rnd() < 0.6 ? startMs : null);
        status = stages.length > 1 ? "In Progress" : "To Do";
        current = stages[stages.length - 1].jira;
      }
      const key = `PHX-${seq++}`;
      issues.push({
        id: `mock-phoenix::${key}`, team_id: team.id, sprint_id: id,
        epic_key: pick(EPICS).key, issue_key: key,
        title: `${pick(TITLES)} (${key})`, type: isBug ? "bug" : rnd() < 0.2 ? "task" : "story",
        status, current_stage: current, story_points: sp,
        created_at: iso(createdMs), discovery_started_at: null, discovery_done_at: null,
        committed_at: null, started_at: stages.length > 1 ? stages[1].at : null,
        review_started_at: null, done_at, released_at: done_at, stages,
      });
    }
    sprints.push({
      id, team_id: team.id, name: `Phoenix Sprint ${idx + 1}`, goal: null,
      start_date: day(start), end_date: day(end),
      committed_points: committed,
      completed_points: state === "closed" ? Math.round(completed) : 0,
      state,
    });
  }
  return { team, sprints, issues };
}

/** Kanban: fluxo contínuo de 12 semanas + WIP com itens envelhecidos. */
function buildAurora(): Built {
  const team: TeamRow = {
    id: "mock-aurora", name: "Time Aurora", board_type: "kanban",
    description: "Time fictício de demonstração (dados mocados)",
    jira_project_key: "AUR", jira_board_id: null, jira_board_name: null, active: true,
  };
  const issues: IssueRow[] = [];
  let seq = 1;

  // entregues: ~7/semana por 12 semanas
  for (let w = 12; w >= 1; w--) {
    const n = Math.round(between(5, 9));
    for (let j = 0; j < n; j++) {
      const doneMs = NOW - w * 7 * DAY + between(0, 6.5) * DAY;
      const cycle = rnd() < 0.08 ? between(14, 25) : between(1, 10);
      const startMs = doneMs - cycle * DAY;
      const createdMs = startMs - between(1, 12) * DAY;
      const isBug = rnd() < 0.1;
      const key = `AUR-${seq++}`;
      issues.push({
        id: `mock-aurora::${key}`, team_id: team.id, sprint_id: null,
        epic_key: pick(EPICS).key, issue_key: key,
        title: `${pick(TITLES)} (${key})`, type: isBug ? "bug" : rnd() < 0.25 ? "task" : "story",
        status: "Done", current_stage: "Done", story_points: null,
        created_at: iso(createdMs), discovery_started_at: null, discovery_done_at: null,
        committed_at: null, started_at: iso(startMs), review_started_at: null,
        done_at: iso(doneMs), released_at: iso(doneMs), stages: doneTimeline(createdMs, startMs, doneMs),
      });
    }
  }
  // WIP atual: 10 itens, 3 envelhecidos (>12d em progresso)
  for (let j = 0; j < 10; j++) {
    const aged = j < 3;
    const startMs = NOW - (aged ? between(12, 25) : between(0.5, 6)) * DAY;
    const createdMs = startMs - between(1, 8) * DAY;
    const key = `AUR-${seq++}`;
    issues.push({
      id: `mock-aurora::${key}`, team_id: team.id, sprint_id: null,
      epic_key: pick(EPICS).key, issue_key: key,
      title: `${pick(TITLES)} (${key})`, type: rnd() < 0.1 ? "bug" : "story",
      status: "In Progress", current_stage: "In Progress", story_points: null,
      created_at: iso(createdMs), discovery_started_at: null, discovery_done_at: null,
      committed_at: null, started_at: iso(startMs), review_started_at: null,
      done_at: null, released_at: null, stages: wipTimeline(createdMs, startMs),
    });
  }
  return { team, sprints: [], issues };
}

async function main() {
  const sb = getDatabase();
  for (const built of [buildPhoenix(), buildAurora()]) {
    const { team, sprints, issues } = built;
    // idempotente: recria o time mock (cascade limpa filhos)
    await sb.delete("teams", { where: { ["id"]: team.id } });
    let res = await sb.insert("teams", { ...team, last_synced_at: null }, {  });
    if (res.error) throw new Error(`teams ${team.id}: ${res.error.message}`);
    res = await sb.insert("epics", EPICS.map((e) => ({ team_id: team.id, epic_key: e.key, name: e.name, summary: null, jira_key: null })), {  });
    if (res.error) throw new Error(`epics ${team.id}: ${res.error.message}`);
    if (sprints.length) {
      res = await sb.insert("sprints", sprints, {  });
      if (res.error) throw new Error(`sprints ${team.id}: ${res.error.message}`);
    }
    for (let k = 0; k < issues.length; k += 200) {
      res = await sb.insert("issues", issues.slice(k, k + 200), {  });
      if (res.error) throw new Error(`issues ${team.id}: ${res.error.message}`);
    }
    const pts = await storeMaturityHistory(sb, team, sprints, issues);
    console.log(`✓ ${team.name}: ${issues.length} issues, ${sprints.length} sprints, ${pts} pontos de histórico`);
  }
  console.log("\n✓ Seed mocado completo.");
}

main().catch((e) => {
  console.error("Erro:", e.message || e);
  process.exit(1);
});

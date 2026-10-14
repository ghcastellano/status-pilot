/**
 * scripts/seed-coaching-demo.ts — semeia dados de coaching de demonstração
 * (planos, experimentos, sinais comportamentais) para os dois times, para que
 * o Coaching Hub apareça "vivo" já no primeiro acesso. Idempotente.
 *
 * Rodar: npm run db:seed:coaching
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getDatabase } from "../lib/db";

const PLANS = [
  {
    team_id: "espresso",
    coaching: true,
    coach: "Gustavo Castellano",
    engaged_at: "2026-04-08T12:00:00Z",
    main_gap: "Flow efficiency baixa — itens ficam parados em Code Review",
    hypothesis: "Reduzir WIP em revisão + revisor dedicado sobe o flow efficiency",
    next_step: "Definir WIP limit no Code Review nesta sprint",
    ask: "Alocar 1 revisor sênior 2h/dia por 3 sprints",
    review_at: "2026-07-15",
  },
  {
    team_id: "coldbrew",
    coaching: true,
    coach: "Gustavo Castellano",
    engaged_at: "2026-03-18T12:00:00Z",
    main_gap: "Sustentar o fluxo — evitar aging spikes em picos de demanda",
    hypothesis: "SLE explícito por classe de serviço mantém a cauda curta",
    next_step: "Publicar SLE + alertas de aging no board",
    ask: null,
    review_at: "2026-07-20",
  },
];

const ASSESSMENTS = [
  {
    team_id: "espresso",
    signals: {
      pull_not_push: "consistent",
      psych_safety: "consistent",
      team_stability: "consistent",
      commit_realistic: "emerging",
      rotating_facilitation: "emerging",
      impediments_self: "emerging",
      dod_discipline: "not_yet",
      ceremonies: "not_yet",
      scope_churn: "not_yet",
    },
    note: "Boa base de time; disciplina de DoD e cerimônias ainda emergindo.",
  },
  {
    team_id: "coldbrew",
    signals: {
      pull_not_push: "consistent",
      psych_safety: "consistent",
      team_stability: "consistent",
      rotating_facilitation: "consistent",
      impediments_self: "consistent",
      commit_realistic: "consistent",
      ceremonies: "emerging",
      scope_churn: "emerging",
      dod_discipline: "not_yet",
    },
    note: "Time maduro em ownership; candidato a graduação.",
  },
];

const EXPERIMENTS = [
  // Espresso
  {
    team_id: "espresso",
    pillar: "flow",
    metric: "Cycle p85/p50",
    behavior: "Fatiar itens grandes antes da sprint (slicing)",
    hypothesis: "Itens menores encurtam a cauda do cycle time",
    outcome: null,
    status: "active",
  },
  {
    team_id: "espresso",
    pillar: "quality",
    metric: "Rework (proxy)",
    behavior: "Integrar Dev+QA na DoD; teste entra mais cedo",
    hypothesis: "DoD mais forte reduz bugs que voltam",
    outcome: null,
    status: "active",
  },
  {
    team_id: "espresso",
    pillar: "flow",
    metric: "Predictability",
    behavior: "Planejar pela velocity recente (yesterday's weather)",
    hypothesis: "Compromissos realistas estabilizam a velocity",
    outcome: "Velocity CV caiu e estabilizou; say-do voltou à banda saudável",
    status: "done",
  },
  // Cold Brew
  {
    team_id: "coldbrew",
    pillar: "ownership",
    metric: "Pull discipline",
    behavior: "Escalonar blockers por idade no fluxo (aging alerts)",
    hypothesis: "Time resolve impedimentos sem esperar o coach",
    outcome: null,
    status: "active",
  },
  {
    team_id: "coldbrew",
    pillar: "flow",
    metric: "Cycle p85/p50",
    behavior: "SLE explícito por classe de serviço",
    hypothesis: "SLE visível puxa a cauda do cycle time pra baixo",
    outcome: null,
    status: "active",
  },
];

async function main() {
  const sb = getDatabase();

  const p = await sb.upsert("coaching_plans", PLANS.map((x) => ({ ...x, updated_at: new Date().toISOString() })), { onConflict: "team_id" });
  if (p.error) throw new Error("plans: " + p.error.message);
  console.log(`✓ planos: ${PLANS.length}`);

  const a = await sb.upsert("coaching_assessments", ASSESSMENTS.map((x) => ({ ...x, updated_at: new Date().toISOString() })), { onConflict: "team_id" });
  if (a.error) throw new Error("assessments: " + a.error.message);
  console.log(`✓ assessments: ${ASSESSMENTS.length}`);

  // experimentos: limpa e regrava (idempotente)
  for (const teamId of ["espresso", "coldbrew"]) {
    await sb.delete("coaching_experiments", { where: { ["team_id"]: teamId } });
  }
  const e = await sb.insert("coaching_experiments", EXPERIMENTS, {  });
  if (e.error) throw new Error("experiments: " + e.error.message);
  console.log(`✓ experimentos: ${EXPERIMENTS.length}`);

  console.log("\n✓ Seed de coaching demo completo.");
}

main().catch((err) => {
  console.error("Erro:", err.message || err);
  process.exit(1);
});

/**
 * lib/coaching.ts — lógica pura do pilar Ownership (comportamental) e dos
 * experimentos de coaching. Client-safe (sem imports de servidor).
 *
 * 9 sinais comportamentais: 5 agnósticos de método + 4 com wording por método.
 * Rubrica: not_yet (0) · emerging (1) · consistent (2). Não avaliado = 0.
 * behavioralReadiness NÃO entra no tier quantitativo — alimenta o gate de graduação.
 */
import type { BoardType } from "./metrics";
import type { Pillar, Tier } from "./maturity";

export type SignalValue = "not_yet" | "emerging" | "consistent";

export const RUBRIC: Record<SignalValue, { label: string; score: 0 | 1 | 2 }> = {
  not_yet: { label: "Ainda não", score: 0 },
  emerging: { label: "Emergindo", score: 1 },
  consistent: { label: "Consistente", score: 2 },
};
export const RUBRIC_ORDER: SignalValue[] = ["not_yet", "emerging", "consistent"];

export interface SignalDef {
  key: string;
  label: string; // já resolvido por método
}

/** Os 9 sinais — labels resolvidos pelo método do time. */
export function signalDefs(boardType: BoardType): SignalDef[] {
  const scrum = boardType === "scrum";
  return [
    // 4 com variante por método
    { key: "commit_realistic", label: scrum ? "Compromissos de sprint realistas" : "WIP limits respeitados" },
    { key: "scope_churn", label: scrum ? "Scope churn sob controle" : "Cadência de replenishment definida" },
    { key: "ceremonies", label: scrum ? "Cerimônias efetivas" : "Revisão de fluxo cadenciada" },
    { key: "dod_discipline", label: scrum ? "Disciplina de DoD (Done limpo)" : "Política de pull/SLE explícita" },
    // 5 compartilhados
    { key: "pull_not_push", label: "Trabalho é puxado, não empurrado" },
    { key: "rotating_facilitation", label: "Facilitação rotaciona no time" },
    { key: "impediments_self", label: "Impedimentos resolvidos pelo time" },
    { key: "psych_safety", label: "Segurança psicológica" },
    { key: "team_stability", label: "Composição do time estável" },
  ];
}

export type ReadinessLabel = "not_assessed" | "forming" | "developing" | "ready";

export interface Readiness {
  pct: number | null;
  label: ReadinessLabel;
  rated: number;
  total: number;
}

export const READINESS_META: Record<ReadinessLabel, { label: string; tone: string }> = {
  not_assessed: { label: "Não avaliado", tone: "text-muted-foreground" },
  forming: { label: "Formando", tone: "text-destructive" },
  developing: { label: "Desenvolvendo", tone: "text-amber-600" },
  ready: { label: "Pronto", tone: "text-primary" },
};

export function behavioralReadiness(signals: Record<string, string>): Readiness {
  const keys = signalDefs("scrum").map((s) => s.key); // keys são iguais nos dois métodos
  const total = keys.length;
  const rated = keys.filter((k) => signals[k] && signals[k] in RUBRIC).length;
  if (rated === 0) return { pct: null, label: "not_assessed", rated: 0, total };
  const sum = keys.reduce((acc, k) => acc + (RUBRIC[signals[k] as SignalValue]?.score ?? 0), 0);
  const pct = Math.round((sum / (total * 2)) * 100);
  const label: ReadinessLabel = pct >= 75 ? "ready" : pct >= 40 ? "developing" : "forming";
  return { pct, label, rated, total };
}

/** Pronto pra revisar graduação: métricas em Gold+ E sinais fortes. */
export function graduationReady(tier: Tier | null, pct: number | null): boolean | null {
  if (tier == null || pct == null) return null;
  return tier >= 2 && pct >= 75;
}

// ── Experimentos ─────────────────────────────────────────────────────
export type ExperimentStatus = "active" | "done" | "dropped";

export interface Experiment {
  id: number;
  team_id: string;
  pillar: Pillar;
  metric: string | null;
  behavior: string;
  hypothesis: string | null;
  outcome: string | null;
  status: ExperimentStatus;
  created_at: string;
}

export interface ExperimentTemplate {
  pillar: Pillar;
  metric: string;
  behavior: string;
  hypothesis: string;
}

export function experimentTemplates(boardType: BoardType): ExperimentTemplate[] {
  if (boardType === "scrum") {
    return [
      {
        pillar: "flow",
        metric: "Predictability",
        behavior: "Planejar pela velocity recente (yesterday's weather)",
        hypothesis: "Compromissos realistas estabilizam a velocity (CV cai).",
      },
      {
        pillar: "quality",
        metric: "Rework (proxy)",
        behavior: "Integrar Dev+QA na DoD; teste entra mais cedo",
        hypothesis: "DoD mais forte reduz bugs que voltam.",
      },
      {
        pillar: "flow",
        metric: "Cycle p85/p50",
        behavior: "Fatiar itens grandes antes da sprint (slicing)",
        hypothesis: "Itens menores encurtam a cauda do cycle time.",
      },
      {
        pillar: "ownership",
        metric: "Facilitação",
        behavior: "Rotacionar facilitação de daily e retro",
        hypothesis: "Rotação aumenta ownership das cerimônias.",
      },
    ];
  }
  return [
    {
      pillar: "quality",
      metric: "WIP/Aging breach",
      behavior: "Impor WIP limit na coluna gargalo (Code Review)",
      hypothesis: "Menos WIP → itens envelhecem menos que o SLE.",
    },
    {
      pillar: "flow",
      metric: "Throughput stability",
      behavior: "Definir cadência de replenishment semanal",
      hypothesis: "Entrada regular estabiliza o throughput.",
    },
    {
      pillar: "flow",
      metric: "Cycle p85/p50",
      behavior: "Política explícita de SLE por classe de serviço",
      hypothesis: "SLE visível puxa a cauda do cycle time pra baixo.",
    },
    {
      pillar: "ownership",
      metric: "Pull discipline",
      behavior: "Escalonar blockers por idade no fluxo (aging alerts)",
      hypothesis: "Time passa a resolver impedimentos sem esperar o coach.",
    },
  ];
}

// ── Plano de coaching ────────────────────────────────────────────────
export interface CoachingPlan {
  team_id: string;
  coaching: boolean;
  coach: string | null;
  engaged_at: string | null;
  main_gap: string | null;
  hypothesis: string | null;
  next_step: string | null;
  ask: string | null;
  review_at: string | null;
}

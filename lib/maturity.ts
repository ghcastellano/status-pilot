/**
 * lib/maturity.ts — FONTE ÚNICA DE VERDADE do modelo de maturidade dual.
 *
 * Modelo "weakest-link": o tier do time é o min() dos tiers de cada métrica do seu
 * método. 3 tiers metálicos: Silver (1) · Gold (2) · Platinum (3).
 *
 * Estrutura de 3 pilares (compartilhada Scrum/Kanban):
 *   • Predictability / Flow  → quant, entra no min()
 *   • Flow & Quality         → quant, entra no min()
 *   • Ownership              → SÓ sinais comportamentais (não entra no min() quantitativo)
 *
 * O board_type decide qual conjunto de métricas se aplica. Métricas em UNIDADES
 * NATURAIS (dias, %) — sem razão/CV — para não exigir legenda (KISS). Say-Do (Scrum)
 * é a métrica de confiabilidade e ENTRA no tier; a nuance de sub-commit (>110%) vira
 * caption, não penaliza. Thresholds propostos, a calibrar com dados reais.
 */
import type { TeamMetrics, BoardType } from "./metrics";

export type Tier = 1 | 2 | 3;
export type TierToken = "silver" | "gold" | "platinum";
export type Pillar = "flow" | "quality" | "ownership";

// ── Primitivas direcionais ──────────────────────────────────────────
// HB = higher-is-better; LB = lower-is-better. 3=Platinum, 2=Gold, 1=Silver.
export const tierHigherBetter = (v: number, platinumMin: number, silverBelow: number): Tier =>
  v >= platinumMin ? 3 : v < silverBelow ? 1 : 2;
export const tierLowerBetter = (v: number, platinumBelow: number, silverAbove: number): Tier =>
  v < platinumBelow ? 3 : v > silverAbove ? 1 : 2;

// ── Thresholds por método — unidades naturais (KISS: dias e %, nada de razão/CV) ──
// Todas as métricas são as que qualquer PM/dev/gerente lê sem legenda.
export const SCRUM_THRESHOLDS = {
  sayDo: { platinumMin: 90, silverBelow: 75 }, // HB (%) — confiabilidade: entregue ÷ combinado
  cycleP85Days: { platinumBelow: 7, silverAbove: 14 }, // LB (dias) — 85% entregam em ≤ X dias
  flowEff: { platinumMin: 40, silverBelow: 15 }, // HB (%) — tempo ativo ÷ tempo total (vs. fila)
  defectRate: { platinumBelow: 5, silverAbove: 20 }, // LB (%) — fatia de issues que são bug
} as const;

export const KANBAN_THRESHOLDS = {
  cycleP85Days: { platinumBelow: 7, silverAbove: 14 }, // LB (dias) — 85% entregam em ≤ X dias
  flowEff: { platinumMin: 40, silverBelow: 15 }, // HB (%) — tempo ativo ÷ tempo total (vs. fila)
  agingBreach: { platinumBelow: 10, silverAbove: 30 }, // LB (%) — itens parados além do SLE (p85)
  defectRate: { platinumBelow: 5, silverAbove: 20 }, // LB (%) — fatia de issues que são bug
} as const;

// ── Metadados de tier / pilar ───────────────────────────────────────
export const TIER_META: Record<Tier, { token: TierToken; name: string; desc: string }> = {
  1: { token: "silver", name: "Silver", desc: "Maturidade inicial · suporte necessário" },
  2: { token: "gold", name: "Gold", desc: "Maturidade condicional" },
  3: { token: "platinum", name: "Platinum", desc: "Maturidade plena · autogestão" },
};

export const PILLAR_LABEL: Record<Pillar, string> = {
  flow: "Predictability / Flow",
  quality: "Flow & Quality",
  ownership: "Ownership (comportamental)",
};

export const PILLAR_SHORT: Record<Pillar, string> = {
  flow: "Flow",
  quality: "Quality",
  ownership: "Ownership",
};

// Nome + pergunta de cada pilar (para a tela de maturidade do dashboard)
export const PILLAR_INFO: Record<Pillar, { n: number; title: string; question: string }> = {
  flow: { n: 1, title: "Predictability & Flow", question: "O time consegue planejar e entregar de forma previsível?" },
  quality: { n: 2, title: "Flow & Quality", question: "O trabalho flui de forma suave e com qualidade?" },
  ownership: { n: 3, title: "Team Ownership & Execution", question: "O time opera como uma unidade auto-gerida?" },
};

// Modelo de suporte recomendado por tier (contexto na tela de maturidade)
export const SUPPORT_MODEL: Record<Tier, string> = {
  1: "Coach dedicado — engajamento intenso para estabelecer fundamentos e destravar o time.",
  2: "Suporte condicional — coach compartilhado, engajamento pontual conforme a necessidade.",
  3: "Sob demanda — health checks periódicos; o time se autogere.",
};

// Referência de bandas por métrica × tier (painel "Referência de Maturidade")
export interface MetricBand {
  label: string;
  silver: string;
  gold: string;
  platinum: string;
}
export function maturityReference(bt: BoardType): MetricBand[] {
  if (bt === "scrum") {
    const T = SCRUM_THRESHOLDS;
    return [
      { label: "Confiabilidade (Say-Do)", silver: `< ${T.sayDo.silverBelow}%`, gold: `${T.sayDo.silverBelow}–${T.sayDo.platinumMin}%`, platinum: `≥ ${T.sayDo.platinumMin}%` },
      { label: "Cycle time (p85)", silver: `> ${T.cycleP85Days.silverAbove} dias`, gold: `${T.cycleP85Days.platinumBelow}–${T.cycleP85Days.silverAbove} dias`, platinum: `< ${T.cycleP85Days.platinumBelow} dias` },
      { label: "Flow efficiency", silver: `< ${T.flowEff.silverBelow}%`, gold: `${T.flowEff.silverBelow}–${T.flowEff.platinumMin}%`, platinum: `≥ ${T.flowEff.platinumMin}%` },
      { label: "Taxa de defeitos", silver: `> ${T.defectRate.silverAbove}%`, gold: `${T.defectRate.platinumBelow}–${T.defectRate.silverAbove}%`, platinum: `< ${T.defectRate.platinumBelow}%` },
    ];
  }
  const T = KANBAN_THRESHOLDS;
  return [
    { label: "Cycle time (p85)", silver: `> ${T.cycleP85Days.silverAbove} dias`, gold: `${T.cycleP85Days.platinumBelow}–${T.cycleP85Days.silverAbove} dias`, platinum: `< ${T.cycleP85Days.platinumBelow} dias` },
    { label: "Flow efficiency", silver: `< ${T.flowEff.silverBelow}%`, gold: `${T.flowEff.silverBelow}–${T.flowEff.platinumMin}%`, platinum: `≥ ${T.flowEff.platinumMin}%` },
    { label: "Itens parados (aging)", silver: `> ${T.agingBreach.silverAbove}%`, gold: `${T.agingBreach.platinumBelow}–${T.agingBreach.silverAbove}%`, platinum: `< ${T.agingBreach.platinumBelow}%` },
    { label: "Taxa de defeitos", silver: `> ${T.defectRate.silverAbove}%`, gold: `${T.defectRate.platinumBelow}–${T.defectRate.silverAbove}%`, platinum: `< ${T.defectRate.platinumBelow}%` },
  ];
}

export const tierTextClass = (tier: Tier | null): string =>
  tier === 3
    ? "text-platinum-foreground"
    : tier === 2
      ? "text-gold-foreground"
      : tier === 1
        ? "text-silver-foreground"
        : "text-muted-foreground";

export const tierAccentClass = (tier: Tier | null): string =>
  tier === 3
    ? "border-t-platinum"
    : tier === 2
      ? "border-t-gold"
      : tier === 1
        ? "border-t-silver"
        : "border-t-border";

// ── Tipos de saída ──────────────────────────────────────────────────
export interface MetricEval {
  key: string;
  label: string;
  value: number | null;
  display: string;
  dir: "HB" | "LB";
  pillar: Pillar;
  tier: Tier | null; // null quando value=null → não conta no min()
  nextTarget: string | null; // meta pro PRÓXIMO tier (null se Platinum ou sem dado)
}

export interface MaturityResult {
  boardType: TeamMetrics["team"]["board_type"];
  tier: Tier | null;
  tierToken: TierToken | null;
  tierName: string | null;
  tierDesc: string | null;
  metrics: MetricEval[];
  weakest: string[]; // keys das métricas que travam o tier (tier === min)
  sayDo: { pct: number; band: "low" | "healthy" | "high" } | null;
  lowConfidence: boolean;
  note: string | null;
}

// ── Formatadores ────────────────────────────────────────────────────
const fmtDays = (v: number | null) => (v == null ? "—" : `${v} d`);
const fmtPct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

// ── Construtores de métrica (tier + meta de próximo nível) ───────────
type LBTh = { platinumBelow: number; silverAbove: number };
type HBTh = { platinumMin: number; silverBelow: number };

function evalLB(
  key: string, label: string, pillar: Pillar,
  value: number | null, th: LBTh, fmt: (v: number | null) => string
): MetricEval {
  const tier = value == null ? null : tierLowerBetter(value, th.platinumBelow, th.silverAbove);
  const nextTarget =
    tier == null || tier === 3
      ? null
      : tier === 1
        ? `≤ ${fmt(th.silverAbove)} → Gold`
        : `< ${fmt(th.platinumBelow)} → Platinum`;
  return { key, label, value, display: fmt(value), dir: "LB", pillar, tier, nextTarget };
}

function evalHB(
  key: string, label: string, pillar: Pillar,
  value: number | null, th: HBTh, fmt: (v: number | null) => string
): MetricEval {
  const tier = value == null ? null : tierHigherBetter(value, th.platinumMin, th.silverBelow);
  const nextTarget =
    tier == null || tier === 3
      ? null
      : tier === 1
        ? `≥ ${fmt(th.silverBelow)} → Gold`
        : `≥ ${fmt(th.platinumMin)} → Platinum`;
  return { key, label, value, display: fmt(value), dir: "HB", pillar, tier, nextTarget };
}

// ── computeMaturity — o cérebro (usado por API, UI e replay) ─────────
export function computeMaturity(m: TeamMetrics): MaturityResult {
  const bt = m.team.board_type;
  const f = m.flow;

  // Derivados em unidade natural. Sem dados ⇒ null ⇒ tier null ⇒ fora do min()
  // (nunca "0" virando Silver/Platinum falso).
  const cycleP85 = f.deliveryCycleTime.count > 0 ? f.deliveryCycleTime.p85 : null; // dias
  const flowEffPct = f.flowEffSamples > 0 ? Math.round(f.flowEfficiency * 100) : null; // % ativo vs. fila
  // Say-Do só tem sinal com sprints fechadas QUE TÊM committed>0 (a base do
  // sayDoRatioAvg). Guardar por sayDoSprintCount (não closedSprintCount): sem
  // essa base, sayDoRatioAvg=0 (não null) e viraria Silver falso no tier.
  const sayDoPct = m.scrum && m.scrum.sayDoSprintCount > 0 ? Math.round(m.scrum.sayDoRatioAvg * 100) : null; // %
  const sle = f.deliveryCycleTime.p85; // SLE = p85 do delivery cycle time (dias)
  const agePts = m.advanced.aging.points;
  const agingBreach =
    agePts.length > 0 && sle > 0
      ? Math.round((agePts.filter((p) => p.ageDays > sle).length / agePts.length) * 100)
      : null; // %

  let evals: MetricEval[];
  if (bt === "scrum") {
    const T = SCRUM_THRESHOLDS;
    evals = [
      evalHB("sayDo", "Confiabilidade (Say-Do)", "flow", sayDoPct, T.sayDo, fmtPct),
      evalLB("cycleP85Days", "Cycle time (p85)", "flow", cycleP85, T.cycleP85Days, fmtDays),
      evalHB("flowEff", "Flow efficiency", "quality", flowEffPct, T.flowEff, fmtPct),
      evalLB("defectRate", "Taxa de defeitos", "quality", f.bugRatio, T.defectRate, fmtPct),
    ];
  } else {
    const T = KANBAN_THRESHOLDS;
    evals = [
      evalLB("cycleP85Days", "Cycle time (p85)", "flow", cycleP85, T.cycleP85Days, fmtDays),
      evalHB("flowEff", "Flow efficiency", "quality", flowEffPct, T.flowEff, fmtPct),
      evalLB("agingBreach", "Itens parados (aging)", "quality", agingBreach, T.agingBreach, fmtPct),
      evalLB("defectRate", "Taxa de defeitos", "quality", f.bugRatio, T.defectRate, fmtPct),
    ];
  }

  const tiers = evals.map((e) => e.tier).filter((t): t is Tier => t != null);
  // Não graduar sem sinal de FLUXO: um 0% de defeitos sozinho (sem cycle time /
  // say-do / aging) não define maturidade — daria Platinum falso a um time que
  // só abriu issues e não entregou nada. Exige ≥1 métrica do pilar "flow".
  const hasFlowSignal = evals.some((e) => e.pillar === "flow" && e.tier != null);
  const tier = tiers.length && hasFlowSignal ? (Math.min(...tiers) as Tier) : null;
  const meta = tier ? TIER_META[tier] : null;
  // Elo mais fraco: métricas cujo tier == o tier do time (só relevante se não-Platinum).
  const weakest = tier != null && tier < 3 ? evals.filter((e) => e.tier === tier).map((e) => e.key) : [];

  // Say-Do como contexto (banda saudável 85–110%)
  const sayDo =
    bt === "scrum" && m.scrum && m.scrum.sayDoSprintCount > 0
      ? (() => {
          const pct = Math.round(m.scrum.sayDoRatioAvg * 100);
          const band: "low" | "healthy" | "high" = pct < 85 ? "low" : pct > 110 ? "high" : "healthy";
          return { pct, band };
        })()
      : null;

  // Baixa confiança: pouca amostra p/ o método (não suprime o tier — sinaliza)
  const delivered = f.deliveryCycleTime.count;
  const lowConfidence =
    bt === "scrum" ? (m.scrum?.closedSprintCount ?? 0) < 6 : delivered < 10;
  const note = !lowConfidence
    ? null
    : bt === "scrum"
      ? `Poucas sprints fechadas (${m.scrum?.closedSprintCount ?? 0}) — leitura de baixa confiança`
      : `Poucos itens entregues (${delivered}) — leitura de baixa confiança`;

  return {
    boardType: bt,
    tier,
    tierToken: meta?.token ?? null,
    tierName: meta?.name ?? null,
    tierDesc: meta?.desc ?? null,
    metrics: evals,
    weakest,
    sayDo,
    lowConfidence,
    note,
  };
}

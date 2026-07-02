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
 * O board_type decide qual conjunto de métricas se aplica. Say-Do (Scrum) é CONTEXTO,
 * nunca driver de tier. TODOS os thresholds estão marcados "a calibrar".
 */
import type { TeamMetrics } from "./metrics";

export type Tier = 1 | 2 | 3;
export type TierToken = "silver" | "gold" | "platinum";
export type Pillar = "flow" | "quality" | "ownership";

// ── Primitivas direcionais ──────────────────────────────────────────
// HB = higher-is-better; LB = lower-is-better. 3=Platinum, 2=Gold, 1=Silver.
export const tierHigherBetter = (v: number, platinumMin: number, silverBelow: number): Tier =>
  v >= platinumMin ? 3 : v < silverBelow ? 1 : 2;
export const tierLowerBetter = (v: number, platinumBelow: number, silverAbove: number): Tier =>
  v < platinumBelow ? 3 : v > silverAbove ? 1 : 2;

// ── Thresholds por método (a calibrar) ──────────────────────────────
export const SCRUM_THRESHOLDS = {
  velocityCV: { platinumBelow: 0.15, silverAbove: 0.3 }, // LB
  cycleRatio: { platinumBelow: 2.0, silverAbove: 3.0 }, // LB
  flowEff: { platinumMin: 40, silverBelow: 15 }, // HB (%)
  bugRatio: { platinumBelow: 5, silverAbove: 20 }, // LB (%) — proxy de rework
} as const;

export const KANBAN_THRESHOLDS = {
  cycleRatio: { platinumBelow: 2.0, silverAbove: 3.0 }, // LB
  throughputCV: { platinumBelow: 0.4, silverAbove: 0.7 }, // LB
  flowEff: { platinumMin: 40, silverBelow: 15 }, // HB (%)
  agingBreach: { platinumBelow: 10, silverAbove: 30 }, // LB (%)
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
const fmtX = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}x`);
const fmtCV = (v: number | null) => (v == null ? "—" : v.toFixed(2));
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

  // Derivados compartilhados. Sem dados ⇒ null ⇒ tier null ⇒ fora do min()
  // (nunca "0%" virando Silver/Platinum falso).
  const cycleRatio = f.deliveryCycleTime.median > 0 ? f.deliveryCycleTime.p85 / f.deliveryCycleTime.median : null;
  const flowEffPct = f.flowEffSamples > 0 ? Math.round(f.flowEfficiency * 100) : null;
  const sle = f.deliveryCycleTime.p85; // SLE = p85 do delivery cycle time
  const agePts = m.advanced.aging.points;
  const agingBreach =
    agePts.length > 0 && sle > 0
      ? Math.round((agePts.filter((p) => p.ageDays > sle).length / agePts.length) * 100)
      : null;

  let evals: MetricEval[];
  if (bt === "scrum") {
    const T = SCRUM_THRESHOLDS;
    evals = [
      evalLB("velocityCV", "Predictability", "flow", m.scrum?.velocityCV ?? null, T.velocityCV, fmtCV),
      evalLB("cycleRatio", "Cycle p85/p50", "flow", cycleRatio, T.cycleRatio, fmtX),
      evalHB("flowEff", "Flow efficiency", "quality", flowEffPct, T.flowEff, fmtPct),
      evalLB("bugRatio", "Rework (proxy)", "quality", f.bugRatio, T.bugRatio, fmtPct),
    ];
  } else {
    const T = KANBAN_THRESHOLDS;
    evals = [
      evalLB("cycleRatio", "Cycle p85/p50", "flow", cycleRatio, T.cycleRatio, fmtX),
      evalLB("throughputCV", "Throughput stability", "flow", f.throughputCV, T.throughputCV, fmtCV),
      evalHB("flowEff", "Flow efficiency", "quality", flowEffPct, T.flowEff, fmtPct),
      evalLB("agingBreach", "WIP/Aging breach", "quality", agingBreach, T.agingBreach, fmtPct),
    ];
  }

  const tiers = evals.map((e) => e.tier).filter((t): t is Tier => t != null);
  const tier = tiers.length ? (Math.min(...tiers) as Tier) : null;
  const meta = tier ? TIER_META[tier] : null;
  // Elo mais fraco: métricas cujo tier == o tier do time (só relevante se não-Platinum).
  const weakest = tier != null && tier < 3 ? evals.filter((e) => e.tier === tier).map((e) => e.key) : [];

  // Say-Do como contexto (banda saudável 85–110%)
  const sayDo =
    bt === "scrum" && m.scrum
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
      ? `Poucas sprints fechadas (${m.scrum?.closedSprintCount ?? 0}) — CV de baixa confiança`
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

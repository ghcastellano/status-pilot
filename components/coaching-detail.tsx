"use client";

/** Detalhe de um time: histórico, composição do tier, plano, experimentos,
 *  sinais comportamentais, evidência das métricas e thresholds. */
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CycleScatter, VelocityBar, ThroughputBar } from "@/components/charts";
import { MaturityHistoryChart, type MaturityWeek } from "@/components/charts-maturity";
import { PlanCard, ExperimentsCard, SignalsCard } from "@/components/coaching-cards";
import { STATUS_META } from "@/lib/coaching";
import type { CoachingPlan, Experiment, EngagementStatus } from "@/lib/coaching";
import {
  type MaturityResult,
  type MetricEval,
  type Pillar,
  PILLAR_LABEL,
  TIER_META,
  tierTextClass,
  SCRUM_THRESHOLDS,
  KANBAN_THRESHOLDS,
} from "@/lib/maturity";

export interface TeamDetail {
  team: { id: string; name: string; board_type: "scrum" | "kanban"; description: string | null };
  maturity: MaturityResult;
  history: MaturityWeek[];
  status?: EngagementStatus | null;
  coach?: string | null;
  plan: CoachingPlan | null;
  assessment: { signals: Record<string, string>; note: string | null } | null;
  experiments: Experiment[];
  evidence: {
    scatter: { doneDate: string; cycleDays: number; key: string; title: string }[];
    cycleP50: number;
    cycleP85: number;
    velocity: { sprint: string; committed: number; completed: number }[] | null;
    throughputSeries: { weekLabel: string; weekStart: string; count: number }[];
  };
}

const QUANT_PILLARS: Pillar[] = ["flow", "quality"];

export function TeamDetailPanel({ d }: { d: TeamDetail }) {
  const [showEvidence, setShowEvidence] = React.useState(false);
  const { team, maturity: mat, history, plan, assessment, experiments, evidence } = d;
  const isScrum = team.board_type === "scrum";
  const weakest = new Set(mat.weakest);
  const limiting = mat.metrics.filter((m) => weakest.has(m.key));

  return (
    <div className="space-y-6">
      {/* Identidade + Say-Do */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{team.name}</h2>
            <Badge variant="outline" className="capitalize">
              {team.board_type}
            </Badge>
            {mat.tier && mat.tierToken ? (
              <Badge variant={mat.tierToken} className="font-semibold">
                {mat.tierName}
              </Badge>
            ) : (
              <Badge variant="secondary">Sem dados</Badge>
            )}
            {d.status && (
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_META[d.status].cls)}>
                {STATUS_META[d.status].label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {mat.tierDesc}
            {d.coach ? ` · Coach: ${d.coach}` : ""}
          </p>
          {limiting.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Para subir:</span>{" "}
              {limiting.map((m) => `${m.label}${m.nextTarget ? ` (${m.nextTarget})` : ""}`).join(" · ")}
            </p>
          )}
          {mat.note && <p className="mt-1 text-xs text-amber-600">⚠ {mat.note}</p>}
        </div>
        {mat.sayDo && (
          <Card className="px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Say-Do (contexto)</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  mat.sayDo.band === "healthy" ? "text-primary" : mat.sayDo.band === "high" ? "text-amber-600" : "text-destructive"
                )}
              >
                {mat.sayDo.pct}%
              </span>
              <span className="text-xs text-muted-foreground">
                {mat.sayDo.band === "healthy" ? "banda saudável" : mat.sayDo.band === "high" ? "sandbagging?" : "sub-entrega"}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground/70">não é driver de tier · banda 85–110%</p>
          </Card>
        )}
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Maturidade — últimas {history.length} semanas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Recomputada semana a semana sobre a timeline do Jira (replay). Passe o mouse para ver as métricas de cada semana.
            </p>
          </CardHeader>
          <CardContent>
            <MaturityHistoryChart data={history} />
          </CardContent>
        </Card>
      )}

      {/* Composição do tier */}
      <Card>
        <CardHeader>
          <CardTitle>Como o tier foi definido — weakest-link</CardTitle>
          <p className="text-sm text-muted-foreground">
            O tier é o <span className="font-medium">menor</span> entre as métricas quantitativas. A métrica que trava está destacada.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {QUANT_PILLARS.map((pillar) => {
            const rows = mat.metrics.filter((mt) => mt.pillar === pillar);
            if (rows.length === 0) return null;
            return (
              <div key={pillar}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{PILLAR_LABEL[pillar]}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {rows.map((mt) => (
                    <MetricRow key={mt.key} mt={mt} isWeak={weakest.has(mt.key)} />
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Coaching: plano + experimentos (2/3) · sinais (1/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PlanCard teamId={team.id} initial={plan} />
          <ExperimentsCard teamId={team.id} boardType={team.board_type} initial={experiments} />
        </div>
        <SignalsCard
          teamId={team.id}
          boardType={team.board_type}
          tier={mat.tier}
          initialSignals={assessment?.signals ?? {}}
          initialNote={assessment?.note ?? null}
        />
      </div>

      {/* Evidência das métricas — recolhível */}
      <div>
        <button
          onClick={() => setShowEvidence((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showEvidence && "rotate-180")} />
          Evidência das métricas {showEvidence ? "" : "— mostrar"}
        </button>
        {showEvidence && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cycle time — distribuição (p50 / p85)</CardTitle>
                <p className="text-sm text-muted-foreground">Base da métrica “Cycle p85/p50”.</p>
              </CardHeader>
              <CardContent>
                <CycleScatter data={evidence.scatter} p50={evidence.cycleP50} p85={evidence.cycleP85} />
              </CardContent>
            </Card>
            {isScrum && evidence.velocity ? (
              <Card>
                <CardHeader>
                  <CardTitle>Velocity por sprint</CardTitle>
                  <p className="text-sm text-muted-foreground">Base da métrica “Predictability” (CV da velocity).</p>
                </CardHeader>
                <CardContent>
                  <VelocityBar data={evidence.velocity} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Throughput por semana</CardTitle>
                  <p className="text-sm text-muted-foreground">Base da métrica “Throughput stability” (CV semanal).</p>
                </CardHeader>
                <CardContent>
                  <ThroughputBar series={evidence.throughputSeries} />
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Thresholds do método */}
      <ThresholdReference boardType={team.board_type} />
    </div>
  );
}

function MetricRow({ mt, isWeak }: { mt: MetricEval; isWeak: boolean }) {
  const chip = mt.tier ? TIER_META[mt.tier] : null;
  return (
    <div className={cn("rounded-lg border border-border p-3", isWeak && "border-l-4 border-l-amber-500 bg-amber-500/[0.03]")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{mt.label}</span>
        {chip ? (
          <Badge variant={chip.token} className="text-[10px]">
            {chip.name}
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            —
          </Badge>
        )}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tierTextClass(mt.tier))}>{mt.display}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        {mt.tier == null ? (
          <span className="text-muted-foreground">sem dados suficientes</span>
        ) : mt.nextTarget ? (
          <span className="text-muted-foreground">meta: {mt.nextTarget}</span>
        ) : (
          <span className="text-platinum-foreground">no topo</span>
        )}
        {isWeak && <span className="font-medium text-amber-600">elo mais fraco</span>}
      </div>
    </div>
  );
}

function ThresholdReference({ boardType }: { boardType: "scrum" | "kanban" }) {
  const rows =
    boardType === "scrum"
      ? [
          ["Predictability (velocity CV)", `< ${SCRUM_THRESHOLDS.velocityCV.platinumBelow}`, `> ${SCRUM_THRESHOLDS.velocityCV.silverAbove}`],
          ["Cycle p85/p50", `< ${SCRUM_THRESHOLDS.cycleRatio.platinumBelow}x`, `> ${SCRUM_THRESHOLDS.cycleRatio.silverAbove}x`],
          ["Flow efficiency", `> ${SCRUM_THRESHOLDS.flowEff.platinumMin}%`, `< ${SCRUM_THRESHOLDS.flowEff.silverBelow}%`],
          ["Rework (proxy: bug ratio)", `< ${SCRUM_THRESHOLDS.bugRatio.platinumBelow}%`, `> ${SCRUM_THRESHOLDS.bugRatio.silverAbove}%`],
        ]
      : [
          ["Cycle p85/p50", `< ${KANBAN_THRESHOLDS.cycleRatio.platinumBelow}x`, `> ${KANBAN_THRESHOLDS.cycleRatio.silverAbove}x`],
          ["Throughput stability (CV)", `< ${KANBAN_THRESHOLDS.throughputCV.platinumBelow}`, `> ${KANBAN_THRESHOLDS.throughputCV.silverAbove}`],
          ["Flow efficiency", `> ${KANBAN_THRESHOLDS.flowEff.platinumMin}%`, `< ${KANBAN_THRESHOLDS.flowEff.silverBelow}%`],
          ["WIP/Aging breach", `< ${KANBAN_THRESHOLDS.agingBreach.platinumBelow}%`, `> ${KANBAN_THRESHOLDS.agingBreach.silverAbove}%`],
        ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Thresholds — {boardType === "scrum" ? "Scrum" : "Kanban"}</CardTitle>
        <p className="text-sm text-muted-foreground">Valores propostos, ainda a calibrar com dados de campo.</p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Métrica</th>
              <th className="pb-2 font-medium text-platinum-foreground">Platinum</th>
              <th className="pb-2 font-medium text-silver-foreground">Silver</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-border/60">
                <td className="py-1.5 pr-2">{r[0]}</td>
                <td className="py-1.5 tabular-nums text-platinum-foreground">{r[1]}</td>
                <td className="py-1.5 tabular-nums text-silver-foreground">{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

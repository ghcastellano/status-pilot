"use client";
import { useMetricDisplay, useText, useLocale } from "@/components/lang-context";

/** Detalhe de um time: histórico, composição do tier, plano, experimentos,
 *  sinais comportamentais, evidência das métricas e thresholds. */
import { useDemo } from "@/components/demo-workspace";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CycleScatter, VelocityBar, ThroughputBar } from "@/components/charts";
import { MaturityHistoryChart, type MaturityWeek } from "@/components/charts-maturity";
import { PlanCard, ExperimentsCard, SignalsCard, AuthorField } from "@/components/coaching-cards";
import { STATUS_META, RUBRIC, signalDefs } from "@/lib/coaching";
import type { CoachingPlan, Experiment, EngagementStatus } from "@/lib/coaching";
import type { ExperimentComment, FieldHistoryRow } from "@/lib/coaching-db";
import {
  type MaturityResult,
  type MetricEval,
  type Pillar,
  PILLAR_LABEL,
  TIER_META,
  tierTextClass,
  maturityReference,
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
  comments?: ExperimentComment[];
  fieldHistory?: FieldHistoryRow[];
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
  const tx = useText();
  const demo = useDemo();
  const [showEvidence, setShowEvidence] = React.useState(false);
  const { team, maturity: mat, history, plan, assessment, experiments, evidence } = d;
  const comments = d.comments ?? [];
  const fieldHistory = d.fieldHistory ?? [];
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
              <Badge variant="secondary">{tx("Sem dados")}</Badge>
            )}
            {d.status && (
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", STATUS_META[d.status].cls)}>
                {tx(STATUS_META[d.status].label)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tx(mat.tierDesc)}
            {d.coach ? ` · Coach: ${d.coach}` : ""}
          </p>
          {limiting.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{tx("Para subir:")}</span>{" "}
              {limiting.map((m) => `${tx(m.label)}${m.nextTarget ? ` (${m.nextTarget})` : ""}`).join(" · ")}
            </p>
          )}
          {mat.note && <p className="mt-1 text-xs text-amber-600">⚠ {tx(mat.note)}</p>}
          {mat.sayDo?.band === "high" && (
            <p className="mt-1 text-xs text-amber-600">
              {tx("⚠ Say-Do em")}{" "}{mat.sayDo.pct}{tx("% — possível sub-commit (planejamento conservador). Não penaliza o tier.")}</p>
          )}
        </div>
        {!demo && <AuthorField />}
      </div>

      {/* Histórico */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tx("Maturidade — últimas")}{" "}{history.length} {isScrum ? "sprints" : tx("semanas")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {isScrum
                ? tx("Recomputada a cada sprint fechada sobre a timeline do Jira (replay). Passe o mouse para ver as métricas de cada sprint.")
                : tx("Recomputada semana a semana sobre a timeline do Jira (replay). Passe o mouse para ver as métricas de cada semana.")}
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
          <CardTitle>{tx("Como o tier foi definido — weakest-link")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {tx("O tier é o")}{" "}<span className="font-medium">{tx("menor")}</span> {tx("entre as métricas quantitativas. A métrica que trava está destacada.")}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {QUANT_PILLARS.map((pillar) => {
            const rows = mat.metrics.filter((mt) => mt.pillar === pillar);
            if (rows.length === 0) return null;
            return (
              <div key={pillar}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tx(PILLAR_LABEL[pillar])}</p>
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
      <fieldset disabled={demo} className="grid min-w-0 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PlanCard teamId={team.id} initial={plan} />
          <ExperimentsCard teamId={team.id} boardType={team.board_type} initial={experiments} initialComments={comments} />
        </div>
        <SignalsCard
          teamId={team.id}
          boardType={team.board_type}
          tier={mat.tier}
          initialSignals={assessment?.signals ?? {}}
          initialNote={assessment?.note ?? null}
        />
      </fieldset>

      {/* Histórico de mudanças — só o que mudou de fato (old→new) */}
      <HistoryPanel entries={fieldHistory} boardType={team.board_type} />

      {/* Evidência das métricas — recolhível */}
      <div>
        <button
          onClick={() => setShowEvidence((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showEvidence && "rotate-180")} />
          {tx("Evidência das métricas")}{" "}{showEvidence ? "" : tx("— mostrar")}
        </button>
        {showEvidence && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{tx("Cycle time — distribuição (p50 / p85)")}</CardTitle>
                <p className="text-sm text-muted-foreground">{tx("Base da métrica “Cycle time (p85)”, em dias.")}</p>
              </CardHeader>
              <CardContent>
                <CycleScatter data={evidence.scatter} p50={evidence.cycleP50} p85={evidence.cycleP85} />
              </CardContent>
            </Card>
            {isScrum && evidence.velocity ? (
              <Card>
                <CardHeader>
                  <CardTitle>{tx("Velocity por sprint")}</CardTitle>
                  <p className="text-sm text-muted-foreground">{tx("Contexto — velocity por sprint; não entra no tier.")}</p>
                </CardHeader>
                <CardContent>
                  <VelocityBar data={evidence.velocity} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{tx("Throughput por semana")}</CardTitle>
                  <p className="text-sm text-muted-foreground">{tx("Contexto — throughput por semana; não entra no tier.")}</p>
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
  const tx = useText();
  const metricDisplay = useMetricDisplay();
  const chip = mt.tier ? TIER_META[mt.tier] : null;
  return (
    <div className={cn("rounded-lg border border-border p-3", isWeak && "border-l-4 border-l-amber-500 bg-amber-500/[0.03]")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{tx(mt.label)}</span>
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
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tierTextClass(mt.tier))}>{metricDisplay(mt.display)}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        {mt.tier == null ? (
          <span className="text-muted-foreground">{tx("sem dados suficientes")}</span>
        ) : mt.nextTarget ? (
          <span className="text-muted-foreground">{tx("meta:")}{" "}{mt.nextTarget}</span>
        ) : (
          <span className="text-platinum-foreground">{tx("no topo")}</span>
        )}
        {isWeak && <span className="font-medium text-amber-600">{tx("elo mais fraco")}</span>}
      </div>
    </div>
  );
}

function ThresholdReference({ boardType }: { boardType: "scrum" | "kanban" }) {
  const tx = useText();
  const ref = maturityReference(boardType); // fonte única (mesma do dashboard)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tx("Referência de maturidade —")}{" "}{boardType === "scrum" ? "Scrum" : "Kanban"}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {tx("O que leva a cada tier, em unidades naturais (dias, %). Valores propostos, a calibrar com dados de campo.")}</p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">{tx("Métrica")}</th>
              <th className="pb-2 font-medium text-platinum-foreground">Platinum</th>
              <th className="pb-2 font-medium text-gold-foreground">Gold</th>
              <th className="pb-2 font-medium text-silver-foreground">Silver</th>
            </tr>
          </thead>
          <tbody>
            {ref.map((r) => (
              <tr key={tx(r.label)} className="border-t border-border/60">
                <td className="py-1.5 pr-2">{tx(r.label)}</td>
                <td className="py-1.5 tabular-nums text-platinum-foreground">{tx(r.platinum)}</td>
                <td className="py-1.5 tabular-nums text-gold-foreground">{tx(r.gold)}</td>
                <td className="py-1.5 tabular-nums text-silver-foreground">{tx(r.silver)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ── Histórico de mudanças (diff old→new) ─────────────────────────────
const SECTION_LABEL: Record<string, string> = { plan: "Plano", experiment: "Experimento", signal: "Sinais" };
const FIELD_LABEL: Record<string, string> = {
  main_gap: "Gap principal", hypothesis: "Hipótese", next_step: "Próximo passo", ask: "Ask",
  review_at: "Check-in", coach: "Coach", coaching: "No programa", behavior: "Comportamento",
  metric: "Métrica", outcome: "Resultado", status: "Status", pillar: "Pilar", note: "Nota",
};

function labelFor(section: string, field: string, boardType: "scrum" | "kanban"): string {
  if (section === "signal" && field !== "note") {
    return signalDefs(boardType).find((s) => s.key === field)?.label ?? field;
  }
  return FIELD_LABEL[field] ?? field;
}

function valueFor(section: string, field: string, v: string | null): string {
  if (v == null) return "—";
  if (section === "signal" && field !== "note") return RUBRIC[v as keyof typeof RUBRIC]?.label ?? v;
  if (section === "plan" && field === "coaching") return v === "true" ? "sim" : "não";
  return v;
}

function HistoryEntryRow({ e, boardType }: { e: FieldHistoryRow; boardType: "scrum" | "kanban" }) {
  const tx = useText();
  const locale = useLocale();
  const when = new Date(e.changed_at).toLocaleString(locale, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
  let change: React.ReactNode;
  if (e.field === "created") {
    change = <span className="text-primary">{tx("criou «")}{e.entity_label}»</span>;
  } else if (e.field === "deleted") {
    change = <span className="text-destructive line-through">{tx("removeu «")}{e.entity_label}»</span>;
  } else {
    const label = tx(labelFor(e.section, e.field, boardType));
    const oldV = tx(valueFor(e.section, e.field, e.old_value));
    const newV = tx(valueFor(e.section, e.field, e.new_value));
    if (e.old_value == null) {
      change = (<><span className="text-muted-foreground">{tx(label)}:</span> <span className="text-primary">{newV}</span></>);
    } else if (e.new_value == null) {
      change = (<><span className="text-muted-foreground">{tx(label)}:</span> <span className="text-muted-foreground/60 line-through">{oldV}</span> <span className="text-muted-foreground">{tx("(limpo)")}</span></>);
    } else {
      change = (<><span className="text-muted-foreground">{tx(label)}:</span> <span className="text-muted-foreground/60 line-through">{oldV}</span> <span className="text-primary">→ {newV}</span></>);
    }
  }
  return (
    <li className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70 sm:w-28">{when}</span>
      <span className="min-w-0 flex-1 text-xs">
        {e.section === "experiment" && e.entity_label && e.field !== "created" && e.field !== "deleted" && (
          <span className="mr-1 text-muted-foreground/70">[{e.entity_label}]</span>
        )}
        {change}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground/60">
        {e.changed_by} · {tx(SECTION_LABEL[e.section] ?? e.section)}
      </span>
    </li>
  );
}

function HistoryPanel({ entries, boardType }: { entries: FieldHistoryRow[]; boardType: "scrum" | "kanban" }) {
  const tx = useText();
  const [open, setOpen] = React.useState(false);
  if (entries.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        {tx("Histórico de mudanças (")}{entries.length}) {open ? "" : tx("— mostrar")}
      </button>
      {open && (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>{tx("Histórico de mudanças")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {tx("Só o que mudou de fato — cada linha é um valor alterado (de → para), com autor e data.")}</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/50">
              {entries.map((e) => (
                <HistoryEntryRow key={e.id} e={e} boardType={boardType} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

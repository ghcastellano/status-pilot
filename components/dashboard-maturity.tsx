"use client";

/**
 * Seção de Maturidade do Dashboard de cada time (Scrum ou Kanban).
 * Espelha o Scrum Maturity Dashboard original, adaptado ao nosso modelo dual:
 *   A) Nível de maturidade do time (tier + support + histórico + KPIs c/ metas)
 *   B) Referência de maturidade (bandas Silver/Gold/Platinum + medidas subjetivas)
 *   C) 3 pilares (Predictability/Flow · Flow&Quality · Ownership) c/ métricas + gráficos
 * Reutiliza os gráficos existentes do dashboard.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLang } from "@/components/lang-context";
import { metricLabel } from "@/lib/i18n";
import { CycleScatter, VelocityBar, ThroughputBar } from "@/components/charts";
import { CFDChart, AgingScatter, CycleHistogram } from "@/components/charts-advanced";
import { MaturityHistoryChart, type MaturityWeek } from "@/components/charts-maturity";
import {
  type MaturityResult,
  type MetricEval,
  type Pillar,
  type Tier,
  type TierToken,
  PILLAR_INFO,
  TIER_META,
  SUPPORT_MODEL,
  tierTextClass,
  maturityReference,
} from "@/lib/maturity";
import { behavioralReadiness, signalDefs, RUBRIC, READINESS_META, type SignalValue } from "@/lib/coaching";

export interface MaturityWindow {
  mode: "scrum" | "kanban";
  sprintIds: string[];
  cycleWeeks: number | null;
  availableSprints: { id: string; name: string; state: string }[];
}

export interface DashboardMaturityData {
  team: { id: string; name: string; board_type: "scrum" | "kanban"; description: string | null };
  maturity: MaturityResult;
  metrics: any; // TeamMetrics completo
  history: MaturityWeek[];
  assessment: { signals: Record<string, string>; note: string | null } | null;
  window?: MaturityWindow;
}

const BADGE_BG: Record<TierToken, string> = {
  silver: "bg-silver/20 text-silver-foreground",
  gold: "bg-gold/20 text-gold-foreground",
  platinum: "bg-platinum/20 text-platinum-foreground",
};
const TIER_ORDER: Tier[] = [1, 2, 3];
const TIER_COL_BG: Record<TierToken, string> = {
  silver: "bg-silver/[0.06] border-silver/30",
  gold: "bg-gold/[0.06] border-gold/30",
  platinum: "bg-platinum/[0.06] border-platinum/30",
};

export function DashboardMaturity({ data: initial }: { data: DashboardMaturityData }) {
  const [data, setData] = React.useState(initial);
  const [loading, setLoading] = React.useState(false);
  // troca de time (prop nova) reseta a janela
  React.useEffect(() => setData(initial), [initial]);

  const { team, maturity: mat, metrics: m, history, assessment, window: win } = data;

  const applyWindow = React.useCallback(
    async (qs: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/coaching/team?teamId=${team.id}${qs}`, { cache: "no-store" }).then((r) => r.json());
        if (res && !res.error) setData(res);
      } finally {
        setLoading(false);
      }
    },
    [team.id]
  );

  return (
    <div className="space-y-4">
      {win && <MaturityWindowBar win={win} loading={loading} onApply={applyWindow} />}
      <MaturityLevelPanel team={team} mat={mat} m={m} history={history} />
      <ReferencePanel boardType={team.board_type} />
      <PillarSection pillar="flow" team={team} mat={mat} m={m} />
      <PillarSection pillar="quality" team={team} mat={mat} m={m} />
      <OwnershipPillar team={team} tier={mat.tier} assessment={assessment} />
    </div>
  );
}

// Seletor de janela: Kanban = período (4/8/12 sem); Scrum = sprints (últimas 6 / seleção).
function MaturityWindowBar({ win, loading, onApply }: { win: MaturityWindow; loading: boolean; onApply: (qs: string) => void }) {
  if (win.mode === "kanban") {
    const cur = win.cycleWeeks ?? 8;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Janela de avaliação:</span>
        {[4, 8, 12].map((w) => (
          <button
            key={w}
            disabled={loading}
            onClick={() => onApply(`&weeks=${w}`)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              cur === w ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {w} semanas
          </button>
        ))}
        {loading && <span className="text-xs text-muted-foreground">atualizando…</span>}
      </div>
    );
  }
  const sel = new Set(win.sprintIds);
  const sprints = win.availableSprints.slice(-12).reverse(); // mais recentes primeiro
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onApply(`&sprintIds=${Array.from(next).join(",")}`);
  };
  const last6 = () => {
    const closed = win.availableSprints.filter((s) => s.state === "closed");
    onApply(`&sprintIds=${closed.slice(-6).map((s) => s.id).join(",")}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="mr-1 text-muted-foreground">Sprints:</span>
      <button
        disabled={loading}
        onClick={last6}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        Últimas 6
      </button>
      {sprints.map((s) => (
        <button
          key={s.id}
          disabled={loading}
          onClick={() => toggle(s.id)}
          className={cn(
            "rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50",
            sel.has(s.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
          )}
        >
          {s.name}
          {s.state === "active" ? " ●" : ""}
        </button>
      ))}
      {loading && <span className="text-xs text-muted-foreground">atualizando…</span>}
    </div>
  );
}

// ── A) Nível de maturidade ────────────────────────────────────────────
function MaturityLevelPanel({ team, mat, m, history }: { team: DashboardMaturityData["team"]; mat: MaturityResult; m: any; history: MaturityWeek[] }) {
  const isScrum = team.board_type === "scrum";
  const basis = isScrum
    ? `${m.scrum?.closedSprintCount ?? 0} sprints fechadas`
    : `${history.length || 12} semanas`;
  const lastAsOf = history.length ? history[history.length - 1].as_of : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-lg">Nível de Maturidade do Time</CardTitle>
          <div className="text-right text-xs text-muted-foreground">
            <span>Base: {basis}</span>
            {lastAsOf && <div>Última análise: {new Date(lastAsOf + "T00:00:00Z").toLocaleDateString("pt-BR")}</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
          {/* Badge + descrição + support */}
          <div>
            <div className="flex items-center gap-3">
              {mat.tier && mat.tierToken ? (
                <div className={cn("flex h-16 w-16 items-center justify-center rounded-xl text-3xl font-bold", BADGE_BG[mat.tierToken])}>
                  {mat.tier}
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-lg text-muted-foreground">—</div>
              )}
              <div>
                <p className={cn("text-xl font-bold", tierTextClass(mat.tier))}>{mat.tierName ?? "Sem dados"}</p>
                <p className="text-sm text-muted-foreground">{mat.tierDesc}</p>
              </div>
            </div>
            {mat.tier && (
              <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/80">Modelo de suporte:</span> {SUPPORT_MODEL[mat.tier]}
              </div>
            )}
            {mat.note && <p className="mt-2 text-xs text-amber-600">⚠ {mat.note}</p>}
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              O tier é o elo mais fraco (weakest-link) entre as métricas quantitativas. Ownership é comportamental e não entra no tier.
            </p>
          </div>
          {/* Histórico */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Maturidade — últimas {history.length} semanas</p>
            {history.length > 0 ? (
              <MaturityHistoryChart data={history} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem histórico ainda.</p>
            )}
          </div>
        </div>

        {/* KPIs (as métricas do método) com meta */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {mat.metrics.map((mt) => (
            <MetricKpi key={mt.key} mt={mt} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricKpi({ mt }: { mt: MetricEval }) {
  const { lang } = useLang();
  const chip = mt.tier ? TIER_META[mt.tier] : null;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-xs text-muted-foreground">{metricLabel(mt.key, lang, mt.label)}</span>
        {chip ? (
          <Badge variant={chip.token} className="shrink-0 text-[9px]">
            {chip.name}
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0 text-[9px]">—</Badge>
        )}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tierTextClass(mt.tier))}>{mt.display}</div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {mt.tier == null ? "sem dados" : mt.nextTarget ? `Meta: ${mt.nextTarget}` : "no topo ✓"}
      </p>
    </div>
  );
}

// ── B) Referência de maturidade ───────────────────────────────────────
function ReferencePanel({ boardType }: { boardType: "scrum" | "kanban" }) {
  const ref = maturityReference(boardType);
  const cols: { tier: Tier; key: "silver" | "gold" | "platinum" }[] = [
    { tier: 1, key: "silver" },
    { tier: 2, key: "gold" },
    { tier: 3, key: "platinum" },
  ];
  const signals = signalDefs(boardType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">📖 Referência de Maturidade — {boardType === "scrum" ? "Scrum" : "Kanban"}</CardTitle>
        <p className="text-sm text-muted-foreground">O que leva o time a cada tier. Valores propostos, ainda a calibrar.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {cols.map(({ tier, key }) => {
            const meta = TIER_META[tier];
            return (
              <div key={tier} className={cn("rounded-lg border p-4", TIER_COL_BG[meta.token])}>
                <div className="mb-3 flex items-center gap-2">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", BADGE_BG[meta.token])}>{tier}</span>
                  <div>
                    <p className={cn("text-sm font-bold", tierTextClass(tier))}>{meta.name}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.desc}</p>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {ref.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-2 rounded bg-background/60 px-2 py-1 text-xs">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="shrink-0 font-medium tabular-nums">{r[key]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Medidas subjetivas (Ownership comportamental) */}
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">Medidas subjetivas (Ownership)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sinais qualitativos observados no dia a dia — avaliados pelo coach, não entram no tier quantitativo.
          </p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-foreground/80 sm:grid-cols-2">
            {signals.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// ── C) Pilares quantitativos (flow / quality) ─────────────────────────
function PillarSection({ pillar, team, mat, m }: { pillar: Pillar; team: DashboardMaturityData["team"]; mat: MaturityResult; m: any }) {
  const info = PILLAR_INFO[pillar];
  const rows = mat.metrics.filter((mt) => mt.pillar === pillar);
  const weakest = new Set(mat.weakest);
  const isScrum = team.board_type === "scrum";
  const adv = m.advanced;
  const stageOrder: string[] = adv.cfd.stages.map((s: any) => s.jira);

  // gráficos por pilar × método (reuso dos componentes existentes)
  const charts: React.ReactNode[] = [];
  if (pillar === "flow") {
    if (isScrum && m.scrum) {
      charts.push(
        <ChartCard key="vel" title="Velocity por sprint" hint="Contexto — quanto o time entrega por sprint (não entra no tier)">
          <VelocityBar data={m.scrum.velocity} />
        </ChartCard>
      );
    } else {
      charts.push(
        <ChartCard key="tp" title="Throughput por semana" hint="Contexto — itens entregues por semana (não entra no tier)">
          <ThroughputBar series={m.flow.throughput.series} />
        </ChartCard>
      );
    }
    charts.push(
      <ChartCard key="cyc" title="Cycle time — distribuição (p50/p85)" hint="Previsibilidade da entrega → Cycle time (p85), em dias">
        <CycleScatter data={m.flow.scatter} p50={m.flow.deliveryCycleTime.median} p85={m.flow.deliveryCycleTime.p85} />
      </ChartCard>
    );
  } else {
    // quality
    if (!isScrum) {
      charts.push(
        <ChartCard key="cfd" title="Cumulative Flow Diagram" hint="Acúmulo por estágio → gargalos de fluxo">
          <CFDChart stages={adv.cfd.stages} points={adv.cfd.points} />
        </ChartCard>
      );
    }
    charts.push(
      <ChartCard key="aging" title="Work item aging" hint="Itens parados além do normal → Itens parados (aging)">
        <AgingScatter points={adv.aging.points} stageOrder={stageOrder} p50={adv.aging.p50} p85={adv.aging.p85} />
      </ChartCard>,
      <ChartCard key="hist" title="Histograma de cycle time" hint="Contexto — dispersão do tempo de entrega (em dias)">
        <CycleHistogram buckets={adv.histogram.buckets} p50={adv.histogram.p50} p85={adv.histogram.p85} p95={adv.histogram.p95} />
      </ChartCard>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {pillar === "flow" ? "📊" : "🔄"} Pilar {info.n} · {info.title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{info.question}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* métricas do pilar com tier + meta */}
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((mt) => (
            <PillarMetric key={mt.key} mt={mt} isWeak={weakest.has(mt.key)} />
          ))}
        </div>
        {/* gráficos reutilizados */}
        <div className="grid gap-4 lg:grid-cols-2">{charts}</div>
      </CardContent>
    </Card>
  );
}

function PillarMetric({ mt, isWeak }: { mt: MetricEval; isWeak: boolean }) {
  const { lang } = useLang();
  const chip = mt.tier ? TIER_META[mt.tier] : null;
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border border-border p-3", isWeak && "border-l-4 border-l-amber-500 bg-amber-500/[0.03]")}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{metricLabel(mt.key, lang, mt.label)}</p>
        <p className="text-[11px] text-muted-foreground">
          {mt.tier == null ? "sem dados suficientes" : mt.nextTarget ? `meta: ${mt.nextTarget}` : "no topo ✓"}
          {isWeak && <span className="ml-1.5 font-medium text-amber-600">· elo mais fraco</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("text-xl font-bold tabular-nums", tierTextClass(mt.tier))}>{mt.display}</span>
        {chip ? (
          <Badge variant={chip.token} className="text-[9px]">{chip.name}</Badge>
        ) : (
          <Badge variant="secondary" className="text-[9px]">—</Badge>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

// ── C) Pilar 3 — Ownership (comportamental) ───────────────────────────
function OwnershipPillar({ team, tier, assessment }: { team: DashboardMaturityData["team"]; tier: Tier | null; assessment: DashboardMaturityData["assessment"] }) {
  const info = PILLAR_INFO.ownership;
  const signals = assessment?.signals ?? {};
  const readiness = behavioralReadiness(signals);
  const meta = READINESS_META[readiness.label];
  const defs = signalDefs(team.board_type);
  const gradReady = tier != null && tier >= 2 && readiness.pct != null && readiness.pct >= 75;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">👥 Pilar {info.n} · {info.title}</CardTitle>
          <span className={cn("text-sm font-semibold", meta.tone)}>
            {meta.label}
            {readiness.pct != null ? ` · ${readiness.pct}%` : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{info.question}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sinais comportamentais avaliados pelo coach — alimentam a prontidão de graduação, não o tier quantitativo.
        </p>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {defs.map((d) => {
            const v = signals[d.key] as SignalValue | undefined;
            const r = v ? RUBRIC[v] : null;
            const tone = v === "consistent" ? "text-primary" : v === "emerging" ? "text-amber-600" : v === "not_yet" ? "text-destructive" : "text-muted-foreground/60";
            return (
              <li key={d.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground/80">{d.label}</span>
                <span className={cn("shrink-0 text-xs font-medium", tone)}>{r?.label ?? "—"}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Gate de graduação</p>
            <p className="text-xs text-muted-foreground">métricas em Gold+ e sinais ≥ 75%</p>
          </div>
          <div className="flex items-center gap-3">
            {gradReady ? (
              <Badge variant="platinum" className="font-semibold">Pronto para revisão</Badge>
            ) : (
              <Badge variant="secondary">Ainda não</Badge>
            )}
            <Link href="/coaching" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Avaliar no Coaching Hub <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

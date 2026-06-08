"use client";

import * as React from "react";
import { RefreshCw, Sparkles, ChevronDown } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CycleScatter, ThroughputBar, VelocityBar, BurndownLine } from "@/components/charts";
import { CFDChart, AgingScatter, CycleHistogram, TrendsChart } from "@/components/charts-advanced";

const PERIODS = [
  { v: "4", label: "4 semanas" },
  { v: "8", label: "8 semanas" },
  { v: "12", label: "12 semanas" },
];

export default function DashboardPage() {
  const { selectedTeam } = useTeam();
  const [m, setM] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [epic, setEpic] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [weeks, setWeeks] = React.useState("12");
  const [sprint, setSprint] = React.useState("all");
  const [syncing, setSyncing] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const [syncMsg, setSyncMsg] = React.useState<string | null>(null);
  const [insights, setInsights] = React.useState<any>(null);
  const [insightLoading, setInsightLoading] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  React.useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ teamId: selectedTeam.id, weeks });
    if (epic !== "all") qs.set("epic", epic);
    if (type !== "all") qs.set("type", type);
    if (sprint !== "all") qs.set("sprintId", sprint);
    fetch(`/api/metrics?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error)))))
      .then(setM)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [selectedTeam, epic, type, weeks, sprint, refresh]);

  // insight automático (separado, cacheado por time)
  React.useEffect(() => {
    if (!selectedTeam) return;
    setInsightLoading(true);
    setInsights(null);
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: selectedTeam.id }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInsights(d.insights))
      .catch(() => setInsights(null))
      .finally(() => setInsightLoading(false));
  }, [selectedTeam, refresh]);

  React.useEffect(() => {
    setEpic("all");
    setType("all");
    setSprint("all");
  }, [selectedTeam?.id]);

  async function doSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no sync");
      setSyncMsg(`${data.total} itens sincronizados do Jira`);
      setRefresh((x) => x + 1);
    } catch (e) {
      setSyncMsg((e as Error).message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  if (loading && !m) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    );
  }
  if (!m) return <p className="text-sm text-destructive">{err}</p>;

  const f = m.flow;
  const adv = m.advanced;
  const isScrum = m.team.board_type === "scrum";
  const stageOrder: string[] = adv.cfd.stages.map((s: any) => s.jira);

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{m.team.name}</h1>
            <Badge variant="secondary" title="A estrutura (board, sprints, épicos) é real no Jira; a linha do tempo é sintética para demonstração.">
              histórico sintético · demo
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{m.team.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={epic} onValueChange={setEpic}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Épico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os épicos</SelectItem>
              {m.availableFilters.epics.map((e: any) => <SelectItem key={e.key} value={e.key}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {m.availableFilters.types.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {isScrum ? (
            <Select value={sprint} onValueChange={setSprint}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Sprint" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os sprints</SelectItem>
                {(m.scrum?.sprints ?? []).map((s: { id: string; name: string; state: string }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.state === "active" ? " ●" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={weeks} onValueChange={setWeeks}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={doSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </Button>
        </div>
      </div>
      {syncMsg && <p className="text-xs text-primary">{syncMsg}</p>}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {insightLoading ? "IA interpretando cada métrica…" : "Leitura automática da IA em cada métrica"}
      </div>

      {/* 4 KPIs principais — cada um com a interpretação da IA */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard accent label="Cycle time" value={f.deliveryCycleTime.median} unit="d" sub={`p85 ${f.deliveryCycleTime.p85}d`} insight={insights?.cycleTime} />
        {isScrum ? (
          <KpiCard label="Velocity" value={m.scrum?.avgVelocity ?? 0} unit="pts" sub={`σ ${m.scrum?.velocityStdev ?? 0}`} insight={insights?.secondary} />
        ) : (
          <KpiCard label="Throughput" value={f.throughput.perWeekAvg} unit="/sem" sub="itens concluídos" insight={insights?.secondary} />
        )}
        <KpiCard label="Flow efficiency" value={Math.round(f.flowEfficiency * 100)} unit="%" sub="ativo ÷ total" insight={insights?.flowEfficiency} />
        {isScrum ? (
          <KpiCard label="Previsibilidade" value={Math.round((m.scrum?.sayDoRatioAvg ?? 0) * 100)} unit="%" sub="say-do ratio" insight={insights?.predictability} />
        ) : (
          <KpiCard label="Previsibilidade" value={f.deliveryCycleTime.p85} unit="d" sub={`SLE: 85% ≤ ${f.deliveryCycleTime.p85}d`} insight={insights?.predictability} />
        )}
      </div>

      {/* 1 gráfico principal + leitura da IA */}
      <Card>
        <CardHeader><CardTitle>Cycle time — distribuição e tendência</CardTitle></CardHeader>
        <CardContent>
          <CycleScatter data={f.scatter} p50={f.deliveryCycleTime.median} p85={f.deliveryCycleTime.p85} />
          {insights?.chart && (
            <p className="mt-3 flex items-start gap-1.5 border-t border-border/60 pt-3 text-xs leading-snug text-foreground/80">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <span>{insights.chart}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Métricas avançadas — secundário, recolhível */}
      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          Métricas avançadas (flow) {showAdvanced ? "" : "— mostrar"}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle>Cumulative Flow Diagram (CFD)</CardTitle></CardHeader>
              <CardContent><CFDChart stages={adv.cfd.stages} points={adv.cfd.points} /></CardContent>
            </Card>
            <section className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Evolução (throughput · WIP · cycle time)</CardTitle></CardHeader><CardContent><TrendsChart data={adv.trends} /></CardContent></Card>
              {isScrum && m.scrum ? (
                <Card><CardHeader><CardTitle>Sprint burndown — {m.scrum.currentSprint?.name}</CardTitle></CardHeader><CardContent><BurndownLine data={m.scrum.burndown} /></CardContent></Card>
              ) : (
                <Card><CardHeader><CardTitle>Throughput por semana</CardTitle></CardHeader><CardContent><ThroughputBar series={f.throughput.series} /></CardContent></Card>
              )}
              <Card><CardHeader><CardTitle>Work item aging</CardTitle></CardHeader><CardContent><AgingScatter points={adv.aging.points} stageOrder={stageOrder} p50={adv.aging.p50} p85={adv.aging.p85} /></CardContent></Card>
              <Card><CardHeader><CardTitle>Cycle time histogram</CardTitle></CardHeader><CardContent><CycleHistogram buckets={adv.histogram.buckets} p50={adv.histogram.p50} p85={adv.histogram.p85} p95={adv.histogram.p95} /></CardContent></Card>
              {isScrum && m.scrum && (
                <Card><CardHeader><CardTitle>Velocity</CardTitle></CardHeader><CardContent><VelocityBar data={m.scrum.velocity} /></CardContent></Card>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

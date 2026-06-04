"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CycleScatter, ThroughputBar, VelocityBar, BurndownLine, StageBar } from "@/components/charts";
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
  const [syncing, setSyncing] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);
  const [syncMsg, setSyncMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ teamId: selectedTeam.id, weeks });
    if (epic !== "all") qs.set("epic", epic);
    if (type !== "all") qs.set("type", type);
    fetch(`/api/metrics?${qs}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error)))))
      .then(setM)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [selectedTeam, epic, type, weeks, refresh]);

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

  // reseta filtros ao trocar de time
  React.useEffect(() => {
    setEpic("all");
    setType("all");
  }, [selectedTeam?.id]);

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
    <div className="space-y-8">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{m.team.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{m.team.description}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.totals.issues} itens · {m.totals.epics} épicos · dados do Jira (campos reais)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={epic} onValueChange={setEpic}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Épico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os épicos</SelectItem>
              {m.availableFilters.epics.map((e: any) => <SelectItem key={e.key} value={e.key}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {m.availableFilters.types.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={weeks} onValueChange={setWeeks}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={doSync} disabled={syncing} title="Reler os dados do Jira">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </Button>
        </div>
      </div>
      {syncMsg && <p className="-mt-4 text-xs text-primary">{syncMsg}</p>}

      {/* Flow cycle times */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Flow cycle times</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard accent label="Discovery cycle time" value={f.discoveryCycleTime.median} unit="d" sub={`p85 ${f.discoveryCycleTime.p85} · p95 ${f.discoveryCycleTime.p95}`} />
          <KpiCard accent label="Delivery cycle time" value={f.deliveryCycleTime.median} unit="d" sub={`p85 ${f.deliveryCycleTime.p85} · p95 ${f.deliveryCycleTime.p95}`} />
          <KpiCard accent label="Release cycle time" value={f.releaseCycleTime.median} unit="d" sub={`p85 ${f.releaseCycleTime.p85}`} />
          <KpiCard label="Lead time" value={f.leadTime.median} unit="d" sub={`p85 ${f.leadTime.p85} · p95 ${f.leadTime.p95}`} />
        </div>
      </section>

      {/* KPIs do método */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">{isScrum ? "Scrum" : "Fluxo"}</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {isScrum && m.scrum ? (
            <>
              <KpiCard label="Velocity (média)" value={m.scrum.avgVelocity} unit="pts" sub={`σ ${m.scrum.velocityStdev}`} />
              <KpiCard label="Say-do ratio" value={Math.round(m.scrum.sayDoRatioAvg * 100)} unit="%" sub="committed × done" />
              <KpiCard label="Sprint atual" value={`${m.scrum.currentSprint?.completed ?? 0}/${m.scrum.currentSprint?.committed ?? 0}`} unit="pts" sub={m.scrum.currentSprint?.name} />
              <KpiCard label="Flow efficiency" value={Math.round(f.flowEfficiency * 100)} unit="%" sub="ativo ÷ total" />
            </>
          ) : (
            <>
              <KpiCard label="Throughput" value={f.throughput.perWeekAvg} unit="/sem" sub="itens concluídos" />
              <KpiCard label="WIP (em fluxo)" value={f.wip} sub={`${f.deliveryWip} em delivery`} />
              <KpiCard label="Flow efficiency" value={Math.round(f.flowEfficiency * 100)} unit="%" sub="ativo ÷ total" />
              <KpiCard label="Itens entregues" value={f.totalReleased} sub="total (Live / Done)" />
            </>
          )}
        </div>
      </section>

      {/* CFD — assinatura */}
      <Card>
        <CardHeader><CardTitle>Cumulative Flow Diagram (CFD)</CardTitle></CardHeader>
        <CardContent><CFDChart stages={adv.cfd.stages} points={adv.cfd.points} /></CardContent>
      </Card>

      {/* Gráficos do método */}
      <section className="grid gap-4 lg:grid-cols-2">
        {isScrum && m.scrum ? (
          <>
            <Card><CardHeader><CardTitle>Velocity</CardTitle></CardHeader><CardContent><VelocityBar data={m.scrum.velocity} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Sprint burndown — {m.scrum.currentSprint?.name}</CardTitle></CardHeader><CardContent><BurndownLine data={m.scrum.burndown} /></CardContent></Card>
          </>
        ) : (
          <>
            <Card><CardHeader><CardTitle>Cycle time scatterplot</CardTitle></CardHeader><CardContent><CycleScatter data={f.scatter} p50={f.deliveryCycleTime.median} p85={f.deliveryCycleTime.p85} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Throughput por semana</CardTitle></CardHeader><CardContent><ThroughputBar series={f.throughput.series} /></CardContent></Card>
          </>
        )}
      </section>

      {/* Aging + Histograma */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Work item aging</CardTitle></CardHeader><CardContent><AgingScatter points={adv.aging.points} stageOrder={stageOrder} p50={adv.aging.p50} p85={adv.aging.p85} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Cycle time histogram</CardTitle></CardHeader><CardContent><CycleHistogram buckets={adv.histogram.buckets} p50={adv.histogram.p50} p85={adv.histogram.p85} p95={adv.histogram.p95} /></CardContent></Card>
      </section>

      {/* Evolução + WIP por estágio */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Evolução (throughput · WIP · cycle time)</CardTitle></CardHeader><CardContent><TrendsChart data={adv.trends} /></CardContent></Card>
        <Card><CardHeader><CardTitle>WIP por estágio (dual-track)</CardTitle></CardHeader><CardContent><StageBar data={f.stageDistribution} /></CardContent></Card>
      </section>
    </div>
  );
}

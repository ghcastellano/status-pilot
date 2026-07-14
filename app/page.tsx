"use client";

import * as React from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, ChevronDown, Plug } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { useT, useLang } from "@/components/lang-context";
import { buildChartInsights } from "@/lib/chart-insights";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CycleScatter, ThroughputBar, VelocityBar, BurndownLine } from "@/components/charts";
import { CFDChart, AgingScatter, CycleHistogram, TrendsChart } from "@/components/charts-advanced";
import { DashboardMaturity, type DashboardMaturityData } from "@/components/dashboard-maturity";

const PERIODS = [
  { v: "4", label: "4 semanas" },
  { v: "8", label: "8 semanas" },
  { v: "12", label: "12 semanas" },
];

/** Nota concreta (números reais) abaixo de um gráfico. */
function ChartNote({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="mt-3 flex items-start gap-1.5 border-t border-border/60 pt-3 text-xs leading-snug text-foreground/80">
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
      <span>{text}</span>
    </p>
  );
}

export default function DashboardPage() {
  const t = useT();
  const { lang } = useLang();
  const { selectedTeam, teams, loading: teamsLoading } = useTeam();
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
  const [mat, setMat] = React.useState<DashboardMaturityData | null>(null);
  const autoSyncedRef = React.useRef<Set<string>>(new Set());

  // Resync TRANSPARENTE e RARO: só puxa do Jira em background quando os dados do
  // time estão realmente velhos (>24h) ou nunca sincronizados — NÃO a cada abertura
  // (as métricas e o histórico já vêm do banco, sem API). Silencioso, sem mensagem.
  // Guard por ref evita repetição na mesma sessão.
  const maybeResync = React.useCallback((team: any) => {
    if (!team?.jira_board_id || autoSyncedRef.current.has(team.id)) return;
    const last = team.last_synced_at ? Date.parse(team.last_synced_at) : 0;
    if (Date.now() - last < 24 * 60 * 60 * 1000) return; // sincronizado nas últimas 24h → nada a fazer
    autoSyncedRef.current.add(team.id);
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: team.id }),
    })
      .then(() => setRefresh((x) => x + 1)) // recarrega do banco com os dados frescos
      .catch(() => {});
  }, []);

  // Maturidade do time (UNFILTERED — nível é propriedade do time, igual ao Coaching Hub)
  React.useEffect(() => {
    if (!selectedTeam) return;
    let active = true;
    setMat(null);
    // Mesma janela do dashboard (sprint/weeks) → tier e KPIs consistentes.
    const cq = new URLSearchParams({ teamId: selectedTeam.id, weeks });
    if (sprint !== "all") cq.set("sprintIds", sprint);
    fetch(`/api/coaching/team?${cq}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: DashboardMaturityData) => active && setMat(d))
      .catch(() => active && setMat(null));
    return () => {
      active = false;
    };
  }, [selectedTeam?.id, refresh, sprint, weeks]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!selectedTeam) return;
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ teamId: selectedTeam.id, weeks });
    if (epic !== "all") qs.set("epic", epic);
    if (type !== "all") qs.set("type", type);
    if (sprint !== "all") qs.set("sprintIds", sprint); // janela = sprint(s) selecionado(s)
    fetch(`/api/metrics?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error)))))
      .then((d) => {
        setM(d);
        maybeResync(d?.team); // resync transparente se stale
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [selectedTeam, epic, type, weeks, sprint, refresh]);

  // insight automático — refaz sempre que time ou filtros mudam
  React.useEffect(() => {
    if (!selectedTeam) return;
    setInsightLoading(true);
    setInsights(null);
    fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: selectedTeam.id,
        epic: epic !== "all" ? epic : undefined,
        type: type !== "all" ? type : undefined,
        weeks: Number(weeks),
        sprintId: sprint !== "all" ? sprint : undefined,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setInsights(d.insights))
      .catch(() => setInsights(null))
      .finally(() => setInsightLoading(false));
  }, [selectedTeam, epic, type, weeks, sprint, refresh]);

  React.useEffect(() => {
    setEpic("all");
    setType("all");
    setSprint("all");
  }, [selectedTeam?.id]);

  async function doSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      // Sincroniza SÓ o time atual (mais barato; não puxa todos os boards).
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedTeam ? { teamId: selectedTeam.id } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no sync");
      setSyncMsg(t(`${data.total} itens sincronizados`, `${data.total} items synced`));
      setRefresh((x) => x + 1);
    } catch (e) {
      setSyncMsg((e as Error).message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  // Onboarding: sem times configurados → conectar Jira (fluxo multi-empresa)
  if (!teamsLoading && teams.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Plug className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Conecte seu Jira para começar", "Connect your Jira to get started")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          {t("Nenhum time configurado ainda. Conecte o Jira da sua empresa e escolha os projetos que quer analisar — a maturidade sai de dados reais.", "No teams configured yet. Connect your company's Jira and pick the projects to analyze — maturity comes from real data.")}
        </p>
        <Link href="/config">
          <Button className="mt-6">
            <Plug className="h-4 w-4" /> {t("Ir para Configurar", "Go to Setup")}
          </Button>
        </Link>
      </div>
    );
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
  const ci = buildChartInsights(m, lang);

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{m.team.name}</h1>
            {m.team.jira_board_id ? (
              <Badge variant="secondary" title="Dados reais do Jira (issues, sprints e changelog), salvos no banco.">
                Jira · dados reais
              </Badge>
            ) : (
              <Badge variant="secondary" title="Time de demonstração — linha do tempo sintética.">
                demo
              </Badge>
            )}
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
              <SelectTrigger className="w-52"><SelectValue placeholder="Sprint" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("Últimas 6 sprints fechadas", "Last 6 closed sprints")}</SelectItem>
                {/* Só fechados + ativo (futuros ficam fora). Ativo = métricas atuais, sem maturidade. */}
                {(m.window?.availableSprints ?? []).slice().reverse().map((s: { id: string; name: string; state: string }) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.state === "active" ? ` ● ${t("ativo · sem maturidade", "active · no maturity")}` : ""}
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
            {syncing ? t("Sincronizando…", "Syncing…") : t("Sincronizar", "Sync")}
          </Button>
          <Link href="/config">
            <Button variant="ghost" className="text-muted-foreground" title={t("Configurar conexão do Jira e times", "Configure Jira connection and teams")}>
              {t("Configurar", "Setup")}
            </Button>
          </Link>
        </div>
      </div>
      {syncMsg && <p className="text-xs text-primary">{syncMsg}</p>}

      {/* ═══ BLOCO 1 — MÉTRICAS DO TIME (o que está acontecendo) ═══ */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t("Métricas do time", "Team metrics")}</h2>
          {m.window?.label && (
            <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground">
              {t("Período", "Window")}: {lang === "en" ? (m.window.labelEn ?? m.window.label) : m.window.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {insightLoading ? t("IA interpretando cada métrica…", "AI reading each metric…") : t("Leitura automática da IA em cada métrica", "Automatic AI reading of each metric")}
        </div>

        {/* 4 KPIs principais — cada um com a interpretação da IA */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard accent label={t("Cycle time", "Cycle time")} value={f.deliveryCycleTime.median} unit="d" sub={t(`méd ${f.deliveryCycleTime.mean}d · med ${f.deliveryCycleTime.median}d · p85 ${f.deliveryCycleTime.p85}d`, `mean ${f.deliveryCycleTime.mean}d · median ${f.deliveryCycleTime.median}d · p85 ${f.deliveryCycleTime.p85}d`)} insight={insights?.cycleTime} />
          {isScrum ? (
            <KpiCard label={t("Velocity", "Velocity")} value={m.scrum?.avgVelocity ?? 0} unit="pts" sub={`σ ${m.scrum?.velocityStdev ?? 0}`} insight={insights?.secondary} />
          ) : (
            <KpiCard label={t("Throughput", "Throughput")} value={f.throughput.perWeekAvg} unit="/sem" sub={t("itens concluídos", "items done")} insight={insights?.secondary} />
          )}
          <KpiCard label={t("Eficiência de fluxo", "Flow efficiency")} value={Math.round(f.flowEfficiency * 100)} unit="%" sub={t("ativo ÷ total", "active ÷ total")} insight={insights?.flowEfficiency} />
          {isScrum ? (
            <KpiCard label={t("Taxa de Acerto do Sprint", "Sprint Hit Rate")} value={Math.round((m.scrum?.sayDoRatioAvg ?? 0) * 100)} unit="%" sub={t("entregue ÷ combinado", "delivered ÷ committed")} insight={insights?.predictability} />
          ) : (
            <KpiCard label={t("Previsibilidade", "Predictability")} value={f.deliveryCycleTime.p85} unit="d" sub={`SLE: 85% ≤ ${f.deliveryCycleTime.p85}d`} insight={insights?.predictability} />
          )}
        </div>

        {/* Gráfico principal — cycle time (distribuição + tendência) */}
        <Card>
          <CardHeader><CardTitle>{t("Cycle time — distribuição e tendência", "Cycle time — distribution & trend")}</CardTitle></CardHeader>
          <CardContent>
            <CycleScatter data={f.scatter} p50={f.deliveryCycleTime.median} p85={f.deliveryCycleTime.p85} />
            <ChartNote text={ci.cycle} />
            {insights?.chart && (
              <p className="mt-3 flex items-start gap-1.5 border-t border-border/60 pt-3 text-xs leading-snug text-foreground/80">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span>{insights.chart}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ═══ BLOCO 2 — MÉTRICAS AVANÇADAS (aprofundar — recolhido) ═══ */}
      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          {t("Métricas avançadas", "Advanced metrics")} ({isScrum ? "scrum" : "flow"}) {showAdvanced ? "" : t("— mostrar", "— show")}
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {isScrum && m.scrum ? (
              /* ── SCRUM: cada gráfico UMA vez ── */
              <section className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>{t("Velocity por sprint", "Velocity by sprint")}</CardTitle></CardHeader>
                  <CardContent><VelocityBar data={m.scrum.velocity} /><ChartNote text={ci.velocity} /></CardContent>
                </Card>
                {m.scrum.currentSprint && (
                  <Card>
                    <CardHeader><CardTitle>{t("Sprint burndown", "Sprint burndown")} — {m.scrum.currentSprint.name}</CardTitle></CardHeader>
                    <CardContent><BurndownLine data={m.scrum.burndown} /><ChartNote text={ci.burndown} /></CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader><CardTitle>{t("Envelhecimento de itens (aging)", "Work item aging")}</CardTitle></CardHeader>
                  <CardContent><AgingScatter points={adv.aging.points} stageOrder={stageOrder} p50={adv.aging.p50} p85={adv.aging.p85} /><ChartNote text={ci.aging} /></CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>{t("Cycle time — histograma", "Cycle time histogram")}</CardTitle></CardHeader>
                  <CardContent><CycleHistogram buckets={adv.histogram.buckets} p50={adv.histogram.p50} p85={adv.histogram.p85} p95={adv.histogram.p95} /><ChartNote text={ci.histogram} /></CardContent>
                </Card>
              </section>
            ) : (
              /* ── KANBAN: cada gráfico UMA vez ── */
              <>
                <Card>
                  <CardHeader><CardTitle>{t("Diagrama de Fluxo Cumulativo (CFD)", "Cumulative Flow Diagram (CFD)")}</CardTitle></CardHeader>
                  <CardContent><CFDChart stages={adv.cfd.stages} points={adv.cfd.points} /><ChartNote text={ci.cfd} /></CardContent>
                </Card>
                <section className="grid gap-4 lg:grid-cols-2">
                  <Card><CardHeader><CardTitle>{t("Evolução (throughput · WIP · cycle time)", "Trends (throughput · WIP · cycle time)")}</CardTitle></CardHeader><CardContent><TrendsChart data={adv.trends} /><ChartNote text={ci.trends} /></CardContent></Card>
                  <Card><CardHeader><CardTitle>{t("Throughput por semana", "Throughput per week")}</CardTitle></CardHeader><CardContent><ThroughputBar series={f.throughput.series} /><ChartNote text={ci.throughput} /></CardContent></Card>
                  <Card><CardHeader><CardTitle>{t("Envelhecimento de itens (aging)", "Work item aging")}</CardTitle></CardHeader><CardContent><AgingScatter points={adv.aging.points} stageOrder={stageOrder} p50={adv.aging.p50} p85={adv.aging.p85} /><ChartNote text={ci.aging} /></CardContent></Card>
                  <Card><CardHeader><CardTitle>{t("Cycle time — histograma", "Cycle time histogram")}</CardTitle></CardHeader><CardContent><CycleHistogram buckets={adv.histogram.buckets} p50={adv.histogram.p50} p85={adv.histogram.p85} p95={adv.histogram.p95} /><ChartNote text={ci.histogram} /></CardContent></Card>
                </section>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ BLOCO 3 — MATURIDADE DO TIME (o veredito — por último) ═══ */}
      {!mat ? (
        <div className="space-y-4">
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : (mat as any).maturity == null ? (
        <Card>
          <CardHeader><CardTitle>{t("Maturidade do time", "Team maturity")}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t(
                "Sprint ativo selecionado — a maturidade não é avaliada porque o sprint ainda não fechou. Acima você vê as métricas atuais em tempo real. Selecione “Últimas 6 sprints fechadas” para ver a maturidade.",
                "Active sprint selected — maturity isn't evaluated because the sprint hasn't closed yet. Above are the current live metrics. Pick “Last 6 closed sprints” to see maturity."
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <DashboardMaturity data={mat} />
      )}
    </div>
  );
}

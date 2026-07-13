/**
 * lib/chart-insights.ts — insights DETERMINÍSTICOS e concretos por gráfico,
 * derivados dos números REAIS do payload de métricas (não texto de IA / não
 * genérico). Cada string cita valores exatos (p50/p85, outliers, hit rate,
 * WIP…) para ajudar a análise. Bilíngue PT/EN.
 */
type Lang = "pt" | "en";

export interface ChartInsights {
  cycle?: string;
  velocity?: string;
  burndown?: string;
  aging?: string;
  histogram?: string;
  cfd?: string;
  throughput?: string;
  trends?: string;
}

export function buildChartInsights(m: any, lang: Lang): ChartInsights {
  const t = (pt: string, en: string) => (lang === "en" ? en : pt);
  const out: ChartInsights = {};
  const f = m?.flow;
  const adv = m?.advanced;
  const sc = m?.scrum;

  if (f?.deliveryCycleTime) {
    const ct = f.deliveryCycleTime;
    const scatter: any[] = f.scatter ?? [];
    const outliers = scatter.filter((s) => s.cycleDays > ct.p85);
    const biggest = scatter.reduce((a: any, b: any) => (b.cycleDays > (a?.cycleDays ?? -1) ? b : a), null);
    out.cycle = t(
      `${ct.count} itens entregues. Metade fecha em ≤${ct.median}d (mediana), 85% em ≤${ct.p85}d (média ${ct.mean}d). ${outliers.length} outlier(s) acima do p85${biggest ? ` — o mais lento: ${biggest.key} com ${biggest.cycleDays}d` : ""}.`,
      `${ct.count} items delivered. Half finish in ≤${ct.median}d (median), 85% in ≤${ct.p85}d (mean ${ct.mean}d). ${outliers.length} outlier(s) above p85${biggest ? ` — slowest: ${biggest.key} at ${biggest.cycleDays}d` : ""}.`
    );
  }

  if (sc?.velocity?.length) {
    const v = sc.velocity;
    const last = v[v.length - 1];
    const hit = last && last.committed > 0 ? Math.round((last.completed / last.committed) * 100) : null;
    const cv = sc.velocityCV != null ? `, CV ${Math.round(sc.velocityCV * 100)}%` : "";
    out.velocity = t(
      `Média ${sc.avgVelocity} pts/sprint (σ ${sc.velocityStdev}${cv}). Último (${last.sprint}): combinou ${last.committed}, entregou ${last.completed}${hit != null ? ` = ${hit}%` : ""}. Taxa de acerto média da janela: ${Math.round(sc.sayDoRatioAvg * 100)}%.`,
      `Avg ${sc.avgVelocity} pts/sprint (σ ${sc.velocityStdev}${cv}). Last (${last.sprint}): committed ${last.committed}, delivered ${last.completed}${hit != null ? ` = ${hit}%` : ""}. Window hit rate: ${Math.round(sc.sayDoRatioAvg * 100)}%.`
    );
  }

  if (sc?.currentSprint) {
    const cs = sc.currentSprint;
    const remaining = Math.max(0, (cs.committed ?? 0) - (cs.completed ?? 0));
    const prog = cs.committed > 0 ? Math.round((cs.completed / cs.committed) * 100) : 0;
    out.burndown = t(
      `${cs.name}: ${cs.completed}/${cs.committed} pts entregues (${prog}%), ${remaining} restam. Dia ${cs.daysElapsed} de ${cs.daysTotal} do sprint.`,
      `${cs.name}: ${cs.completed}/${cs.committed} pts done (${prog}%), ${remaining} left. Day ${cs.daysElapsed} of ${cs.daysTotal}.`
    );
  }

  if (adv?.aging) {
    const pts: any[] = adv.aging.points ?? [];
    const overP85 = pts.filter((p) => p.ageDays > adv.aging.p85);
    const oldest = pts[0]; // já ordenado desc por idade
    out.aging = t(
      `${pts.length} itens em progresso. Idade p50 ${adv.aging.p50}d, p85 ${adv.aging.p85}d. ${overP85.length} já passou do p85${oldest ? ` — o mais parado: ${oldest.key} há ${oldest.ageDays}d em "${oldest.stage}"` : ""}.`,
      `${pts.length} items in progress. Age p50 ${adv.aging.p50}d, p85 ${adv.aging.p85}d. ${overP85.length} past p85${oldest ? ` — most stuck: ${oldest.key} for ${oldest.ageDays}d in "${oldest.stage}"` : ""}.`
    );
  }

  if (adv?.histogram) {
    const h = adv.histogram;
    const tail = (f?.scatter ?? []).filter((s: any) => s.cycleDays > h.p85).length;
    out.histogram = t(
      `Cycle time: p50 ${h.p50}d, p85 ${h.p85}d, p95 ${h.p95}d. Cauda longa: ${tail} item(ns) acima do p85 puxam o risco de prazo — a diferença p85→p95 mede a variabilidade.`,
      `Cycle time: p50 ${h.p50}d, p85 ${h.p85}d, p95 ${h.p95}d. Long tail: ${tail} item(s) above p85 drive delivery risk — p85→p95 gap measures variability.`
    );
  }

  if (f?.throughput?.series?.length) {
    const s: any[] = f.throughput.series;
    const peak = s.reduce((a: any, b: any) => (b.count > (a?.count ?? -1) ? b : a), null);
    const last4 = s.slice(-4).reduce((a: number, b: any) => a + b.count, 0) / Math.min(4, s.length);
    out.throughput = t(
      `Média ${f.throughput.perWeekAvg} itens/semana. Últimas 4 sem: ${Math.round(last4 * 10) / 10}/sem${peak ? `; pico de ${peak.count} em ${peak.weekLabel}` : ""}.`,
      `Avg ${f.throughput.perWeekAvg} items/week. Last 4 wks: ${Math.round(last4 * 10) / 10}/wk${peak ? `; peak of ${peak.count} in ${peak.weekLabel}` : ""}.`
    );
  }

  if (adv?.trends?.length) {
    const tr = adv.trends;
    const first = tr[0];
    const last = tr[tr.length - 1];
    const wipDelta = last.wip - first.wip;
    out.trends = t(
      `WIP ${last.wip} agora (${wipDelta >= 0 ? "+" : ""}${wipDelta} vs início da janela). Throughput recente ${last.throughput}/sem${last.cycleTimeP50 != null ? `, cycle p50 ${last.cycleTimeP50}d` : ""}. WIP subindo com throughput estável = fila crescendo (Lei de Little).`,
      `WIP ${last.wip} now (${wipDelta >= 0 ? "+" : ""}${wipDelta} vs window start). Recent throughput ${last.throughput}/wk${last.cycleTimeP50 != null ? `, cycle p50 ${last.cycleTimeP50}d` : ""}. Rising WIP with flat throughput = growing queue (Little's Law).`
    );
  }

  if (adv?.cfd) {
    const wip = (adv.aging?.points ?? []).length;
    out.cfd = t(
      `WIP atual ${wip} itens pelos estágios. Bandas que alargam ao longo do tempo = acúmulo (gargalo à frente); bandas paralelas = fluxo estável. A distância vertical ≈ WIP, a horizontal ≈ cycle time.`,
      `Current WIP ${wip} items across stages. Widening bands = build-up (bottleneck ahead); parallel bands = stable flow. Vertical gap ≈ WIP, horizontal ≈ cycle time.`
    );
  }

  return out;
}

/**
 * lib/metrics.ts — cálculo determinístico das métricas de fluxo dual-track.
 *
 * FONTE ÚNICA DE VERDADE: dashboard e snapshot do LLM usam estas funções.
 * Termos técnicos em inglês (cycle time, throughput, lead time, WIP, flow
 * efficiency, say-do ratio) por alinhamento com a literatura.
 */

export type BoardType = "scrum" | "kanban";
export type IssueType = "story" | "bug" | "task";
export type IssueStatus = "To Do" | "In Progress" | "Done";

export interface TeamRow {
  id: string;
  name: string;
  board_type: BoardType;
  description: string | null;
  jira_label?: string | null;
  jira_project_key?: string | null;
}

export interface SprintRow {
  id: string;
  team_id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  committed_points: number;
  state: "active" | "closed" | "future";
}

export interface StageStamp {
  key: string;
  jira: string;
  kind: "wait" | "active" | "done";
  at: string;
}

export interface IssueRow {
  id: string;
  team_id: string;
  sprint_id: string | null;
  epic_key: string | null;
  issue_key: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  current_stage: string;
  story_points: number | null;
  created_at: string;
  discovery_started_at: string | null;
  discovery_done_at: string | null;
  committed_at: string | null;
  started_at: string | null;
  review_started_at: string | null;
  done_at: string | null;
  released_at: string | null;
  stages: StageStamp[];
}

const DAY = 86_400_000;
const ms = (s: string | null) => (s ? new Date(s).getTime() : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] * (hi - idx) + sortedAsc[hi] * (idx - lo);
}

export function referenceNow(issues: IssueRow[]): number {
  let max = 0;
  for (const i of issues)
    for (const t of [i.created_at, i.started_at, i.done_at, i.released_at]) {
      const v = ms(t);
      if (v && v > max) max = v;
    }
  return max || Date.now();
}

export interface CtStat { median: number; p85: number; p95: number; count: number }

/** estatística de um intervalo entre dois carimbos (em dias). */
function intervalStats(issues: IssueRow[], from: keyof IssueRow, to: keyof IssueRow): CtStat {
  const vals = issues
    .map((i) => {
      const a = ms(i[from] as string | null);
      const b = ms(i[to] as string | null);
      return a && b ? (b - a) / DAY : null;
    })
    .filter((x): x is number => x != null && x >= 0)
    .sort((a, b) => a - b);
  return {
    median: round1(percentile(vals, 0.5)),
    p85: round1(percentile(vals, 0.85)),
    p95: round1(percentile(vals, 0.95)),
    count: vals.length,
  };
}

const MONTHS = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const wkLabel = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

export interface ScatterPoint {
  key: string;
  title: string;
  type: IssueType;
  doneDate: string;
  cycleDays: number;
}
export interface StageCount { stage: string; count: number; kind: string }

export interface FlowMetrics {
  discoveryCycleTime: CtStat;
  deliveryCycleTime: CtStat;
  leadTime: CtStat;
  flowEfficiency: number; // 0..1
  throughput: { perWeekAvg: number; series: { weekLabel: string; weekStart: string; count: number }[] };
  wip: number; // tudo em fluxo (fora do funil e de Live/Done)
  deliveryWip: number; // só estágios de delivery (In Progress → Ready for Release)
  stageDistribution: StageCount[];
  scatter: ScatterPoint[];
  totalReleased: number;
}

/** Flow efficiency média: tempo "ativo" / tempo total, a partir dos stages. */
function flowEfficiency(issues: IssueRow[]): number {
  const ratios: number[] = [];
  for (const i of issues) {
    const st = i.stages;
    if (!st || st.length < 2) continue;
    let active = 0, total = 0;
    for (let k = 0; k < st.length - 1; k++) {
      const dur = (ms(st[k + 1].at)! - ms(st[k].at)!);
      if (dur <= 0) continue;
      total += dur;
      if (st[k].kind === "active") active += dur;
    }
    if (total > 0) ratios.push(active / total);
  }
  if (!ratios.length) return 0;
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100;
}

export function computeFlow(issues: IssueRow[], now: number, weeks = 8): FlowMetrics {
  const released = issues.filter((i) => i.released_at);
  const delivered = issues.filter((i) => i.started_at && i.done_at);

  const scatter: ScatterPoint[] = delivered
    .map((i) => ({
      key: i.issue_key,
      title: i.title,
      type: i.type,
      doneDate: i.done_at!.slice(0, 10),
      cycleDays: round1((ms(i.done_at)! - ms(i.started_at)!) / DAY),
    }))
    .sort((a, b) => (a.doneDate < b.doneDate ? -1 : 1));

  const series: FlowMetrics["throughput"]["series"] = [];
  for (let w = weeks; w >= 1; w--) {
    const start = now - w * 7 * DAY;
    const end = now - (w - 1) * 7 * DAY;
    const count = released.filter((i) => {
      const t = ms(i.released_at)!;
      return t >= start && t < end;
    }).length;
    series.push({ weekLabel: wkLabel(new Date(start)), weekStart: new Date(start).toISOString().slice(0, 10), count });
  }
  const perWeekAvg = round1(series.reduce((a, b) => a + b.count, 0) / (series.length || 1));

  // distribuição por estágio atual (exclui Live/Done — foco no fluxo ativo)
  const dist = new Map<string, { count: number; kind: string }>();
  for (const i of issues) {
    if (/live|done/i.test(i.current_stage)) continue;
    const stage = i.stages.find((s) => s.jira === i.current_stage);
    const cur = dist.get(i.current_stage) ?? { count: 0, kind: stage?.kind ?? "wait" };
    cur.count++;
    dist.set(i.current_stage, cur);
  }
  const stageDistribution: StageCount[] = Array.from(dist.entries()).map(([stage, v]) => ({
    stage, count: v.count, kind: v.kind,
  }));

  return {
    discoveryCycleTime: intervalStats(issues, "discovery_started_at", "discovery_done_at"),
    deliveryCycleTime: intervalStats(issues, "started_at", "done_at"),
    leadTime: intervalStats(issues, "created_at", "released_at"),
    flowEfficiency: flowEfficiency(issues),
    throughput: { perWeekAvg, series },
    // WIP = tudo "em fluxo": fora do funil (Opportunity Backlog) e de Live/Done.
    wip: issues.filter(
      (i) =>
        !/opportunity backlog/i.test(i.current_stage) &&
        !/live\s*\/\s*done/i.test(i.current_stage)
    ).length,
    deliveryWip: issues.filter((i) => i.status === "In Progress").length,
    stageDistribution,
    scatter,
    totalReleased: released.length,
  };
}

// ── SCRUM ────────────────────────────────────────────────────
export interface VelocityPoint { sprint: string; committed: number; completed: number }
export interface BurndownPoint { day: number; date: string; ideal: number; actual: number | null }
export interface ScrumMetrics {
  avgVelocity: number;
  velocityStdev: number;
  velocity: VelocityPoint[];
  sayDoRatioAvg: number;
  currentSprint: {
    id: string; name: string; goal: string | null;
    committed: number; completed: number; sayDo: number;
    daysElapsed: number; daysTotal: number;
  } | null;
  burndown: BurndownPoint[];
}

function completedWithin(sprint: SprintRow, issues: IssueRow[]): number {
  const end = new Date(sprint.end_date + "T23:59:59Z").getTime();
  return issues
    .filter((i) => i.sprint_id === sprint.id && i.done_at && ms(i.done_at)! <= end)
    .reduce((a, i) => a + (i.story_points ?? 0), 0);
}

export function computeScrum(sprints: SprintRow[], issues: IssueRow[], now: number): ScrumMetrics {
  const ordered = [...sprints].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const closed = ordered.filter((s) => s.state === "closed");
  const velocity = ordered.map((s) => ({
    sprint: s.name, committed: s.committed_points, completed: completedWithin(s, issues),
  }));
  const cv = closed.map((s) => completedWithin(s, issues));
  const avgVelocity = cv.length ? cv.reduce((a, b) => a + b, 0) / cv.length : 0;
  const variance = cv.length ? cv.reduce((a, v) => a + (v - avgVelocity) ** 2, 0) / cv.length : 0;
  const sd = closed.map((s) => completedWithin(s, issues) / s.committed_points);
  const sayDoRatioAvg = sd.length ? Math.round((sd.reduce((a, b) => a + b, 0) / sd.length) * 100) / 100 : 0;

  const active = ordered.find((s) => s.state === "active") ?? null;
  let currentSprint: ScrumMetrics["currentSprint"] = null;
  const burndown: BurndownPoint[] = [];
  if (active) {
    const start = new Date(active.start_date + "T00:00:00Z").getTime();
    const endMid = new Date(active.end_date + "T00:00:00Z").getTime();
    const daysTotal = Math.round((endMid - start) / DAY);
    const daysElapsed = Math.min(daysTotal, Math.max(0, Math.round((now - start) / DAY)));
    const completed = completedWithin(active, issues);
    currentSprint = {
      id: active.id, name: active.name, goal: active.goal,
      committed: active.committed_points, completed,
      sayDo: completed / active.committed_points, daysElapsed, daysTotal,
    };
    const committed = active.committed_points;
    const sis = issues.filter((i) => i.sprint_id === active.id);
    for (let d = 0; d <= daysTotal; d++) {
      const dayEnd = start + d * DAY;
      const burned = sis.filter((i) => i.done_at && ms(i.done_at)! <= dayEnd).reduce((a, i) => a + (i.story_points ?? 0), 0);
      burndown.push({
        day: d, date: new Date(dayEnd).toISOString().slice(0, 10),
        ideal: round1(committed - (committed * d) / daysTotal),
        actual: dayEnd <= now ? committed - burned : null,
      });
    }
  }
  return { avgVelocity: round1(avgVelocity), velocityStdev: round1(Math.sqrt(variance)), velocity, sayDoRatioAvg, currentSprint, burndown };
}

// ── AVANÇADO (estilo eazyBI / Actionable Agile — construído por nós) ──
export interface CFDPoint { date: string; [stageKey: string]: number | string }
export interface CFDSeries { stages: { key: string; jira: string }[]; points: CFDPoint[] }
export interface AgingPoint { key: string; title: string; stage: string; stageKey: string; ageDays: number; kind: string }
export interface HistogramBucket { day: number; count: number }
export interface TrendPoint { weekLabel: string; throughput: number; cycleTimeP50: number | null; wip: number }
export interface AdvancedMetrics {
  cfd: CFDSeries;
  aging: { points: AgingPoint[]; p50: number; p85: number };
  histogram: { buckets: HistogramBucket[]; p50: number; p85: number; p95: number };
  trends: TrendPoint[];
}

/** ordem canônica dos estágios (de uma issue que percorreu todos). */
function canonicalStages(issues: IssueRow[]) {
  let best: StageStamp[] = [];
  for (const i of issues) if ((i.stages?.length ?? 0) > best.length) best = i.stages;
  return best.map((s) => ({ key: s.key, jira: s.jira, kind: s.kind }));
}

/** Cumulative Flow Diagram: por dia, quantos itens há em cada estágio. */
function computeCFD(issues: IssueRow[], order: ReturnType<typeof canonicalStages>, fromMs: number, toMs: number): CFDSeries {
  const entryMaps = issues.map((i) => {
    const m = new Map<string, number>();
    for (const s of i.stages ?? []) m.set(s.key, new Date(s.at).getTime());
    return m;
  });
  const points: CFDPoint[] = [];
  for (let t = fromMs; t <= toMs; t += DAY) {
    const entered = order.map((s) => entryMaps.filter((m) => { const v = m.get(s.key); return v != null && v <= t; }).length);
    const pt: CFDPoint = { date: new Date(t).toISOString().slice(0, 10) };
    for (let si = 0; si < order.length; si++) pt[order[si].key] = entered[si] - (entered[si + 1] ?? 0);
    points.push(pt);
  }
  return { stages: order.map((s) => ({ key: s.key, jira: s.jira })), points };
}

/** Work Item Aging: itens em fluxo, com idade no estágio atual. */
function computeAging(issues: IssueRow[], now: number): AgingPoint[] {
  return issues
    .filter((i) => !/opportunity backlog/i.test(i.current_stage) && !/live\s*\/\s*done/i.test(i.current_stage))
    .map((i) => {
      const st = i.stages.find((s) => s.jira === i.current_stage) ?? i.stages[i.stages.length - 1];
      return {
        key: i.issue_key, title: i.title, stage: i.current_stage,
        stageKey: st?.key ?? "", ageDays: round1((now - new Date(st.at).getTime()) / DAY), kind: st?.kind ?? "wait",
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
}

/** Histograma de cycle time (delivery), bin de 1 dia. */
function cycleHistogram(issues: IssueRow[]) {
  const cts = issues.filter((i) => i.started_at && i.done_at)
    .map((i) => (ms(i.done_at)! - ms(i.started_at)!) / DAY).sort((a, b) => a - b);
  const max = cts.length ? Math.ceil(cts[cts.length - 1]) : 0;
  const buckets: HistogramBucket[] = [];
  for (let d = 0; d <= max; d++) buckets.push({ day: d, count: cts.filter((c) => c >= d && c < d + 1).length });
  return { buckets, p50: round1(percentile(cts, 0.5)), p85: round1(percentile(cts, 0.85)), p95: round1(percentile(cts, 0.95)) };
}

/** Trends semanais: throughput, cycle time p50 e WIP ao fim de cada semana. */
function weeklyTrends(issues: IssueRow[], now: number, weeks: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let w = weeks; w >= 1; w--) {
    const start = now - w * 7 * DAY, end = now - (w - 1) * 7 * DAY;
    const rel = issues.filter((i) => i.released_at && ms(i.released_at)! >= start && ms(i.released_at)! < end);
    const cts = rel.filter((i) => i.started_at && i.done_at)
      .map((i) => (ms(i.done_at)! - ms(i.started_at)!) / DAY).sort((a, b) => a - b);
    const wip = issues.filter((i) => {
      const flow = i.stages[1] ? ms(i.stages[1].at)! : Infinity;
      const rl = i.released_at ? ms(i.released_at)! : Infinity;
      return flow <= end && rl > end;
    }).length;
    out.push({ weekLabel: wkLabel(new Date(start)), throughput: rel.length, cycleTimeP50: cts.length ? round1(percentile(cts, 0.5)) : null, wip });
  }
  return out;
}

function computeAdvanced(issues: IssueRow[], now: number, weeks: number): AdvancedMetrics {
  const order = canonicalStages(issues);
  const cfd = computeCFD(issues, order, now - weeks * 7 * DAY, now);
  const agingPts = computeAging(issues, now);
  const ages = agingPts.map((a) => a.ageDays).sort((a, b) => a - b);
  return {
    cfd,
    aging: { points: agingPts, p50: round1(percentile(ages, 0.5)), p85: round1(percentile(ages, 0.85)) },
    histogram: cycleHistogram(issues),
    trends: weeklyTrends(issues, now, weeks),
  };
}

export interface FilterOptions { epic?: string | null; type?: string | null; weeks?: number }

export interface TeamMetrics {
  team: TeamRow;
  flow: FlowMetrics;
  scrum: ScrumMetrics | null;
  advanced: AdvancedMetrics;
  totals: { issues: number; epics: number };
  appliedFilters: { epic: string | null; type: string | null; weeks: number };
  availableFilters: { epics: { key: string; name: string }[]; types: string[] };
}

export function computeTeamMetrics(
  team: TeamRow,
  sprints: SprintRow[],
  issues: IssueRow[],
  opts: FilterOptions & { epicNames?: Record<string, string> } = {}
): TeamMetrics {
  const weeks = opts.weeks ?? 12;
  const allTeam = issues.filter((i) => i.team_id === team.id);

  // opções de filtro (a partir de TODAS as issues do time)
  const epicKeys = Array.from(new Set(allTeam.map((i) => i.epic_key).filter(Boolean))) as string[];
  const availableFilters = {
    epics: epicKeys.map((k) => ({ key: k, name: opts.epicNames?.[k] ?? k })),
    types: Array.from(new Set(allTeam.map((i) => i.type))).sort(),
  };

  // aplica filtros
  let ti = allTeam;
  if (opts.epic) ti = ti.filter((i) => i.epic_key === opts.epic);
  if (opts.type) ti = ti.filter((i) => i.type === opts.type);

  const now = referenceNow(allTeam);
  const flow = computeFlow(ti, now, weeks);
  const advanced = computeAdvanced(ti, now, weeks);
  const scrum = team.board_type === "scrum"
    ? computeScrum(sprints.filter((s) => s.team_id === team.id), ti, now)
    : null;
  const epics = new Set(ti.map((i) => i.epic_key).filter(Boolean)).size;

  return {
    team, flow, scrum, advanced,
    totals: { issues: ti.length, epics },
    appliedFilters: { epic: opts.epic ?? null, type: opts.type ?? null, weeks },
    availableFilters,
  };
}

// ── Insight automático: deltas/tendências p/ a IA interpretar ──
export interface InsightInput {
  team: string;
  method: BoardType;
  cycleTimeMedian: number;
  cycleTimeDeltaPct: number | null; // últimas 2 sem vs 4 anteriores
  throughputAvg: number;
  throughputDeltaPct: number | null;
  flowEfficiencyPct: number;
  predictabilityP85: number; // SLE: 85% entregam em ≤ X dias
  wipNow: number;
  wipTrend: "subindo" | "caindo" | "estável";
  agingHotspot: { stage: string; ageDays: number } | null;
  velocity: number | null; // Scrum
  sayDoPct: number | null; // Scrum
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const deltaPct = (recent: number, prior: number): number | null =>
  prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;

export function computeInsightInput(m: TeamMetrics): InsightInput {
  const tr = m.advanced.trends;
  const cts = tr.map((t) => t.cycleTimeP50).filter((x): x is number => x != null);
  const ctRecent = avg(cts.slice(-2));
  const ctPrior = avg(cts.slice(-6, -2));
  const tps = tr.map((t) => t.throughput);
  const tpRecent = avg(tps.slice(-2));
  const tpPrior = avg(tps.slice(-6, -2));
  const wips = tr.map((t) => t.wip);
  const wipNow = wips.at(-1) ?? m.flow.wip;
  const wipPrior = wips.at(-5) ?? wipNow;
  const wipTrend = wipNow > wipPrior * 1.15 ? "subindo" : wipNow < wipPrior * 0.85 ? "caindo" : "estável";
  const hot = m.advanced.aging.points[0]; // já ordenado desc por idade

  return {
    team: m.team.name,
    method: m.team.board_type,
    cycleTimeMedian: m.flow.deliveryCycleTime.median,
    cycleTimeDeltaPct: ctPrior > 0 ? deltaPct(ctRecent, ctPrior) : null,
    throughputAvg: m.flow.throughput.perWeekAvg,
    throughputDeltaPct: tpPrior > 0 ? deltaPct(tpRecent, tpPrior) : null,
    flowEfficiencyPct: Math.round(m.flow.flowEfficiency * 100),
    predictabilityP85: m.flow.deliveryCycleTime.p85,
    wipNow,
    wipTrend,
    agingHotspot: hot ? { stage: hot.stage, ageDays: hot.ageDays } : null,
    velocity: m.scrum?.avgVelocity ?? null,
    sayDoPct: m.scrum ? Math.round(m.scrum.sayDoRatioAvg * 100) : null,
  };
}

// ── Bundle de ANÁLISE para a IA investigar (não só o número agregado) ──
export interface AnalysisBundle {
  team: string;
  method: BoardType;
  cycleTime: { median: number; p85: number; deltaPct: number | null; weeklyP50: (number | null)[] };
  throughput: { avgPerWeek: number; deltaPct: number | null; weekly: number[] };
  flowEfficiencyPct: number;
  predictability: { sle85: number };
  byEpic: { epic: string; items: number; cycleMedian: number; cycleP85: number }[];
  byStage: { stage: string; kind: string; medianDays: number; recentDays: number | null; priorDays: number | null }[];
  outliers: { key: string; title: string; epic: string; deliveryDays: number; slowestStage: string }[];
  agingHotspot: { stage: string; ageDays: number } | null;
}

export function computeAnalysisBundle(
  m: TeamMetrics,
  issues: IssueRow[],
  epicNames: Record<string, string>
): AnalysisBundle {
  const now = referenceNow(issues);
  const inp = computeInsightInput(m);
  const released = issues.filter((i) => i.released_at && i.started_at && i.done_at);
  const delivery = (i: IssueRow) => (ms(i.done_at)! - ms(i.started_at)!) / DAY;
  const allCt = released.map(delivery).sort((a, b) => a - b);
  const p85all = percentile(allCt, 0.85);
  const epicName = (k: string | null) => (k ? epicNames[k] ?? k : "—");

  // por épico
  const epicMap = new Map<string, number[]>();
  for (const i of released) {
    const k = i.epic_key ?? "—";
    if (!epicMap.has(k)) epicMap.set(k, []);
    epicMap.get(k)!.push(delivery(i));
  }
  const byEpic = Array.from(epicMap.entries())
    .map(([k, v]) => {
      const s = v.slice().sort((a, b) => a - b);
      return { epic: epicName(k), items: v.length, cycleMedian: round1(percentile(s, 0.5)), cycleP85: round1(percentile(s, 0.85)) };
    })
    .sort((a, b) => b.cycleMedian - a.cycleMedian);

  // por estágio: tempo de permanência (recente vs anterior)
  const order = canonicalStages(issues);
  const recentCut = now - 21 * DAY;
  const byStage = order
    .filter((s) => s.kind !== "done")
    .map((s) => {
      const all: number[] = [], recent: number[] = [], prior: number[] = [];
      for (const i of issues) {
        const idx = i.stages.findIndex((x) => x.key === s.key);
        if (idx < 0 || idx + 1 >= i.stages.length) continue;
        const dwell = (ms(i.stages[idx + 1].at)! - ms(i.stages[idx].at)!) / DAY;
        if (dwell < 0) continue;
        all.push(dwell);
        const endRef = i.released_at ? ms(i.released_at)! : ms(i.stages[idx + 1].at)!;
        (endRef > recentCut ? recent : prior).push(dwell);
      }
      const md = (a: number[]) => (a.length ? round1(percentile(a.slice().sort((x, y) => x - y), 0.5)) : null);
      return { stage: s.jira, kind: s.kind, medianDays: md(all) ?? 0, recentDays: md(recent), priorDays: md(prior) };
    });

  // outliers (acima do p85) com épico e estágio mais lento
  const outliers = released
    .filter((i) => delivery(i) > p85all)
    .map((i) => {
      let slow = "", maxD = -1;
      for (let k = 0; k < i.stages.length - 1; k++) {
        const d = (ms(i.stages[k + 1].at)! - ms(i.stages[k].at)!) / DAY;
        if (d > maxD) { maxD = d; slow = i.stages[k].jira; }
      }
      return { key: i.issue_key, title: i.title, epic: epicName(i.epic_key), deliveryDays: round1(delivery(i)), slowestStage: slow };
    })
    .sort((a, b) => b.deliveryDays - a.deliveryDays)
    .slice(0, 8);

  return {
    team: m.team.name,
    method: m.team.board_type,
    cycleTime: { median: m.flow.deliveryCycleTime.median, p85: m.flow.deliveryCycleTime.p85, deltaPct: inp.cycleTimeDeltaPct, weeklyP50: m.advanced.trends.map((t) => t.cycleTimeP50) },
    throughput: { avgPerWeek: m.flow.throughput.perWeekAvg, deltaPct: inp.throughputDeltaPct, weekly: m.advanced.trends.map((t) => t.throughput) },
    flowEfficiencyPct: Math.round(m.flow.flowEfficiency * 100),
    predictability: { sle85: m.flow.deliveryCycleTime.p85 },
    byEpic,
    byStage,
    outliers,
    agingHotspot: inp.agingHotspot,
  };
}

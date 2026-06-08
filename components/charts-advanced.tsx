"use client";

import {
  AreaChart, Area, ScatterChart, Scatter, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, ZAxis, ReferenceLine, ReferenceArea, ResponsiveContainer, Tooltip, CartesianGrid, Cell, Legend,
} from "recharts";

const ACCENT = "#2f8f7a";
const MUTED = "#94a3b8";
const GRID = "rgba(148,163,184,0.18)";
const axis = { stroke: MUTED, fontSize: 11, tickLine: false, axisLine: false } as const;
const xLabel = (value: string) => ({ value, position: "insideBottom" as const, offset: -6, fontSize: 11, fill: MUTED });
const yLabel = (value: string) => ({ value, angle: -90, position: "insideLeft" as const, offset: 8, style: { textAnchor: "middle" as const }, fontSize: 11, fill: MUTED });
const tip = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
} as const;
const shortDate = (v: string) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

// paleta DISTINTA e contrastante (verde da marca + hues separados), legível em vídeo
const CFD_COLORS = ["#2f8f7a", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#f43f5e", "#f59e0b", "#84cc16", "#14b8a6", "#64748b"];

// ── Cumulative Flow Diagram ──
export function CFDChart({ stages, points }: { stages: { key: string; jira: string }[]; points: any[] }) {
  const ordered = [...stages].reverse(); // live na base
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" {...axis} tickFormatter={shortDate} minTickGap={32} label={xLabel("Data")} />
          <YAxis {...axis} width={44} allowDecimals={false} label={yLabel("Itens (acumulado por estágio)")} />
          <Tooltip {...tip} labelFormatter={(v) => new Date(v).toLocaleDateString("pt-BR")} />
          {ordered.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} stackId="1" name={s.jira}
              stroke={CFD_COLORS[i % CFD_COLORS.length]} fill={CFD_COLORS[i % CFD_COLORS.length]} fillOpacity={0.92} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tooltip do aging com o NOME da issue. */
function AgingTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-[240px] rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium leading-snug text-foreground">{p.title}</div>
      <div className="mt-0.5 text-muted-foreground">{p.key} · {p.ageDays} dias em “{p.stage}”</div>
    </div>
  );
}

// ── Work Item Aging (formato Kanbanize/Actionable Agile) ──
export function AgingScatter({
  points, stageOrder, p50, p85,
}: {
  points: { key: string; title: string; stage: string; ageDays: number; kind: string }[];
  stageOrder: string[]; p50: number; p85: number;
}) {
  const flowStages = stageOrder.filter((s) => !/opportunity backlog|live\s*\/\s*done/i.test(s));
  const stageIdx = new Map(flowStages.map((s, i) => [s, i]));
  const abbrev = (s: string) => s.replace(/ \/ .*/, "").replace(/\(.*\)/, "").trim();

  // mapeia cada item para posição numérica no eixo X com jitter leve para evitar sobreposição
  const stageCounts = new Map<number, number>();
  const mapped = points
    .filter((p) => stageIdx.has(p.stage))
    .map((p) => {
      const xi = stageIdx.get(p.stage)!;
      const c = stageCounts.get(xi) ?? 0;
      stageCounts.set(xi, c + 1);
      const jitter = (c % 5 - 2) * 0.07;
      return { ...p, x: xi + jitter };
    });

  const zoneColor = (d: number) => d > p85 ? "#ef4444" : d > p50 ? "#f59e0b" : ACCENT;
  const maxY = Math.max(p85 * 1.6, ...mapped.map((p) => p.ageDays), 1);

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 48, bottom: 64, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={true} strokeDasharray="2 4" />
          {/* zonas coloridas de risco */}
          <ReferenceArea y1={0} y2={p50} fill={ACCENT} fillOpacity={0.05} />
          <ReferenceArea y1={p50} y2={p85} fill="#f59e0b" fillOpacity={0.09} />
          <ReferenceArea y1={p85} y2={maxY} fill="#ef4444" fillOpacity={0.07} />
          <XAxis
            type="number" dataKey="x"
            domain={[-0.5, flowStages.length - 0.5]}
            ticks={flowStages.map((_, i) => i)}
            tickFormatter={(v) => abbrev(flowStages[Math.round(v)] ?? "")}
            {...axis} angle={-35} textAnchor="end" height={72}
          />
          <YAxis type="number" dataKey="ageDays" {...axis} unit="d" width={48}
            domain={[0, maxY]} label={yLabel("Idade no estágio (dias)")} />
          <ZAxis range={[52, 52]} />
          <ReferenceLine y={p50} stroke={ACCENT} strokeDasharray="4 4"
            label={{ value: `p50 ${p50}d`, fontSize: 10, fill: ACCENT, position: "insideTopRight" }} />
          <ReferenceLine y={p85} stroke="#c2701c" strokeDasharray="4 4"
            label={{ value: `p85 ${p85}d`, fontSize: 10, fill: "#c2701c", position: "insideTopRight" }} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<AgingTooltip />} />
          <Scatter data={mapped}>
            {mapped.map((p, i) => (
              <Cell key={i} fill={zoneColor(p.ageDays)} fillOpacity={0.85} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Cycle Time Histogram ──
export function CycleHistogram({
  buckets, p50, p85, p95,
}: {
  buckets: { day: number; count: number }[]; p50: number; p85: number; p95: number;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" {...axis} unit="d" label={xLabel("Cycle time (dias)")} />
          <YAxis {...axis} allowDecimals={false} width={44} label={yLabel("Nº de itens")} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,143,122,0.08)" }} formatter={(v: any) => [`${v} itens`, "quantidade"]} labelFormatter={(d) => `${d}–${d + 1} dias`} />
          <ReferenceLine x={p50} stroke={ACCENT} strokeDasharray="4 4" label={{ value: `p50`, fontSize: 10, fill: ACCENT, position: "top" }} />
          <ReferenceLine x={p85} stroke="#c2701c" strokeDasharray="4 4" label={{ value: `p85`, fontSize: 10, fill: "#c2701c", position: "top" }} />
          <ReferenceLine x={p95} stroke="#b3261e" strokeDasharray="4 4" label={{ value: `p95`, fontSize: 10, fill: "#b3261e", position: "top" }} />
          <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Trends: throughput + cycle time + WIP (evolução) ──
export function TrendsChart({
  data,
}: {
  data: { weekLabel: string; throughput: number; cycleTimeP50: number | null; wip: number }[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 32, right: 12, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="weekLabel" {...axis} minTickGap={16} label={xLabel("Semana (início)")} />
          <YAxis yAxisId="left" {...axis} allowDecimals={false} width={40} label={yLabel("Itens (throughput / WIP)")} />
          <YAxis yAxisId="right" orientation="right" {...axis} unit="d" width={44} label={{ ...yLabel("Cycle time (dias)"), angle: 90 }} />
          <Tooltip {...tip} labelFormatter={(l) => `Semana de ${l}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" verticalAlign="top" />
          <Bar yAxisId="left" dataKey="throughput" name="Throughput (itens/sem)" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line yAxisId="left" type="monotone" dataKey="wip" name="WIP (itens)" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="cycleTimeP50" name="Cycle time p50 (dias)" stroke={ACCENT} strokeWidth={2.5} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

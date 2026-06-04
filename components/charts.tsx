"use client";

import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, Tooltip, CartesianGrid, Legend,
} from "recharts";

const ACCENT = "#2f8f7a";
const MUTED = "#94a3b8";
const GRID = "rgba(148,163,184,0.18)";

const axis = { stroke: MUTED, fontSize: 11, tickLine: false, axisLine: false } as const;
const xLabel = (value: string) => ({ value, position: "insideBottom" as const, offset: -6, fontSize: 11, fill: MUTED });
const yLabel = (value: string) => ({ value, angle: -90, position: "insideLeft" as const, offset: 8, style: { textAnchor: "middle" as const }, fontSize: 11, fill: MUTED });

function Box({ children }: { children: React.ReactNode }) {
  return <div className="h-72 w-full">{children}</div>;
}

const tip = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
} as const;

/** Tooltip de scatter que mostra o NOME da issue (não o ID). */
function IssueTooltip({ active, payload, valueLabel }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-[240px] rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium leading-snug text-foreground">{p.title}</div>
      <div className="mt-0.5 text-muted-foreground">
        {p.key} · {p.y} {valueLabel}
        {p.dateLabel ? ` · ${p.dateLabel}` : ""}
      </div>
    </div>
  );
}

// ── Cycle Time Scatterplot (estilo Kanbanize) com p50/p85 ──
export function CycleScatter({
  data, p50, p85,
}: {
  data: { doneDate: string; cycleDays: number; key: string; title: string }[];
  p50: number; p85: number;
}) {
  const points = data.map((d) => ({
    x: new Date(d.doneDate).getTime(), y: d.cycleDays, key: d.key, title: d.title,
    dateLabel: new Date(d.doneDate).toLocaleDateString("pt-BR"),
  }));
  return (
    <Box>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            type="number" dataKey="x" domain={["dataMin", "dataMax"]} {...axis}
            tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            label={xLabel("Data de conclusão")}
          />
          <YAxis type="number" dataKey="y" {...axis} unit="d" width={48} label={yLabel("Cycle time (dias)")} />
          <ZAxis range={[55, 55]} />
          <ReferenceLine y={p50} stroke={ACCENT} strokeDasharray="4 4" label={{ value: `p50 ${p50}d`, fontSize: 10, fill: ACCENT, position: "insideTopLeft" }} />
          <ReferenceLine y={p85} stroke="#c2701c" strokeDasharray="4 4" label={{ value: `p85 ${p85}d`, fontSize: 10, fill: "#c2701c", position: "insideTopLeft" }} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<IssueTooltip valueLabel="dias" />} />
          <Scatter data={points} fill={ACCENT} fillOpacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ── Throughput por semana ──
export function ThroughputBar({ series }: { series: { weekLabel: string; count: number }[] }) {
  return (
    <Box>
      <ResponsiveContainer>
        <BarChart data={series} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="weekLabel" {...axis} label={xLabel("Semana (início)")} />
          <YAxis {...axis} allowDecimals={false} width={44} label={yLabel("Itens concluídos")} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,143,122,0.08)" }} formatter={(v: any) => [`${v} itens`, "concluídos"]} labelFormatter={(l) => `Semana de ${l}`} />
          <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ── Velocity: committed vs completed ──
export function VelocityBar({ data }: { data: { sprint: string; committed: number; completed: number }[] }) {
  return (
    <Box>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="sprint" {...axis} label={xLabel("Sprint")} />
          <YAxis {...axis} width={44} label={yLabel("Story points")} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,143,122,0.08)" }} formatter={(v: any, n: any) => [`${v} pts`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
          <Bar dataKey="committed" name="Committed" fill={MUTED} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="completed" name="Completed" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ── Sprint Burndown: ideal vs real ──
export function BurndownLine({ data }: { data: { date: string; ideal: number; actual: number | null }[] }) {
  return (
    <Box>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" {...axis} tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} minTickGap={24} label={xLabel("Dia da sprint")} />
          <YAxis {...axis} width={44} label={yLabel("Pontos restantes")} />
          <Tooltip {...tip} labelFormatter={(v) => new Date(v).toLocaleDateString("pt-BR")} formatter={(v: any, n: any) => [`${v} pts`, n]} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          <Line type="monotone" dataKey="ideal" name="Ideal" stroke={MUTED} strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="actual" name="Real" stroke={ACCENT} dot={false} strokeWidth={2.5} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

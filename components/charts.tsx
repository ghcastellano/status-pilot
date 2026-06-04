"use client";

import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, Tooltip, Cell, CartesianGrid, Legend,
} from "recharts";

const ACCENT = "#2f8f7a";
const ACCENT_SOFT = "#9cc7bd";
const MUTED = "#94a3b8";
const GRID = "rgba(148,163,184,0.18)";

const axis = { stroke: MUTED, fontSize: 11, tickLine: false, axisLine: false } as const;

function Box({ children }: { children: React.ReactNode }) {
  return <div className="h-64 w-full">{children}</div>;
}

const tip = {
  contentStyle: {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    color: "hsl(var(--foreground))",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
} as const;

// ── Cycle Time Scatterplot (estilo Kanbanize) com p50/p85 ──
export function CycleScatter({
  data, p50, p85,
}: {
  data: { doneDate: string; cycleDays: number; key: string; title: string }[];
  p50: number; p85: number;
}) {
  const points = data.map((d) => ({ x: new Date(d.doneDate).getTime(), y: d.cycleDays, key: d.key, title: d.title }));
  return (
    <Box>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            type="number" dataKey="x" domain={["dataMin", "dataMax"]} {...axis}
            tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          />
          <YAxis type="number" dataKey="y" {...axis} unit="d" width={36} />
          <ZAxis range={[50, 50]} />
          <ReferenceLine y={p50} stroke={ACCENT} strokeDasharray="4 4" label={{ value: `p50 ${p50}d`, fontSize: 10, fill: ACCENT, position: "insideTopLeft" }} />
          <ReferenceLine y={p85} stroke="#c2701c" strokeDasharray="4 4" label={{ value: `p85 ${p85}d`, fontSize: 10, fill: "#c2701c", position: "insideTopLeft" }} />
          <Tooltip {...tip} formatter={(v: any, n: any) => (n === "y" ? [`${v} d`, "cycle time"] : v)}
            labelFormatter={(v) => new Date(v).toLocaleDateString("pt-BR")} />
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
        <BarChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="weekLabel" {...axis} />
          <YAxis {...axis} allowDecimals={false} width={32} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,143,122,0.08)" }} formatter={(v: any) => [`${v}`, "concluídos"]} />
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
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="sprint" {...axis} />
          <YAxis {...axis} width={32} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,143,122,0.08)" }} />
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
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" {...axis} tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} minTickGap={24} />
          <YAxis {...axis} width={32} unit="" />
          <Tooltip {...tip} labelFormatter={(v) => new Date(v).toLocaleDateString("pt-BR")} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          <Line type="monotone" dataKey="ideal" name="Ideal" stroke={MUTED} strokeDasharray="5 5" dot={false} strokeWidth={1.5} />
          <Line type="monotone" dataKey="actual" name="Real" stroke={ACCENT} dot={false} strokeWidth={2.5} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

// ── WIP por estágio (fluxo dual-track) ──
export function StageBar({ data }: { data: { stage: string; count: number; kind: string }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="stage" {...axis} width={150} />
          <Tooltip {...tip} cursor={{ fill: "rgba(47,143,122,0.08)" }} formatter={(v: any) => [`${v}`, "itens"]} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.kind === "active" ? ACCENT : ACCENT_SOFT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

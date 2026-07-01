"use client";

import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import type { Tier } from "@/lib/maturity";

const MUTED = "#94a3b8";
const GRID = "rgba(148,163,184,0.18)";
// Recharts precisa de hex cru (paleta metálica — espelha os tokens do tema)
const TIER_HEX: Record<Tier, string> = { 1: "#94A3B8", 2: "#D4AF37", 3: "#0EA5B7" };
const TIER_NAME: Record<Tier, string> = { 1: "Silver", 2: "Gold", 3: "Platinum" };

const axis = { stroke: MUTED, fontSize: 11, tickLine: false, axisLine: false } as const;

export interface MaturityWeek {
  as_of: string; // YYYY-MM-DD
  tier: Tier | null;
  metrics?: { metrics?: { label: string; display: string }[] } | null;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const wk = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

function TierTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const tier = p.tier as Tier | null;
  return (
    <div className="max-w-[220px] rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-foreground">
        Semana de {p.label} ·{" "}
        <span style={{ color: tier ? TIER_HEX[tier] : undefined }}>
          {tier ? TIER_NAME[tier] : "sem dados"}
        </span>
      </div>
      {(p.rows ?? []).map((r: { label: string; display: string }) => (
        <div key={r.label} className="mt-0.5 text-muted-foreground">
          {r.label}: <span className="text-foreground">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

/** Maturidade semana a semana — barra colorida pelo tier (Silver/Gold/Platinum). */
export function MaturityHistoryChart({ data }: { data: MaturityWeek[] }) {
  const rows = data.map((d) => ({
    label: wk(d.as_of),
    tier: d.tier,
    value: d.tier ?? 0,
    rows: d.metrics?.metrics?.map((m) => ({ label: m.label, display: m.display })) ?? [],
  }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" {...axis} interval={1} />
          <YAxis
            {...axis}
            domain={[0, 3]}
            ticks={[1, 2, 3]}
            width={64}
            tickFormatter={(v: number) => TIER_NAME[v as Tier] ?? ""}
          />
          <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TierTooltip />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.tier ? TIER_HEX[r.tier] : MUTED} fillOpacity={r.tier ? 0.85 : 0.25} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

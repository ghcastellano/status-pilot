"use client";

import * as React from "react";
import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type MaturityResult,
  type Tier,
  type TierToken,
  TIER_META,
  tierTextClass,
  tierAccentClass,
} from "@/lib/maturity";

interface TeamMaturity {
  team: { id: string; name: string; board_type: "scrum" | "kanban"; description: string | null };
  maturity: MaturityResult;
  history: { as_of: string; tier: Tier | null }[];
}

const TIER_ORDER: Tier[] = [1, 2, 3];
const BAR_CLASS: Record<TierToken, string> = {
  silver: "bg-silver",
  gold: "bg-gold",
  platinum: "bg-platinum",
};
const RING_CLASS: Record<TierToken, string> = {
  silver: "ring-2 ring-silver/50",
  gold: "ring-2 ring-gold/50",
  platinum: "ring-2 ring-platinum/50",
};

export default function CoachingPage() {
  const [data, setData] = React.useState<TeamMaturity[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetch("/api/coaching/portfolio", { cache: "no-store" })
      .then((r) =>
        r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error ?? "Falha ao carregar")))
      )
      .then((res: { boards: TeamMaturity[] }) => active && setData(res.boards))
      .catch((e: Error) => active && setErr(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const bands = React.useMemo(() => {
    const b: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
    for (const d of data ?? []) if (d.maturity.tier) b[d.maturity.tier] += 1;
    return b;
  }, [data]);
  const total = data?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Coaching · Maturidade</h1>
            <Badge
              variant="secondary"
              title="Thresholds de maturidade ainda não calibrados com dados reais de campo."
            >
              thresholds a calibrar
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada time é classificado pelo elo mais fraco (weakest-link). Métricas e cards
            mudam conforme o método — <span className="font-medium">Scrum</span> ou{" "}
            <span className="font-medium">Kanban</span>.
          </p>
        </div>
      </div>

      {/* Distribuição de maturidade */}
      {data && total > 0 && (
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Distribuição de maturidade · {total} {total === 1 ? "time" : "times"}
          </p>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {TIER_ORDER.map((t) =>
              bands[t] > 0 ? (
                <div
                  key={t}
                  className={BAR_CLASS[TIER_META[t].token]}
                  style={{ width: `${(bands[t] / total) * 100}%` }}
                  title={`${TIER_META[t].name}: ${bands[t]}`}
                />
              ) : null
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {TIER_ORDER.map((t) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", BAR_CLASS[TIER_META[t].token])} />
                <span className="text-muted-foreground">{TIER_META[t].name}</span>
                <span className="font-semibold">{bands[t]}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Estados */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {/* Cards por time (diferentes por método) */}
      {data && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <MaturityTeamCard key={d.team.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Movimento no período: delta entre o primeiro e o último tier da série. */
function movement(history: { tier: Tier | null }[]): { label: string; tone: string } | null {
  const tiers = history.map((h) => h.tier).filter((t): t is Tier => t != null);
  if (tiers.length < 2) return null;
  const delta = tiers[tiers.length - 1] - tiers[0];
  if (delta > 0) return { label: `↑ subiu ${delta} ${delta === 1 ? "nível" : "níveis"}`, tone: "text-primary" };
  if (delta < 0) return { label: "↓ regrediu no período", tone: "text-destructive" };
  return { label: "→ estável no período", tone: "text-muted-foreground" };
}

function MaturityTeamCard({ d }: { d: TeamMaturity }) {
  const { team, maturity: mat, history } = d;
  const tier = mat.tier;
  const token = mat.tierToken;
  const weakest = new Set(mat.weakest);
  const limitingMetrics = mat.metrics.filter((m) => weakest.has(m.key));
  const move = movement(history);

  return (
    <Link href={`/coaching/${team.id}`} className="group block">
      <Card
        className={cn(
          "flex h-full flex-col border-t-4 p-5 transition-shadow group-hover:shadow-md",
          tierAccentClass(tier)
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold">{team.name}</h3>
            <Badge variant="outline" className="mt-1 capitalize">
              {team.board_type}
            </Badge>
          </div>
          {tier && token ? (
            <Badge variant={token} className="shrink-0 font-semibold">
              {mat.tierName}
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              Sem dados
            </Badge>
          )}
        </div>

        {mat.tierDesc && <p className="mt-2 text-xs text-muted-foreground">{mat.tierDesc}</p>}

        {/* Sparkline de tiers (12 semanas) + movimento */}
        {history.length > 0 && (
          <div className="mt-3">
            <div className="flex items-end gap-[3px]" aria-hidden>
              {history.map((h, i) => (
                <span
                  key={i}
                  title={h.as_of}
                  className={cn(
                    "w-2 rounded-sm",
                    h.tier === 3 ? "h-4 bg-platinum" : h.tier === 2 ? "h-3 bg-gold" : h.tier === 1 ? "h-2 bg-silver" : "h-1 bg-muted"
                  )}
                />
              ))}
            </div>
            {move && <p className={cn("mt-1.5 text-[11px] font-medium", move.tone)}>{move.label}</p>}
          </div>
        )}

        {/* 4 mini-KPIs — específicos do método; elo mais fraco em destaque */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {mat.metrics.map((mtr) => {
            const isWeak = weakest.has(mtr.key);
            return (
              <div
                key={mtr.key}
                className={cn(
                  "rounded-lg bg-muted/50 p-2.5",
                  isWeak && token && RING_CLASS[token]
                )}
                title={isWeak ? "Elo mais fraco — trava o tier" : undefined}
              >
                <span className="block truncate text-[11px] text-muted-foreground">{mtr.label}</span>
                <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", tierTextClass(mtr.tier))}>
                  {mtr.display}
                </div>
              </div>
            );
          })}
        </div>

        {/* Elo mais fraco → o que fazer pra subir */}
        {limitingMetrics.length > 0 && (
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium text-foreground/80">Para subir:</span>{" "}
            {limitingMetrics
              .map((m) => `${m.label}${m.nextTarget ? ` (${m.nextTarget})` : ""}`)
              .join(" · ")}
          </p>
        )}

        {/* Say-Do (contexto, só Scrum) + baixa confiança */}
        <div className="mt-auto pt-3 text-xs">
          {mat.sayDo && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Say-Do:</span>
              <span
                className={cn(
                  "font-medium",
                  mat.sayDo.band === "healthy"
                    ? "text-primary"
                    : mat.sayDo.band === "high"
                      ? "text-amber-600"
                      : "text-destructive"
                )}
              >
                {mat.sayDo.pct}%
              </span>
              <span className="text-muted-foreground/70">
                {mat.sayDo.band === "healthy"
                  ? "· banda saudável"
                  : mat.sayDo.band === "high"
                    ? "· acima (sandbagging?)"
                    : "· sub-entrega"}
              </span>
            </div>
          )}
          {mat.note && <p className="mt-1 text-muted-foreground/70">⚠ {mat.note}</p>}
          <span className="mt-2 flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
            Ver detalhe <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

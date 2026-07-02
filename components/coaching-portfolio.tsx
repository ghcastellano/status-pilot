"use client";

/**
 * Camada de portfolio do Coaching Hub: ProgramHeader (distribuição + movimento),
 * Section (Needs attention / On track), TeamCard rico e LeadershipSummary.
 * Adaptado do Coaching Hub original às métricas duais Scrum/Kanban.
 */
import * as React from "react";
import { Target, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type MaturityResult,
  type Tier,
  type TierToken,
  type Pillar,
  TIER_META,
  PILLAR_SHORT,
  tierTextClass,
  tierAccentClass,
} from "@/lib/maturity";
import {
  type EngagementStatus,
  type Readiness,
  STATUS_META,
  READINESS_META,
} from "@/lib/coaching";

export interface PortfolioBoard {
  team: { id: string; name: string; board_type: "scrum" | "kanban"; description: string | null };
  maturity: MaturityResult;
  history: { as_of: string; tier: Tier | null }[];
  status: EngagementStatus | null;
  coaching: boolean;
  coach: string | null;
  ask: string | null;
  mainGap: string | null;
  workingOn: Pillar[];
  behavioral: Readiness;
  movement: "up" | "down" | "flat" | "recovered";
  leveledUp: boolean;
  caption: string;
}

const TIER_ORDER: Tier[] = [1, 2, 3];
const BAR_CLASS: Record<TierToken, string> = { silver: "bg-silver", gold: "bg-gold", platinum: "bg-platinum" };
const RING_CLASS: Record<TierToken, string> = {
  silver: "ring-2 ring-silver/50",
  gold: "ring-2 ring-gold/50",
  platinum: "ring-2 ring-platinum/50",
};

const needsAttention = (b: PortfolioBoard) => b.status === "at_risk" || b.maturity.tier === 1;

// ── Program header ────────────────────────────────────────────────────
export function ProgramHeader({ boards }: { boards: PortfolioBoard[] }) {
  const bands: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const b of boards) if (b.maturity.tier) bands[b.maturity.tier] += 1;
  const total = boards.length;
  const denom = total || 1;
  const leveledUp = boards.filter((b) => b.leveledUp).length;
  const attention = boards.filter(needsAttention).length;
  const atPlatinum = boards.filter((b) => b.maturity.tier === 3).length;

  const movement = [
    { icon: "↑", n: leveledUp, label: "subiram de nível", tone: "text-primary" },
    { icon: "⚠", n: attention, label: "precisam de atenção", tone: "text-destructive" },
    { icon: "🎓", n: atPlatinum, label: "em Platinum", tone: "text-primary" },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Programa de Coaching</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-primary">{total}</span> {total === 1 ? "time" : "times"}
        </p>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Distribuição de maturidade
      </p>
      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {TIER_ORDER.map((t) =>
          bands[t] > 0 ? (
            <div
              key={t}
              className={BAR_CLASS[TIER_META[t].token]}
              style={{ width: `${(bands[t] / denom) * 100}%` }}
              title={`${TIER_META[t].name}: ${bands[t]}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {TIER_ORDER.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", BAR_CLASS[TIER_META[t].token])} />
            <span className="text-muted-foreground">{TIER_META[t].name}</span>
            <span className="font-bold">{bands[t]}</span>
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border/60 pt-4 text-sm">
        {movement.map((mv) => (
          <span key={mv.label} className="flex items-baseline gap-1.5">
            <span className={cn("text-lg font-bold", mv.tone)}>
              {mv.icon} {mv.n}
            </span>
            <span className="text-muted-foreground">{mv.label}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

// ── Section (Needs attention / On track) ──────────────────────────────
export function Section({
  title,
  blurb,
  chip,
  boards,
  onOpen,
}: {
  title: string;
  blurb: string;
  chip: string;
  boards: PortfolioBoard[];
  onOpen: (id: string) => void;
}) {
  if (boards.length === 0) return null;
  return (
    <section>
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", chip)}>{boards.length}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => (
          <TeamCard key={b.team.id} b={b} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

// ── TeamCard (rico) ───────────────────────────────────────────────────
export function TeamCard({ b, onOpen }: { b: PortfolioBoard; onOpen: (id: string) => void }) {
  const tier = b.maturity.tier;
  const token = b.maturity.tierToken;
  const weakest = new Set(b.maturity.weakest);
  const readiness = READINESS_META[b.behavioral.label];
  const MOVE = {
    up: { arrow: "↑", label: "subiu de nível", tone: "text-primary" },
    down: { arrow: "↓", label: "regrediu", tone: "text-destructive" },
    recovered: { arrow: "↻", label: "recuperou", tone: "text-primary" },
    flat: { arrow: "→", label: "estável", tone: "text-muted-foreground" },
  } as const;
  const move = MOVE[b.movement];

  const focusLabel = b.workingOn.length ? "Working on" : b.mainGap ? "Gap" : null;
  const focusText = b.workingOn.length
    ? b.workingOn.map((p) => PILLAR_SHORT[p]).join(", ")
    : b.mainGap ?? null;

  return (
    <button
      onClick={() => onOpen(b.team.id)}
      className={cn(
        "flex h-full flex-col rounded-xl border border-t-4 border-border bg-card p-5 text-left shadow-sm transition-shadow hover:shadow-md",
        tierAccentClass(tier)
      )}
    >
      {/* Título + tier */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-lg font-semibold">{b.team.name}</h3>
        {tier && token ? (
          <Badge variant={token} className="shrink-0 font-semibold">
            {b.maturity.tierName}
          </Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0">
            Sem dados
          </Badge>
        )}
      </div>

      {/* Coach + status + método + baixa confiança */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="capitalize">{b.team.board_type}</span>
        {b.coach && <span>· {b.coach}</span>}
        {b.status && (
          <span className={cn("rounded px-1.5 py-0.5 font-medium", STATUS_META[b.status].cls)}>
            {STATUS_META[b.status].label}
          </span>
        )}
        {b.maturity.lowConfidence && (
          <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-medium" title={b.maturity.note ?? ""}>
            Baixa confiança
          </span>
        )}
      </div>

      {/* Working on / Gap */}
      {focusText && (
        <p className="mt-2 line-clamp-2 text-sm">
          <span className="text-muted-foreground">{focusLabel}:</span> {focusText}
        </p>
      )}

      {/* Caption + movimento */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">{b.caption}</span>
        <span className={cn("shrink-0 font-semibold", move.tone)} title="Movimento no período">
          {move.arrow} {move.label}
        </span>
      </div>

      {/* 4 mini-KPIs (por método) — elo mais fraco em destaque */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {b.maturity.metrics.map((mt) => {
          const isWeak = weakest.has(mt.key);
          return (
            <div
              key={mt.key}
              className={cn("rounded-md bg-muted/50 p-2", isWeak && token && RING_CLASS[token])}
              title={isWeak ? "Elo mais fraco — trava o tier" : undefined}
            >
              <span className="block truncate text-[10px] text-muted-foreground">{mt.label}</span>
              <span className={cn("text-sm font-bold tabular-nums", tierTextClass(mt.tier))}>{mt.display}</span>
            </div>
          );
        })}
      </div>

      {/* Behavioral */}
      <div className="mt-auto pt-3 text-xs">
        <span className="text-muted-foreground">Behavioral:</span>{" "}
        <span className={cn("font-medium", readiness.tone)}>
          {readiness.label}
          {b.behavioral.pct != null ? ` · ${b.behavioral.pct}%` : ""}
        </span>
      </div>
    </button>
  );
}

// ── Leadership summary ────────────────────────────────────────────────
export function LeadershipSummary({ boards }: { boards: PortfolioBoard[] }) {
  const [copied, setCopied] = React.useState(false);
  const inProgram = boards.filter((b) => b.status);
  const lvl = (t: Tier | null) => (t ? TIER_META[t].name : "—");

  const improving = inProgram
    .filter((b) => b.status === "graduated" || b.leveledUp || b.movement === "recovered")
    .map((b) =>
      b.status === "graduated"
        ? `${b.team.name} graduou para Platinum`
        : b.leveledUp
          ? `${b.team.name} subiu para ${lvl(b.maturity.tier)}`
          : `${b.team.name} recuperou para ${lvl(b.maturity.tier)}`
    );

  const regressing = inProgram.filter((b) => b.status === "at_risk").map((b) => `${b.team.name} regredindo (agora ${lvl(b.maturity.tier)})`);
  const stillSilver = inProgram.filter((b) => b.status !== "at_risk" && b.maturity.tier === 1).map((b) => b.team.name);
  const needsAttentionList = [
    ...regressing,
    ...(stillSilver.length ? [`${stillSilver.length} time${stillSilver.length > 1 ? "s" : ""} ainda Silver — trabalho de base: ${stillSilver.join(", ")}`] : []),
  ];

  const focusTally: Record<string, number> = {};
  for (const b of inProgram) for (const p of b.workingOn) focusTally[p] = (focusTally[p] ?? 0) + 1;
  const focusLine = Object.keys(focusTally).map((p) => `${PILLAR_SHORT[p as Pillar]} (${focusTally[p]})`).join(" · ");

  const asks = inProgram.filter((b) => b.ask).map((b) => `${b.team.name}: ${b.ask}`);

  const bands: Record<Tier, number> = { 1: 0, 2: 0, 3: 0 };
  for (const b of inProgram) if (b.maturity.tier) bands[b.maturity.tier] += 1;

  const asText = () => {
    const L: string[] = ["Programa de coaching — resumo para liderança", ""];
    L.push(`Programa: ${inProgram.length} times — ${bands[1]} Silver · ${bands[2]} Gold · ${bands[3]} Platinum`, "");
    L.push("Ganhos / melhorando:");
    (improving.length ? improving : ["—"]).forEach((s) => L.push(`  • ${s}`));
    L.push("", "Precisa de atenção:");
    (needsAttentionList.length ? needsAttentionList : ["—"]).forEach((s) => L.push(`  • ${s}`));
    L.push("", `Foco ativo: ${focusLine || "—"}`, "", "Onde a liderança pode ajudar:");
    (asks.length ? asks : ["—"]).forEach((s) => L.push(`  • ${s}`));
    return L.join("\n");
  };

  const copy = () => {
    try {
      navigator.clipboard?.writeText(asText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard indisponível */
    }
  };

  const SummaryCard = ({ title, tone, items, empty }: { title: string; tone: string; items: string[]; empty: string }) => (
    <Card className="p-5">
      <p className={cn("mb-1.5 text-base font-semibold", tone)}>{title}</p>
      {items.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground/80">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Resumo para liderança · este trimestre</h2>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar como texto"}
        </Button>
      </div>

      {/* TierStrip */}
      <div className="grid gap-4 md:grid-cols-3">
        {TIER_ORDER.map((t) => {
          const meta = TIER_META[t];
          const desc = t === 1 ? "Suporte necessário" : t === 2 ? "Suporte condicional" : "Candidatos a graduação";
          return (
            <Card key={t} className="flex items-center gap-3 p-4">
              <span className={cn("h-8 w-1.5 rounded-full", BAR_CLASS[meta.token])} />
              <div className="min-w-0">
                <p className={cn("font-semibold", tierTextClass(t))}>{meta.name}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <span className={cn("ml-auto text-3xl font-bold tabular-nums", tierTextClass(t))}>{bands[t]}</span>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard title="Ganhos / melhorando" tone="text-primary" items={improving} empty="Sem movimento de nível ainda." />
        <SummaryCard title="Precisa de atenção" tone="text-destructive" items={needsAttentionList} empty="Nada sinalizado." />
        <Card className="p-5">
          <p className="mb-1.5 text-base font-semibold">Foco ativo</p>
          <p className="text-sm text-foreground/80">{focusLine || "—"}</p>
        </Card>
        <SummaryCard title="Onde a liderança pode ajudar" tone="text-amber-600" items={asks} empty="Nenhum pedido aberto." />
      </div>
    </div>
  );
}

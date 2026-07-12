"use client";

/**
 * Cards da camada de coaching (tela de detalhe): plano, experimentos e sinais
 * comportamentais. Escrita otimista + flash "salvo ✓". Method-aware via boardType.
 */
import * as React from "react";
import { Plus, X, MessageSquare } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BoardType } from "@/lib/metrics";
import { PILLAR_LABEL, type Pillar, type Tier } from "@/lib/maturity";
import type { ExperimentComment } from "@/lib/coaching-db";
import {
  type CoachingPlan,
  type Experiment,
  type SignalValue,
  RUBRIC,
  RUBRIC_ORDER,
  READINESS_META,
  signalDefs,
  behavioralReadiness,
  graduationReady,
  experimentTemplates,
} from "@/lib/coaching";

// ── util: flash "salvo ✓" ────────────────────────────────────────────
function useFlash(): [string | null, (k: string, ok?: boolean) => void, boolean] {
  const [flash, setFlash] = React.useState<{ k: string; ok: boolean } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fire = React.useCallback((k: string, ok = true) => {
    setFlash({ k, ok });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), ok ? 1800 : 4000);
  }, []);
  return [flash?.k ?? null, fire, flash?.ok ?? true];
}

function SavedTick({ current, k, ok }: { current: string | null; k: string; ok: boolean }) {
  if (current !== k) return null;
  return ok ? (
    <span className="text-xs font-medium text-primary">✓ salvo</span>
  ) : (
    <span className="text-xs font-medium text-destructive">⚠ não salvo</span>
  );
}

// ── Autor (sem auth no app): nome lembrado no localStorage ────────────
// Usado como `author` dos comentários e `changedBy` do histórico de mudanças.
const AUTHOR_KEY = "status-pilot:author";
export function getAuthor(): string {
  if (typeof window === "undefined") return "Coach";
  return (window.localStorage.getItem(AUTHOR_KEY) || "").trim() || "Coach";
}

/** Campo "Você: [nome]" — quem está registrando comentários e mudanças. */
export function AuthorField() {
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    setName(window.localStorage.getItem(AUTHOR_KEY) || "");
  }, []);
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">Registrando como</span>
      <Input
        className="h-8 w-44 text-sm"
        placeholder="seu nome (ex.: Ana, coach)"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          window.localStorage.setItem(AUTHOR_KEY, e.target.value.trim());
        }}
      />
    </label>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

// ── Thread de comentários de um experimento (log que evolui no tempo) ──
function CommentThread({
  comments,
  onAdd,
  onDelete,
}: {
  comments: ExperimentComment[];
  onAdd: (body: string) => Promise<boolean>;
  onDelete: (id: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const n = comments.length;

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const ok = await onAdd(t);
    setBusy(false);
    if (ok) setText("");
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {n === 0 ? "Comentar" : `${n} comentário${n > 1 ? "s" : ""}`}
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-l-2 border-border/60 pl-3">
          {comments.map((c) => (
            <div key={c.id} className="group text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground/90">{c.author}</span>
                <span className="text-muted-foreground/70">· {timeAgo(c.created_at)}</span>
                <button
                  onClick={() => onDelete(c.id)}
                  aria-label="Excluir comentário"
                  className="ml-auto text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-foreground/80">{c.body}</p>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              className="h-8 flex-1 text-xs"
              placeholder="Adicionar comentário — o que aconteceu?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
            <Button size="sm" variant="secondary" disabled={!text.trim() || busy} onClick={submit}>
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plano de coaching ────────────────────────────────────────────────
const PLAN_FIELDS: { key: keyof CoachingPlan; label: string; placeholder: string; tone?: string }[] = [
  { key: "main_gap", label: "Gap principal", placeholder: "O maior gap do time agora" },
  { key: "hypothesis", label: "Hipótese de coaching", placeholder: "A mudança sendo testada" },
  { key: "next_step", label: "Próximo passo", placeholder: "A próxima ação de coaching" },
  { key: "ask", label: "Ask (liderança)", placeholder: "Onde a liderança pode ajudar", tone: "text-amber-700 dark:text-amber-500" },
];

export function PlanCard({ teamId, initial }: { teamId: string; initial: CoachingPlan | null }) {
  const [plan, setPlan] = React.useState<Partial<CoachingPlan>>(initial ?? {});
  const [flashKey, flash, flashOk] = useFlash();

  const save = (field: string, value: string) => {
    fetch("/api/coaching/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, [field]: value, changedBy: getAuthor() }),
    })
      .then((r) => {
        // só confirma o estado local no sucesso — em falha o valor anterior
        // permanece e o usuário pode tentar de novo
        if (r.ok) setPlan((p) => ({ ...p, [field]: value || null }));
        flash(field, r.ok);
      })
      .catch(() => flash(field, false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plano de coaching</CardTitle>
        <p className="text-sm text-muted-foreground">Salva automaticamente ao sair do campo.</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {PLAN_FIELDS.map((f) => (
          <div key={f.key} className={f.key === "main_gap" ? "sm:col-span-2" : undefined}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </span>
              <SavedTick current={flashKey} k={f.key} ok={flashOk} />
            </div>
            <Input
              className={cn("h-10", f.tone)}
              placeholder={f.placeholder}
              defaultValue={(plan[f.key] as string) ?? ""}
              onBlur={(e) => {
                if ((e.target.value || "") !== ((plan[f.key] as string) ?? "")) save(f.key, e.target.value);
              }}
            />
          </div>
        ))}
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Próximo check-in
            </span>
            <SavedTick current={flashKey} k="review_at" ok={flashOk} />
          </div>
          <Input
            type="date"
            className="h-10"
            defaultValue={plan.review_at ?? ""}
            onBlur={(e) => {
              if ((e.target.value || "") !== (plan.review_at ?? "")) save("review_at", e.target.value);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Experimentos ─────────────────────────────────────────────────────
const STATUS_META: Record<Experiment["status"], { label: string; chip: string; accent: string }> = {
  active: { label: "ativo", chip: "bg-primary/10 text-primary", accent: "border-l-primary" },
  done: { label: "concluído", chip: "bg-primary/10 text-primary", accent: "border-l-primary/40" },
  dropped: { label: "descartado", chip: "bg-muted text-muted-foreground", accent: "border-l-border" },
};

export function ExperimentsCard({
  teamId,
  boardType,
  initial,
  initialComments = [],
}: {
  teamId: string;
  boardType: BoardType;
  initial: Experiment[];
  initialComments?: ExperimentComment[];
}) {
  const [exps, setExps] = React.useState<Experiment[]>(initial);
  const [comments, setComments] = React.useState<ExperimentComment[]>(initialComments);
  const [newBehavior, setNewBehavior] = React.useState("");
  const [newPillar, setNewPillar] = React.useState<Pillar>("flow");
  const [flashKey, flash, flashOk] = useFlash();
  const templates = experimentTemplates(boardType);

  const post = (body: object, k: string) =>
    fetch("/api/coaching/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, changedBy: getAuthor() }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        flash(k, true);
        return d.experiment as Experiment;
      })
      .catch(() => {
        flash(k, false);
        return null;
      });

  const add = async (tpl: { pillar: Pillar; metric?: string; behavior: string; hypothesis?: string }) => {
    // evita duplicar experimento ativo com o mesmo behavior
    if (exps.some((e) => e.status === "active" && e.behavior === tpl.behavior)) return flash("add", true);
    const created = await post({ teamId, ...tpl }, "add");
    if (created) setExps((prev) => [created, ...prev]);
  };

  const update = async (exp: Experiment, patch: Partial<Experiment>) => {
    const prev = exps;
    // otimista, mas envia o registro COMPLETO mesclado (um patch parcial não
    // pode apagar metric/hypothesis/outcome) e reverte se a escrita falhar
    setExps((p) => p.map((e) => (e.id === exp.id ? { ...e, ...patch } : e)));
    const saved = await post(
      {
        teamId,
        id: exp.id,
        pillar: exp.pillar,
        behavior: exp.behavior,
        metric: exp.metric,
        hypothesis: exp.hypothesis,
        outcome: exp.outcome,
        status: exp.status,
        ...patch,
      },
      `exp:${exp.id}`
    );
    if (!saved) setExps(prev);
  };

  const remove = (exp: Experiment) => {
    const prev = exps;
    setExps((p) => p.filter((e) => e.id !== exp.id));
    fetch(`/api/coaching/experiments?id=${exp.id}&by=${encodeURIComponent(getAuthor())}`, { method: "DELETE" })
      .then((r) => {
        if (!r.ok) {
          setExps(prev);
          flash(`exp:${exp.id}`, false);
        }
      })
      .catch(() => {
        setExps(prev);
        flash(`exp:${exp.id}`, false);
      });
  };

  // Comentários (log que evolui) — otimista com revert em falha.
  const addComment = async (experimentId: number, body: string): Promise<boolean> => {
    try {
      const r = await fetch("/api/coaching/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, experimentId, body, author: getAuthor() }),
      });
      if (!r.ok) return false;
      const d = await r.json();
      setComments((prev) => [...prev, d.comment as ExperimentComment]);
      return true;
    } catch {
      return false;
    }
  };

  const removeComment = (id: number) => {
    const target = comments.find((c) => c.id === id);
    setComments((p) => p.filter((c) => c.id !== id));
    // reverte SÓ este item (não um snapshot inteiro) p/ não atropelar ops concorrentes
    const restore = () => {
      if (!target) return;
      setComments((p) => (p.some((c) => c.id === id) ? p : [...p, target].sort((a, b) => a.id - b.id)));
    };
    fetch(`/api/coaching/comments?id=${id}`, { method: "DELETE" })
      .then((r) => {
        if (!r.ok) restore();
      })
      .catch(restore);
  };

  const active = exps.filter((e) => e.status === "active");
  const closed = exps.filter((e) => e.status !== "active");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Experimentos &amp; intervenções</CardTitle>
          <SavedTick current={flashKey} k="add" ok={flashOk} />
        </div>
        <p className="text-sm text-muted-foreground">
          O que está sendo testado para mover as métricas — e o que mudou.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {exps.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum experimento ainda — comece por uma sugestão abaixo.</p>
        )}
        {[
          { label: "Ativos", items: active },
          { label: "Encerrados", items: closed },
        ].map((g) =>
          g.items.length === 0 ? null : (
            <div key={g.label}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </p>
              <ul className="space-y-2">
                {g.items.map((e) => (
                  <li
                    key={e.id}
                    className={cn(
                      "rounded-lg border border-l-4 border-border bg-card p-3",
                      STATUS_META[e.status].accent
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{e.behavior}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {PILLAR_LABEL[e.pillar]}
                          {e.metric ? ` · ${e.metric}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <SavedTick current={flashKey} k={`exp:${e.id}`} ok={flashOk} />
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_META[e.status].chip)}>
                          {STATUS_META[e.status].label}
                        </span>
                        {e.status === "active" && (
                          <>
                            <button
                              onClick={() => update(e, { status: "done" })}
                              className="rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
                            >
                              Concluir
                            </button>
                            <button
                              onClick={() => update(e, { status: "dropped" })}
                              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                            >
                              Descartar
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => remove(e)}
                          aria-label="Excluir experimento"
                          className="rounded p-0.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {e.status !== "dropped" && (
                      <Input
                        className="mt-2 h-8 text-xs"
                        placeholder="Resultado — o que mudou?"
                        defaultValue={e.outcome ?? ""}
                        onBlur={(ev) => {
                          if ((ev.target.value || "") !== (e.outcome ?? "")) update(e, { outcome: ev.target.value || null });
                        }}
                      />
                    )}
                    <CommentThread
                      comments={comments.filter((c) => c.experiment_id === e.id)}
                      onAdd={(body) => addComment(e.id, body)}
                      onDelete={removeComment}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {/* Adicionar: custom + sugestões do método */}
        <div className="space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <select
              value={newPillar}
              onChange={(e) => setNewPillar(e.target.value as Pillar)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Pilar"
            >
              {(Object.keys(PILLAR_LABEL) as Pillar[]).map((p) => (
                <option key={p} value={p}>
                  {PILLAR_LABEL[p]}
                </option>
              ))}
            </select>
            <Input
              className="h-10 flex-1"
              placeholder="Novo experimento — comportamento a testar"
              value={newBehavior}
              onChange={(e) => setNewBehavior(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newBehavior.trim()) {
                  add({ pillar: newPillar, behavior: newBehavior.trim() });
                  setNewBehavior("");
                }
              }}
            />
            <Button
              size="sm"
              disabled={!newBehavior.trim()}
              onClick={() => {
                add({ pillar: newPillar, behavior: newBehavior.trim() });
                setNewBehavior("");
              }}
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Sugestões ({boardType}):</span>
            {templates.map((tpl) => (
              <button
                key={tpl.behavior}
                onClick={() => add(tpl)}
                title={tpl.hypothesis}
                className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
              >
                + {tpl.metric}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sinais comportamentais (pilar Ownership) ─────────────────────────
const VALUE_ACTIVE: Record<SignalValue, string> = {
  not_yet: "bg-destructive/15 text-destructive",
  emerging: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
  consistent: "bg-primary/15 text-primary",
};

export function SignalsCard({
  teamId,
  boardType,
  tier,
  initialSignals,
  initialNote,
}: {
  teamId: string;
  boardType: BoardType;
  tier: Tier | null;
  initialSignals: Record<string, string>;
  initialNote: string | null;
}) {
  const [signals, setSignals] = React.useState<Record<string, string>>(initialSignals);
  const [flashKey, flash, flashOk] = useFlash();
  const defs = signalDefs(boardType);
  const readiness = behavioralReadiness(signals);
  const meta = READINESS_META[readiness.label];
  const gradReady = graduationReady(tier, readiness.pct);

  const save = (next: Record<string, string>, k: string, note?: string) =>
    fetch("/api/coaching/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, signals: next, note: note ?? initialNote ?? undefined, changedBy: getAuthor() }),
    })
      .then((r) => flash(k, r.ok))
      .catch(() => flash(k, false));

  const setSignal = (key: string, value: SignalValue) => {
    const next = { ...signals, [key]: value };
    setSignals(next);
    save(next, key);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Sinais comportamentais</CardTitle>
          <span className={cn("text-sm font-semibold", meta.tone)}>
            {meta.label}
            {readiness.pct != null ? ` · ${readiness.pct}%` : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Pilar Ownership — avaliação do coach; não entra no tier quantitativo.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {defs.map((d) => {
          const current = signals[d.key] as SignalValue | undefined;
          return (
            <div key={d.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{d.label}</span>
              <div className="flex items-center gap-2">
                <SavedTick current={flashKey} k={d.key} ok={flashOk} />
                <div className="inline-flex overflow-hidden rounded-md border border-border">
                  {RUBRIC_ORDER.map((v, i) => (
                    <button
                      key={v}
                      onClick={() => setSignal(d.key, v)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium transition-colors",
                        i > 0 && "border-l border-border",
                        current === v ? VALUE_ACTIVE[v] : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {RUBRIC[v].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Gate de graduação */}
        <div className="mt-2 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Gate de graduação</p>
            <p className="text-xs text-muted-foreground">métricas em Gold+ e sinais ≥ 75%</p>
          </div>
          {gradReady == null ? (
            <Badge variant="secondary">avaliar sinais</Badge>
          ) : gradReady ? (
            <Badge variant="platinum" className="font-semibold">
              Pronto para revisão
            </Badge>
          ) : (
            <Badge variant="secondary">Ainda não</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

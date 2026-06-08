"use client";

import * as React from "react";
import { Send, Sparkles, Database, Clock, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { getSessionId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Tipos e localStorage ──────────────────────────────────────────────────────

interface AskEntry {
  id: string;
  teamId: string | null;
  teamName: string | null;
  question: string;
  answer: string;
  askedAt: string; // ISO
}

const STORAGE_KEY = "sp_ask_history";
const MAX_ENTRIES = 50;

const FALLBACK_EXAMPLES = [
  "Qual time tem melhor cycle time?",
  "Compare a previsibilidade dos dois times.",
  "Onde está o maior gargalo agora?",
  "Algum time com throughput caindo?",
];

function loadHistory(): AskEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistEntry(entry: AskEntry, prev: AskEntry[]): AskEntry[] {
  const updated = [entry, ...prev].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Chip de pergunta recente ──────────────────────────────────────────────────

function QuestionChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50 text-left"
    >
      {label}
    </button>
  );
}

// ── Item do histórico de perguntas ────────────────────────────────────────────

function HistoryItem({
  entry, onReask, loading,
}: {
  entry: AskEntry;
  onReask: (q: string) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="rounded-lg border border-border bg-card/50 text-sm">
      {/* Linha da pergunta */}
      <button
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground line-clamp-1">{entry.question}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {entry.teamName && <span>{entry.teamName}</span>}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtDate(entry.askedAt)}
            </span>
          </div>
          {!expanded && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-snug">{entry.answer}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); onReask(entry.question); }}
          title="Refazer esta pergunta"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refazer
        </Button>
      </button>
      {/* Resposta expandida */}
      {expanded && (
        <div className="border-t border-border/60 px-5 pb-4 pt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{entry.answer}</p>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AskPage() {
  const { selectedTeam } = useTeam();
  const [q, setQ] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [cached, setCached] = React.useState(false);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<AskEntry[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);

  // Carrega histórico apenas no cliente
  React.useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Chips: últimas 5 perguntas únicas do histórico; fallback nos exemplos estáticos
  const chips = React.useMemo(() => {
    if (history.length === 0) return FALLBACK_EXAMPLES;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of history) {
      const key = e.question.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(e.question);
      }
      if (result.length >= 5) break;
    }
    return result;
  }, [history]);

  async function ask(question: string) {
    if (!selectedTeam || !question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selectedTeam.id, question, sessionId: getSessionId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao perguntar.");
      setAnswer(data.answer);
      setCached(!!data.cached);
      if (typeof data.remaining === "number") setRemaining(data.remaining);

      // Salva no histórico somente respostas novas (não do cache)
      if (!data.cached) {
        const entry: AskEntry = {
          id: String(Date.now()),
          teamId: selectedTeam.id,
          teamName: selectedTeam.name,
          question: question.trim(),
          answer: data.answer,
          askedAt: new Date().toISOString(),
        };
        setHistory((prev) => persistEntry(entry, prev));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleChip(text: string) {
    setQ(text);
    ask(text);
  }

  const chipsLabel = history.length > 0 ? "Recentes" : "Sugestões";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perguntar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pergunte em linguagem natural — a IA responde considerando{" "}
          <span className="font-medium">os dois times</span> (Espresso e Cold Brew), lidos do Jira.
          Dá pra comparar.
        </p>
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={500}
          placeholder="Ex.: como está a sprint atual?"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !q.trim()}>
          <Send className="h-4 w-4" />
          Perguntar
        </Button>
      </form>

      {/* Chips dinâmicos */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{chipsLabel}</p>
        <div className="flex flex-wrap gap-2">
          {chips.map((ex) => (
            <QuestionChip key={ex} label={ex} onClick={() => handleChip(ex)} disabled={loading} />
          ))}
        </div>
      </div>

      {/* Resposta atual */}
      {(loading || answer || error) && (
        <Card>
          <CardContent className="pt-6">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                Analisando os dados…
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {answer && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    <Sparkles className="mr-1 h-3 w-3" /> Resposta
                  </Badge>
                  {cached && (
                    <Badge variant="secondary">
                      <Database className="mr-1 h-3 w-3" /> cache
                    </Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {remaining !== null && (
        <p className="text-right text-xs text-muted-foreground">
          {remaining} perguntas restantes nesta sessão
        </p>
      )}

      {/* Histórico de Q&A */}
      {history.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="h-4 w-4" />
            Histórico de perguntas
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {history.length}
            </Badge>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>

          {showHistory && (
            <div className="space-y-2">
              {history.map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  onReask={(text) => { setQ(text); ask(text); }}
                  loading={loading}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Send, Sparkles, Database } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { getSessionId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const EXAMPLES = [
  "Qual time tem melhor cycle time?",
  "Compare a previsibilidade dos dois times.",
  "Onde está o maior gargalo agora?",
  "Algum time com throughput caindo?",
];

export default function AskPage() {
  const { selectedTeam } = useTeam();
  const [q, setQ] = React.useState("");
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [cached, setCached] = React.useState(false);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Perguntar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pergunte em linguagem natural — a IA responde considerando{" "}
          <span className="font-medium">os dois times</span> (Espresso e Cold Brew), lidos do Jira.
          Dá pra comparar.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
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

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQ(ex);
              ask(ex);
            }}
            disabled={loading}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>

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
    </div>
  );
}

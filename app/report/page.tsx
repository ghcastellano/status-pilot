"use client";

import * as React from "react";
import { FileText, Copy, Check, Sparkles } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { getSessionId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** render mínimo de markdown (títulos, negrito, listas). */
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (i: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${i}`} className="my-2 list-disc space-y-1 pl-5 text-sm">
          {list.map((li, k) => (
            <li key={k}>{inline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, k) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={k}>{part.slice(2, -2)}</strong>
      ) : (
        <React.Fragment key={k}>{part}</React.Fragment>
      )
    );

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^#{1,6}\s/.test(line)) {
      flush(i);
      out.push(
        <h3 key={i} className="mt-4 text-sm font-semibold uppercase tracking-wide text-primary">
          {line.replace(/^#{1,6}\s/, "")}
        </h3>
      );
    } else if (/^[-*]\s/.test(line)) {
      list.push(line.replace(/^[-*]\s/, ""));
    } else if (line.trim() === "") {
      flush(i);
    } else {
      flush(i);
      out.push(
        <p key={i} className="my-1.5 text-sm leading-relaxed">
          {inline(line)}
        </p>
      );
    }
  });
  flush(lines.length);
  return out;
}

export default function ReportPage() {
  const { selectedTeam } = useTeam();
  const [report, setReport] = React.useState<string | null>(null);
  const [cached, setCached] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function generate() {
    if (!selectedTeam || loading) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selectedTeam.id, sessionId: getSessionId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar.");
      setReport(data.report);
      setCached(!!data.cached);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Status Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumo pronto para stakeholders de{" "}
            <span className="font-medium">{selectedTeam?.name}</span>, gerado dos dados do Jira.
          </p>
        </div>
        <Button onClick={generate} disabled={loading}>
          <FileText className="h-4 w-4" />
          {loading ? "Gerando…" : "Gerar status report"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          Escrevendo o report…
        </div>
      )}

      {report && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default">stakeholder-ready</Badge>
                {cached && <Badge variant="secondary">cache</Badge>}
              </div>
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <article>{renderMarkdown(report)}</article>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

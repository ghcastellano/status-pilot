"use client";

import * as React from "react";
import { FileText, Copy, Check, Sparkles, RefreshCw, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { getSessionId } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ReportEntry {
  id: string;
  teamId: string;
  teamName: string;
  generatedAt: string; // ISO
  report: string;
}

const STORAGE_KEY = "sp_report_history";
const MAX_ENTRIES = 20;

function loadHistory(): ReportEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistEntry(entry: ReportEntry, prev: ReportEntry[]): ReportEntry[] {
  const updated = [entry, ...prev].slice(0, MAX_ENTRIES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

// ── Markdown mínimo ──────────────────────────────────────────────────────────

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (i: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${i}`} className="my-2 list-disc space-y-1 pl-5 text-sm">
          {list.map((li, k) => <li key={k}>{inline(li)}</li>)}
        </ul>
      );
      list = [];
    }
  };
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, k) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={k}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={k}>{part}</React.Fragment>
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
        <p key={i} className="my-1.5 text-sm leading-relaxed">{inline(line)}</p>
      );
    }
  });
  flush(lines.length);
  return out;
}

// ── Utilitários de data ───────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function tldrPreview(report: string) {
  const match = report.match(/##\s*TL;?DR[^\n]*\n+([\s\S]{0,140})/i);
  return match ? match[1].replace(/\*\*/g, "").trim().slice(0, 120) + "…" : report.slice(0, 100) + "…";
}

// ── Componente de entrada do histórico ───────────────────────────────────────

function HistoryItem({
  entry, onView, onCopy, copying,
}: {
  entry: ReportEntry;
  onView: () => void;
  onCopy: () => void;
  copying: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="rounded-lg border border-border bg-card/50 text-sm">
      <button
        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{entry.teamName}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {fmtDate(entry.generatedAt)}
            </span>
          </div>
          {!expanded && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{tldrPreview(entry.report)}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onView}>
            Ver
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onCopy}>
            {copying ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border/60 px-5 pb-4 pt-3">
          <article className="max-h-80 overflow-y-auto pr-1">{renderMarkdown(entry.report)}</article>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ReportPage() {
  const { selectedTeam } = useTeam();
  const [history, setHistory] = React.useState<ReportEntry[]>([]);
  const [viewEntry, setViewEntry] = React.useState<ReportEntry | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);

  // Carrega histórico do localStorage só no cliente
  React.useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Limpa a view atual ao trocar de time
  React.useEffect(() => {
    setViewEntry(null);
    setError(null);
  }, [selectedTeam?.id]);

  async function generate(force = false) {
    if (!selectedTeam || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selectedTeam.id, sessionId: getSessionId(), force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar.");
      const entry: ReportEntry = {
        id: String(Date.now()),
        teamId: selectedTeam.id,
        teamName: selectedTeam.name,
        generatedAt: new Date().toISOString(),
        report: data.report,
      };
      setHistory((prev) => persistEntry(entry, prev));
      setViewEntry(entry);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyReport(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  const historyWithoutCurrent = history.filter((e) => e.id !== viewEntry?.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Status Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Resumo para stakeholders de{" "}
            <span className="font-medium">{selectedTeam?.name ?? "—"}</span>, gerado dos dados do Jira.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => generate(true)} disabled={loading} title="Ignora cache e gera report novo">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Regenerar
          </Button>
          <Button onClick={() => generate(false)} disabled={loading}>
            <FileText className="h-4 w-4" />
            {loading ? "Gerando…" : "Gerar report"}
          </Button>
        </div>
      </div>

      {/* Erro */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-primary" />
          Escrevendo o report com dados do Jira…
        </div>
      )}

      {/* Report atual */}
      {viewEntry && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">stakeholder-ready</Badge>
                <Badge variant="secondary">{viewEntry.teamName}</Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {fmtDate(viewEntry.generatedAt)}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyReport(viewEntry.report, viewEntry.id)}
              >
                {copiedId === viewEntry.id
                  ? <><Check className="h-4 w-4" /> Copiado</>
                  : <><Copy className="h-4 w-4" /> Copiar</>}
              </Button>
            </div>
            <article>{renderMarkdown(viewEntry.report)}</article>
          </CardContent>
        </Card>
      )}

      {/* Estado vazio inicial */}
      {!viewEntry && !loading && !error && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Clique em <span className="font-medium text-foreground">Gerar report</span> para criar o status report do time atual.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Use <span className="font-medium">Regenerar</span> para forçar um novo sem cache.
          </p>
        </div>
      )}

      {/* Histórico */}
      {historyWithoutCurrent.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="h-4 w-4" />
            Histórico
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {historyWithoutCurrent.length}
            </Badge>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
          </button>

          {showHistory && (
            <div className="space-y-2">
              {historyWithoutCurrent.map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  onView={() => setViewEntry(entry)}
                  onCopy={() => copyReport(entry.report, entry.id)}
                  copying={copiedId === entry.id}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

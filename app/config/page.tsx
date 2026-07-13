"use client";

/**
 * /config — Configurar Jira + selecionar projetos como times.
 * Conecta via OAuth, busca PROJETOS do Jira (server-side, /rest/api/3) e liga/
 * desliga cada um como time (POST/DELETE /api/teams). O tipo scrum/kanban é
 * detectado na sincronização. Botão de sincronizar reaproveita /api/sync.
 */
import * as React from "react";
import {
  RefreshCw,
  CheckCircle2,
  Search,
  Plug,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Tipos locais ──────────────────────────────────────────────────────
interface JiraStatus {
  connected: boolean;
  site_url: string | null;
  account_name: string | null;
}

// Cada "board" agora é um PROJETO do Jira (id === projectKey).
interface Board {
  id: string;
  name: string;
  type: string; // sempre "unknown" aqui — tipo real detectado na sync
  projectKey: string | null;
  projectName: string | null;
}

interface TeamRow {
  id: string;
  name: string;
  board_type: "scrum" | "kanban";
  jira_board_id: string | null;
  active: boolean;
}

// ── Switch (mesma implementação do coaching-portfolio) ────────────────
function Switch({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
          on ? "left-[18px]" : "left-0.5"
        )}
      />
    </button>
  );
}

function TypeBadge({ type }: { type: "scrum" | "kanban" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 text-[10px] font-semibold capitalize",
        type === "scrum"
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600"
      )}
    >
      {type}
    </Badge>
  );
}

export default function ConfigPage() {
  const [status, setStatus] = React.useState<JiraStatus | null>(null);
  const [boards, setBoards] = React.useState<Board[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [boardsErr, setBoardsErr] = React.useState<string | null>(null);
  const [boardsLoading, setBoardsLoading] = React.useState(false);
  const [teams, setTeams] = React.useState<TeamRow[]>([]);
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [banner, setBanner] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncMsg, setSyncMsg] = React.useState<string | null>(null);

  // Banner de retorno do OAuth (?jira=connected|error)
  React.useEffect(() => {
    const j = new URLSearchParams(window.location.search).get("jira");
    if (j === "connected" || j === "error") {
      setBanner(
        j === "connected"
          ? "Jira conectado via OAuth ✓"
          : "Falha ao conectar o Jira — verifique as credenciais OAuth."
      );
      window.history.replaceState({}, "", "/config");
      const t = setTimeout(() => setBanner(null), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  const loadStatus = React.useCallback(async () => {
    try {
      const r = await fetch("/api/jira/status", { cache: "no-store" });
      setStatus(await r.json());
    } catch {
      setStatus({ connected: false, site_url: null, account_name: null });
    }
  }, []);

  const loadTeams = React.useCallback(async () => {
    try {
      const r = await fetch("/api/teams", { cache: "no-store" });
      const d = await r.json();
      setTeams((d.teams ?? []) as TeamRow[]);
    } catch {
      /* mantém times atuais */
    }
  }, []);

  // Busca server-side de projetos. Sem query → primeiros 50 (default da API).
  const searchBoards = React.useCallback(async (query: string) => {
    setBoardsLoading(true);
    setBoardsErr(null);
    try {
      const url = query
        ? `/api/jira/boards?q=${encodeURIComponent(query)}`
        : "/api/jira/boards";
      const r = await fetch(url, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setBoardsErr(d.error ?? "Falha ao buscar projetos.");
        setBoards([]);
        setTotal(0);
        return;
      }
      setBoards((d.boards ?? []) as Board[]);
      setTotal(d.total ?? 0);
    } catch (e) {
      setBoardsErr((e as Error).message);
      setBoards([]);
      setTotal(0);
    } finally {
      setBoardsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadStatus();
    loadTeams();
  }, [loadStatus, loadTeams]);

  // Debounce (~350ms) da busca. Só dispara quando o Jira está conectado.
  React.useEffect(() => {
    if (!status?.connected) return;
    const t = setTimeout(() => {
      void searchBoards(q.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [q, status?.connected, searchBoards]);

  // Set dos projectKeys ativos (times ativos com jira_board_id)
  const activeBoardIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of teams) if (t.active && t.jira_board_id) s.add(t.jira_board_id);
    return s;
  }, [teams]);

  const isOn = (b: Board) => activeBoardIds.has(b.id);

  // Liga/desliga um projeto como time. Otimista + revert-via-reload.
  async function setTeamActive(
    projectKey: string,
    name: string,
    projectName: string | null,
    next: boolean
  ) {
    const key = projectKey;
    setPending((p) => ({ ...p, [key]: true }));
    // otimista
    setTeams((prev) => {
      const idx = prev.findIndex((t) => t.jira_board_id === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], active: next };
        return copy;
      }
      if (next) {
        return [
          ...prev,
          {
            id: `board-${key}`,
            name,
            board_type: "scrum",
            jira_board_id: key,
            active: true,
          },
        ];
      }
      return prev;
    });

    try {
      let res: Response;
      if (next) {
        res = await fetch("/api/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boardId: projectKey,
            name,
            projectKey,
            projectName: projectName ?? undefined,
          }),
        });
      } else {
        res = await fetch(`/api/teams?id=board-${key}`, { method: "DELETE" });
      }
      if (!res.ok) throw new Error("falha");
      await loadTeams();
    } catch {
      // revert
      await loadTeams();
    } finally {
      setPending((p) => {
        const c = { ...p };
        delete c[key];
        return c;
      });
    }
  }

  async function doSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no sync");
      setSyncMsg(`${data.total} itens sincronizados do Jira`);
      await loadTeams();
    } catch (e) {
      setSyncMsg((e as Error).message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  const connected = status?.connected;
  const notConnected = status != null && !connected;
  const boardsBlocked = boardsErr != null;

  // Times configurados: times ativos com um projeto Jira vinculado.
  const configuredTeams = React.useMemo(
    () => teams.filter((t) => t.active && t.jira_board_id),
    [teams]
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurar Jira</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte sua conta do Jira e escolha quais projetos viram times monitorados.
        </p>
      </div>

      {banner && (
        <p
          className={cn(
            "text-sm",
            banner.includes("✓") ? "text-primary" : "text-destructive"
          )}
        >
          {banner}
        </p>
      )}

      {/* Connection card */}
      <Card>
        <CardHeader>
          <CardTitle>Conexão</CardTitle>
        </CardHeader>
        <CardContent>
          {status == null ? (
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          ) : connected ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Conectado: <span className="text-primary">{status.site_url}</span>
                </p>
                {status.account_name && (
                  <p className="text-xs text-muted-foreground">
                    Autorizado por {status.account_name}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Nenhum Jira conectado. Autorize via OAuth 2.0 (3LO).
              </p>
              <Button
                onClick={() => {
                  window.location.href = "/api/jira/connect";
                }}
              >
                <Plug className="h-4 w-4" /> Conectar Jira
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Projetos → times */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Projetos → times</CardTitle>
            <p className="text-xs text-muted-foreground">
              {configuredTeams.length}{" "}
              {configuredTeams.length === 1 ? "time configurado" : "times configurados"}.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {notConnected || boardsBlocked ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                {boardsBlocked && !notConnected
                  ? boardsErr
                  : "Conecte o Jira primeiro para buscar projetos."}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/api/jira/connect";
                }}
              >
                <Plug className="h-4 w-4" /> Conectar Jira
              </Button>
            </div>
          ) : (
            <>
              {/* Times configurados */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Times configurados
                </p>
                {configuredTeams.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    Nenhum time configurado ainda — busque um projeto abaixo.
                  </p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {configuredTeams.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t.jira_board_id}
                          </p>
                        </div>
                        <TypeBadge type={t.board_type} />
                        <button
                          type="button"
                          aria-label={`Remover ${t.name}`}
                          disabled={!!pending[t.jira_board_id ?? ""]}
                          onClick={() =>
                            setTeamActive(t.jira_board_id!, t.name, null, false)
                          }
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {configuredTeams.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Clique em “Sincronizar agora” abaixo para puxar os dados e detectar o
                    tipo (scrum/kanban).
                  </p>
                )}
              </div>

              {/* Busca de projetos */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar projeto por nome ou key…"
                    className="pl-9 pr-9"
                  />
                  {boardsLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                {boards == null ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                    ))}
                  </div>
                ) : boards.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum projeto encontrado.
                  </p>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      {q.trim()
                        ? `${boards.length} de ${total} projetos · tipo detectado ao sincronizar`
                        : `Digite para buscar entre os ${total} projetos · tipo detectado ao sincronizar`}
                    </p>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {boards.map((b) => {
                        const on = isOn(b);
                        return (
                          <li
                            key={b.id}
                            className="flex items-center gap-3 px-4 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{b.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {b.projectKey ?? b.id}
                              </p>
                            </div>
                            <Switch
                              on={on}
                              onChange={(v) =>
                                setTeamActive(b.id, b.name, b.projectName, v)
                              }
                              disabled={!!pending[b.id]}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sync */}
      <Card>
        <CardHeader>
          <CardTitle>Sincronizar dados</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Puxa issues, sprints e épicos dos times ativos e detecta o tipo de cada um.
          </p>
          <Button variant="outline" onClick={doSync} disabled={syncing}>
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        </CardContent>
        {syncMsg && (
          <div className="px-6 pb-5 -mt-2">
            <p className="text-xs text-primary">{syncMsg}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

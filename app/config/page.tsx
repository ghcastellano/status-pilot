"use client";
import { useText } from "@/components/lang-context";

/**
 * /config — Configurar Jira + selecionar boards como times.
 * Conecta via Basic auth (email + API token) ou OAuth 2.0 (3LO), busca BOARDS
 * do Jira (server-side) e liga/desliga cada um como time (POST/DELETE
 * /api/teams). Com Basic auth o tipo scrum/kanban é real; no fallback OAuth o
 * tipo é "unknown" (detectado na sincronização).
 */
import { DemoLauncher, useDemo } from "@/components/demo-workspace";
import * as React from "react";
import {
  Plus,
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

// Cada "board" é um board do Jira. Com Basic auth `id` é numérico e `type` é
// o tipo real (scrum/kanban); no fallback OAuth `id` é a project key e `type`
// é "unknown".
interface Board {
  id: string | number;
  name: string;
  type: string; // "scrum" | "kanban" | "unknown"
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
  const tx = useText();
  const demo = useDemo();
  const [status, setStatus] = React.useState<JiraStatus | null>(null);
  const [boards, setBoards] = React.useState<Board[] | null>(null);
  const [total, setTotal] = React.useState(0);
  const [boardsErr, setBoardsErr] = React.useState<string | null>(null);
  const [boardsLoading, setBoardsLoading] = React.useState(false);
  const [teams, setTeams] = React.useState<TeamRow[]>([]);
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<Record<string, boolean>>({});
  const [syncingTeams, setSyncingTeams] = React.useState<Record<string, boolean>>({});
  const [showPicker, setShowPicker] = React.useState(false);

  // Formulário Basic auth
  const [jiraUrl, setJiraUrl] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [token, setToken] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [connectErr, setConnectErr] = React.useState<string | null>(null);
  const [disconnecting, setDisconnecting] = React.useState(false);

  // Prefill do form: URL + e-mail lembrados (sem o token, que é sensível).
  // Conveniência POR PERFIL do Chrome — a conexão de verdade (incl. token)
  // fica no banco protegido e vale p/ qualquer usuário, então ninguém redigita
  // depois do primeiro login; isto só acelera reconexões nesta máquina.
  React.useEffect(() => {
    try {
      setJiraUrl(localStorage.getItem("jira_url") ?? "");
      setEmail(localStorage.getItem("jira_email") ?? "");
    } catch {
      /* localStorage indisponível — segue sem prefill */
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

  // Busca server-side de boards. Sem query → primeiros 50 (default da API).
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
        setBoardsErr(d.error ?? tx("Falha ao buscar boards."));
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

  // Busca de boards SÓ quando o seletor está aberto — a lista pode ter milhares
  // de boards; não faz sentido carregá-la toda vez que a tela abre. Debounce 350ms.
  React.useEffect(() => {
    if (!status?.connected || !showPicker) return;
    const t = setTimeout(() => {
      void searchBoards(q.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [q, status?.connected, showPicker, searchBoards]);

  // Set dos board ids ativos (times ativos com jira_board_id)
  const activeBoardIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const t of teams) if (t.active && t.jira_board_id) s.add(t.jira_board_id);
    return s;
  }, [teams]);

  const isOn = (b: Board) => activeBoardIds.has(String(b.id));

  // Conecta via Basic auth. On success recarrega status + boards + teams.
  async function connectBasic(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setConnectErr(null);
    try {
      const res = await fetch("/api/jira/connect-basic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraUrl, email, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConnectErr(data.error ?? tx("Falha ao conectar ao Jira."));
        return;
      }
      // Lembra URL + e-mail p/ próximo prefill (token NÃO vai pro browser).
      try {
        localStorage.setItem("jira_url", jiraUrl.trim());
        localStorage.setItem("jira_email", email.trim());
      } catch {
        /* sem localStorage — ok, conexão já está salva no servidor */
      }
      setToken("");
      await Promise.all([loadStatus(), loadTeams()]);
      await searchBoards(q.trim());
    } catch (err) {
      setConnectErr((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Desconecta (DELETE) e limpa as visões de boards/times.
  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/jira/connect-basic", { method: "DELETE" });
    } catch {
      /* segue para recarregar o status de qualquer forma */
    } finally {
      setBoards(null);
      setTotal(0);
      setBoardsErr(null);
      setTeams([]);
      await loadStatus();
      setDisconnecting(false);
    }
  }

  // Liga/desliga um board como time. Otimista + revert-via-reload.
  async function setTeamActive(
    boardId: string,
    name: string,
    projectKey: string | null,
    projectName: string | null,
    boardType: "scrum" | "kanban" | undefined,
    next: boolean
  ) {
    const key = boardId;
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
            board_type: boardType ?? "scrum",
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
            boardId,
            name,
            projectKey: projectKey ?? undefined,
            projectName: projectName ?? undefined,
            boardType,
          }),
        });
      } else {
        res = await fetch(`/api/teams?id=board-${key}`, { method: "DELETE" });
      }
      if (!res.ok) throw new Error(tx("falha"));
      await loadTeams();
      // Ao LIGAR um board, já puxa os dados desse time da API em background.
      if (next) void autoSync(`board-${key}`);
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

  // Auto-sync em background do time recém-selecionado (não bloqueia a UI). O
  // dado fica salvo no Supabase — na próxima abertura já carrega do banco.
  async function autoSync(teamId: string) {
    setSyncingTeams((s) => ({ ...s, [teamId]: true }));
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      await loadTeams();
    } catch {
      /* silencioso — usuário pode religar o board p/ re-tentar */
    } finally {
      setSyncingTeams((s) => {
        const c = { ...s };
        delete c[teamId];
        return c;
      });
    }
  }

  const connected = status?.connected;
  const notConnected = status != null && !connected;
  const boardsBlocked = boardsErr != null;

  // Times configurados: times ativos com um board Jira vinculado.
  const configuredTeams = React.useMemo(
    () => teams.filter((t) => t.active && t.jira_board_id),
    [teams]
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{tx("Configurar Jira")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tx("Conecte sua conta do Jira e escolha quais boards viram times monitorados.")}</p>
      </div>

      <DemoLauncher />
      <fieldset disabled={demo} className="min-w-0 space-y-6">
      {demo && <p className="text-sm text-muted-foreground">Exit the sample workspace to connect Jira. Your existing connection remains unchanged.</p>}
      {/* Connection card */}
      <Card>
        <CardHeader>
          <CardTitle>{tx("Conexão")}</CardTitle>
        </CardHeader>
        <CardContent>
          {status == null ? (
            <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          ) : connected ? (
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {tx("Conectado:")}{" "}{" "}
                    <span className="text-primary">{status.site_url}</span>
                  </p>
                  {status.account_name && (
                    <p className="text-xs text-muted-foreground">
                      {tx("Autorizado por")}{" "}{status.account_name}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {tx("Desconectar")}</Button>
            </div>
          ) : (
            <div className="space-y-5">
              <form onSubmit={connectBasic} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="jira-url"
                    className="text-sm font-medium"
                  >
                    {tx("URL do Jira")}</label>
                  <Input
                    id="jira-url"
                    value={jiraUrl}
                    onChange={(e) => setJiraUrl(e.target.value)}
                    placeholder="https://sua-empresa.atlassian.net"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="jira-email" className="text-sm font-medium">
                    {tx("E-mail")}</label>
                  <Input
                    id="jira-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@sua-empresa.com"
                    autoComplete="username"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="jira-token" className="text-sm font-medium">
                    API Token
                  </label>
                  <Input
                    id="jira-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="••••••••••••••••"
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    <a
                      href="https://id.atlassian.com/manage-profile/security/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      {tx("Criar um API token aqui")}</a>{" "}
                    {tx("· salvo com segurança no servidor.")}</p>
                </div>

                {connectErr && (
                  <p className="text-sm text-destructive">{connectErr}</p>
                )}

                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> {tx("Conectando…")}</>
                  ) : (
                    <>
                      <Plug className="h-4 w-4" /> {tx("Conectar ao Jira")}</>
                  )}
                </Button>
              </form>

              {/* Como obter o token */}
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tx("Como obter seu API token")}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  <li>{tx("Acesse id.atlassian.com → Segurança.")}</li>
                  <li>{tx("Clique em “Create and manage API tokens”.")}</li>
                  <li>{tx("Clique em “Create API token”.")}</li>
                  <li>{tx("Copie e cole acima.")}</li>
                </ol>
              </div>

              {/* Nota de segurança */}
              <p className="text-xs text-muted-foreground">
                {tx("As credenciais ficam no servidor (Supabase), usadas só para ler o seu Jira. Você pode desconectar quando quiser.")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Boards → times */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{tx("Boards → times")}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {configuredTeams.length}{" "}
              {configuredTeams.length === 1 ? tx("time configurado") : tx("times configurados")}.
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
                  : tx("Conecte o Jira primeiro para buscar boards.")}
              </div>
            </div>
          ) : (
            <>
              {/* Times configurados */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tx("Times configurados")}</p>
                {configuredTeams.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                    {tx("Nenhum time configurado ainda — busque um board abaixo.")}</p>
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
                        {syncingTeams[t.id] && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> {tx("sincronizando…")}</span>
                        )}
                        <TypeBadge type={t.board_type} />
                        <button
                          type="button"
                          aria-label={tx(`Remover ${t.name}`)}
                          disabled={!!pending[t.jira_board_id ?? ""]}
                          onClick={() =>
                            setTeamActive(
                              t.jira_board_id!,
                              t.name,
                              null,
                              null,
                              undefined,
                              false
                            )
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
                    {tx("Os dados sincronizam sozinhos ao selecionar e ficam salvos — na próxima vez já carregam do banco.")}</p>
                )}
              </div>

              {/* Seletor de boards — SOB DEMANDA (não carrega a lista à toa) */}
              {!showPicker ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowPicker(true)}
                >
                  <Plus className="h-4 w-4" /> {tx("Selecionar mais times")}</Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {tx("Selecionar boards")}</p>
                    <button
                      type="button"
                      onClick={() => setShowPicker(false)}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {tx("Fechar")}</button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={tx("Buscar board por nome…")}
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
                    {tx("Nenhum board encontrado.")}</p>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      {q.trim()
                        ? tx(`${boards.length} de ${total} boards`)
                        : tx(`Digite para buscar entre os ${total} boards`)}
                    </p>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {boards.map((b) => {
                        const on = isOn(b);
                        const typed =
                          b.type === "scrum" || b.type === "kanban"
                            ? (b.type as "scrum" | "kanban")
                            : undefined;
                        return (
                          <li
                            key={String(b.id)}
                            className="flex items-center gap-3 px-4 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{b.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {b.projectKey ?? String(b.id)}
                              </p>
                            </div>
                            {typed && <TypeBadge type={typed} />}
                            <Switch
                              on={on}
                              onChange={(v) =>
                                setTeamActive(
                                  String(b.id),
                                  b.name,
                                  b.projectKey,
                                  b.projectName,
                                  typed,
                                  v
                                )
                              }
                              disabled={!!pending[String(b.id)]}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </fieldset>
    </div>
  );
}

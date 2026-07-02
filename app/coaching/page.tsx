"use client";

/**
 * /coaching — página ÚNICA (um item no menu). Abas Portfolio · Detalhe · Leadership.
 * O detalhe segue o seletor de time global (header); clicar num card do portfolio
 * seleciona o time e abre o detalhe.
 */
import * as React from "react";
import { Trophy } from "lucide-react";
import { useTeam } from "@/components/team-context";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ProgramHeader,
  Section,
  LeadershipSummary,
  type PortfolioBoard,
} from "@/components/coaching-portfolio";
import { TeamDetailPanel, type TeamDetail } from "@/components/coaching-detail";

const j = (r: Response) =>
  r.ok ? r.json() : r.json().then((e: any) => Promise.reject(new Error(e.error ?? "Falha ao carregar")));

const needsAttention = (b: PortfolioBoard) => b.status === "at_risk" || b.maturity.tier === 1;

export default function CoachingPage() {
  const { selectedTeam, setSelectedTeamId } = useTeam();
  const [tab, setTab] = React.useState("portfolio");

  const [boards, setBoards] = React.useState<PortfolioBoard[] | null>(null);
  const [boardsErr, setBoardsErr] = React.useState<string | null>(null);

  const [detail, setDetail] = React.useState<TeamDetail | null>(null);
  const [detailErr, setDetailErr] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(true);

  // portfolio (todos os times) — carrega uma vez
  React.useEffect(() => {
    let active = true;
    fetch("/api/coaching/portfolio", { cache: "no-store" })
      .then(j)
      .then((res: { boards: PortfolioBoard[] }) => active && setBoards(res.boards))
      .catch((e: Error) => active && setBoardsErr(e.message));
    return () => {
      active = false;
    };
  }, []);

  // detalhe do time selecionado (seletor global)
  React.useEffect(() => {
    if (!selectedTeam) return;
    let active = true;
    setDetailLoading(true);
    setDetailErr(null);
    setDetail(null); // limpa o detalhe do time anterior (evita render stale em erro)
    fetch(`/api/coaching/team?teamId=${selectedTeam.id}`, { cache: "no-store" })
      .then(j)
      .then((res: TeamDetail) => active && setDetail(res))
      .catch((e: Error) => active && setDetailErr(e.message))
      .finally(() => active && setDetailLoading(false));
    return () => {
      active = false;
    };
  }, [selectedTeam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openTeam = (id: string) => {
    setSelectedTeamId(id);
    setTab("detail");
  };

  const inProgram = boards ?? [];
  const attention = inProgram.filter(needsAttention);
  const onTrack = inProgram.filter((b) => !needsAttention(b));

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Agile Coaching</h1>
          <Badge variant="secondary" title="Thresholds de maturidade ainda não calibrados com dados reais de campo.">
            thresholds a calibrar
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          O que está sendo coachado, por quê, e o que mudou · maturidade weakest-link por método (Scrum/Kanban).
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="detail">
            Detalhe{selectedTeam ? ` · ${selectedTeam.name}` : ""}
          </TabsTrigger>
          <TabsTrigger value="leadership">Leadership</TabsTrigger>
        </TabsList>

        {/* Portfolio */}
        <TabsContent value="portfolio" className="space-y-6">
          {boardsErr && <p className="text-sm text-destructive">{boardsErr}</p>}
          {!boards && !boardsErr && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          )}
          {boards && (
            <>
              <ProgramHeader boards={boards} />
              <div className="space-y-8">
                <Section
                  title="Precisa de atenção"
                  blurb="Regredindo ou preso — comece por aqui."
                  chip="bg-destructive/10 text-destructive"
                  boards={attention}
                  onOpen={openTeam}
                />
                <Section
                  title="No caminho"
                  blurb="Evoluindo bem."
                  chip="bg-primary/10 text-primary"
                  boards={onTrack}
                  onOpen={openTeam}
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* Detalhe */}
        <TabsContent value="detail">
          {detailErr && <p className="text-sm text-destructive">{detailErr}</p>}
          {detailLoading && !detail && (
            <div className="space-y-4">
              <div className="h-56 animate-pulse rounded-xl bg-muted" />
              <div className="h-64 animate-pulse rounded-xl bg-muted" />
            </div>
          )}
          {detail && detail.team.id === selectedTeam?.id && !detailLoading && !detailErr && (
            <TeamDetailPanel key={detail.team.id} d={detail} />
          )}
        </TabsContent>

        {/* Leadership */}
        <TabsContent value="leadership">
          {boards ? (
            <LeadershipSummary boards={boards} />
          ) : (
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

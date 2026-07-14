/**
 * lib/window.ts — resolução ÚNICA da janela de análise, compartilhada pelo
 * dashboard (/api/metrics) e pela maturidade (/api/coaching/team) para que os
 * números NUNCA se contradigam (era o bug: KPIs em 12 semanas vs maturidade em
 * 6 sprints). Regras (espelham o scrum-maturity-dashboard-marvin):
 *   • Scrum: padrão = últimas 6 sprints FECHADAS. Futuros (não iniciados) não
 *     aparecem. Selecionar só o sprint ATIVO → métricas atuais, SEM maturidade.
 *   • Kanban: janela rolling de semanas (4/8/12, default 8).
 */
import type { SprintRow, TeamRow } from "./metrics";

export interface WindowResult {
  sprintIds?: string[];
  cycleWeeks?: number;
  availableSprints: { id: string; name: string; state: string }[];
  label: string; // rótulo do período (ex.: "últimas 6 sprints fechadas")
  labelEn: string;
  activeSprintSelected: boolean; // só o ativo → sem maturidade (não fechou)
}

export function resolveWindow(
  team: TeamRow,
  sprints: SprintRow[],
  params: { sprintIds?: string | null; weeks?: string | null }
): WindowResult {
  const teamSprints = sprints
    .filter((s) => s.team_id === team.id)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  // Selecionáveis = fechados + ativo. FUTUROS (ainda sem start) ficam de fora.
  const selectable = teamSprints.filter((s) => s.state !== "future");
  const availableSprints = selectable.map((s) => ({ id: s.id, name: s.name, state: s.state }));

  if (team.board_type !== "scrum") {
    const w = Number(params.weeks);
    const cycleWeeks = [4, 8, 12].includes(w) ? w : 8;
    return {
      cycleWeeks,
      availableSprints,
      label: `últimas ${cycleWeeks} semanas`,
      labelEn: `last ${cycleWeeks} weeks`,
      activeSprintSelected: false,
    };
  }

  const closedIds = teamSprints.filter((s) => s.state === "closed").map((s) => s.id);
  const activeId = teamSprints.find((s) => s.state === "active")?.id;
  const picked = params.sprintIds
    ? params.sprintIds.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  if (picked && picked.length) {
    const onlyActive = picked.length === 1 && picked[0] === activeId;
    return {
      sprintIds: picked,
      availableSprints,
      label: onlyActive ? "sprint ativo (métricas atuais)" : `${picked.length} sprints selecionados`,
      labelEn: onlyActive ? "active sprint (current metrics)" : `${picked.length} selected sprints`,
      activeSprintSelected: onlyActive,
    };
  }

  // Padrão: últimas 6 fechadas (board novo sem fechadas → usa as que houver).
  const base = closedIds.length ? closedIds : teamSprints.filter((s) => s.state !== "future").map((s) => s.id);
  const sprintIds = base.slice(-6);
  return {
    sprintIds,
    availableSprints,
    label: `últimas ${sprintIds.length} sprints fechadas`,
    labelEn: `last ${sprintIds.length} closed sprints`,
    activeSprintSelected: false,
  };
}

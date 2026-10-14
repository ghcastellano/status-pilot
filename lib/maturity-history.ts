/**
 * lib/maturity-history.ts — análise RETROATIVA da maturidade, gravada no banco.
 *
 * Recomputa a maturidade "as-of" cada ponto histórico (para Scrum: fim de cada
 * sprint fechado; para Kanban: semanal) e persiste em `metrics_history`. Assim o
 * dashboard lê o histórico do banco — sem consultar a API do Jira toda hora.
 *
 * Truncagem as-of W (duas representações de tempo andam juntas):
 *   • stages[]  → só stamps com at <= W; issue sem stamp sobrevivente não existia.
 *   • marcos    → colunas (started_at, done_at…) > W viram null.
 *   • current_stage → re-derivado do ÚLTIMO stamp sobrevivente.
 *   • sprints   → closed se end <= W; active se em curso; future senão.
 */
import type { Database } from "./db";
import {
  computeTeamMetrics,
  referenceNow,
  type TeamRow,
  type SprintRow,
  type IssueRow,
} from "./metrics";
import { computeMaturity } from "./maturity";

const DAY = 86_400_000;
const MAX_POINTS = 12;

const nul = (t: string | null, W: number) => (t && Date.parse(t) <= W ? t : null);

function issueAsOf(i: IssueRow, W: number): IssueRow | null {
  if (Date.parse(i.created_at) > W) return null;
  const stages = (i.stages ?? []).filter((s) => Date.parse(s.at) <= W);
  if (stages.length === 0) return null;
  const last = stages[stages.length - 1];
  const status = last.kind === "done" ? "Done" : last.kind === "active" ? "In Progress" : "To Do";
  return {
    ...i,
    stages,
    current_stage: last.jira,
    status,
    discovery_started_at: nul(i.discovery_started_at, W),
    discovery_done_at: nul(i.discovery_done_at, W),
    committed_at: nul(i.committed_at, W),
    started_at: nul(i.started_at, W),
    review_started_at: nul(i.review_started_at, W),
    done_at: nul(i.done_at, W),
    released_at: nul(i.released_at, W),
  };
}

function sprintAsOf(s: SprintRow, W: number): SprintRow {
  const start = new Date(s.start_date + "T00:00:00Z").getTime();
  const end = new Date(s.end_date + "T23:59:59Z").getTime();
  const state: SprintRow["state"] = end <= W ? "closed" : start <= W ? "active" : "future";
  return { ...s, state };
}

export interface HistoryRow {
  team_id: string;
  as_of: string;
  board_type: "scrum" | "kanban";
  tier: number | null;
  metrics: unknown;
}

/** Pontos as-of: fim dos sprints fechados (scrum) ou semanal (kanban/sem sprints). */
function historyPoints(team: TeamRow, sprints: SprintRow[], issues: IssueRow[]): number[] {
  if (team.board_type === "scrum") {
    const closedEnds = sprints
      .filter((s) => s.state === "closed")
      .map((s) => new Date(s.end_date + "T23:59:59Z").getTime())
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    if (closedEnds.length) return closedEnds.slice(-MAX_POINTS);
  }
  const anchor = referenceNow(issues);
  const pts: number[] = [];
  for (let k = MAX_POINTS - 1; k >= 0; k--) pts.push(anchor - k * 7 * DAY);
  return pts;
}

/** Recomputa a maturidade em cada ponto histórico. Dedupe por data (as_of é PK). */
export function buildMaturityHistoryRows(
  team: TeamRow,
  sprints: SprintRow[],
  issues: IssueRow[]
): HistoryRow[] {
  const points = historyPoints(team, sprints, issues);
  const byAsOf = new Map<string, HistoryRow>();
  for (const W of points) {
    const win = issues.map((i) => issueAsOf(i, W)).filter((i): i is IssueRow => i !== null);
    const sp = sprints.map((s) => sprintAsOf(s, W));
    const m = computeTeamMetrics(team, sp, win, { weeks: 12, asOf: W } as any);
    const maturity = computeMaturity(m);
    const as_of = new Date(W).toISOString().slice(0, 10);
    byAsOf.set(as_of, {
      team_id: team.id,
      as_of,
      board_type: team.board_type,
      tier: maturity.tier,
      metrics: maturity,
    });
  }
  return Array.from(byAsOf.values()).sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
}

/** Recomputa e grava (idempotente) o histórico de maturidade do time. */
export async function storeMaturityHistory(
  sb: Database,
  team: TeamRow,
  sprints: SprintRow[],
  issues: IssueRow[]
): Promise<number> {
  const rows = buildMaturityHistoryRows(team, sprints, issues);
  const { error } = await sb.rpc("replace_team_history", { p_team: team.id, p_history: rows });
  if (error) throw new Error("Unable to replace maturity history.");
  return rows.length;
}

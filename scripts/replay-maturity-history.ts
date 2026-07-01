/**
 * scripts/replay-maturity-history.ts — semeia metrics_history recomputando a
 * maturidade "as-of" cada uma das últimas 12 semanas, a partir da timeline
 * sintética já existente (stages + colunas de marco).
 *
 * Truncagem as-of W (crítico — duas representações de tempo andam juntas):
 *   • stages[]  → só stamps com at <= W; issue sem stamp sobrevivente não existia.
 *   • marcos    → toda coluna (started_at, done_at, released_at…) > W vira null.
 *   • current_stage → re-derivado do ÚLTIMO stamp sobrevivente (não do valor live).
 *   • sprints   → closed só se end_date <= W; active se em curso; future senão.
 *
 * Rodar: npm run db:replay
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabaseAdmin } from "../lib/supabase";
import {
  computeTeamMetrics,
  referenceNow,
  type TeamRow,
  type SprintRow,
  type IssueRow,
} from "../lib/metrics";
import { computeMaturity } from "../lib/maturity";

const DAY = 86_400_000;
const WEEKS = 12;

const nul = (t: string | null, W: number) => (t && Date.parse(t) <= W ? t : null);

/** Clona a issue truncada em W; null se ela ainda não existia. */
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

/** Estado da sprint visto de W (replay não confia no campo `state` live). */
function sprintAsOf(s: SprintRow, W: number): SprintRow {
  const start = new Date(s.start_date + "T00:00:00Z").getTime();
  const end = new Date(s.end_date + "T23:59:59Z").getTime();
  const state = end <= W ? "closed" : start <= W ? "active" : "future";
  return { ...s, state };
}

async function main() {
  const sb = getSupabaseAdmin();
  const [teamsRes, sprintsRes, issuesRes] = await Promise.all([
    sb.from("teams").select("*"),
    sb.from("sprints").select("*"),
    sb.from("issues").select("*"),
  ]);
  for (const r of [teamsRes, sprintsRes, issuesRes])
    if (r.error) throw new Error(r.error.message);
  const teams = (teamsRes.data ?? []) as TeamRow[];
  const allSprints = (sprintsRes.data ?? []) as SprintRow[];
  const allIssues = (issuesRes.data ?? []) as IssueRow[];

  for (const team of teams) {
    const teamIssues = allIssues.filter((i) => i.team_id === team.id);
    const teamSprints = allSprints.filter((s) => s.team_id === team.id);
    // âncora = borda do dado sintético (não wall-clock)
    const anchor = referenceNow(teamIssues);

    const rows = [];
    for (let k = WEEKS - 1; k >= 0; k--) {
      const W = anchor - k * 7 * DAY;
      const issues = teamIssues
        .map((i) => issueAsOf(i, W))
        .filter((i): i is IssueRow => i !== null);
      const sprints = teamSprints.map((s) => sprintAsOf(s, W));
      const m = computeTeamMetrics(team, sprints, issues, { weeks: 12, asOf: W });
      const maturity = computeMaturity(m);
      rows.push({
        team_id: team.id,
        as_of: new Date(W).toISOString().slice(0, 10),
        board_type: team.board_type,
        tier: maturity.tier,
        metrics: maturity,
      });
    }

    // idempotente: limpa e regrava o time
    await sb.from("metrics_history").delete().eq("team_id", team.id);
    const res = await sb.from("metrics_history").insert(rows);
    if (res.error) throw new Error(`metrics_history ${team.id}: ${res.error.message}`);
    const serie = rows.map((r) => r.tier ?? "·").join(" ");
    console.log(`✓ ${team.name} (${team.board_type}): ${rows.length} semanas → tiers [${serie}]`);
  }
  console.log("\n✓ Replay completo.");
}

main().catch((e) => {
  console.error("Erro:", e.message || e);
  process.exit(1);
});

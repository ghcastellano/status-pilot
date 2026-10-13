import { dataset, EPICS } from "../../scripts/data/cafe-aurora";
import { computeTeamMetrics, type TeamRow, type SprintRow, type IssueRow } from "../metrics";
import { computeMaturity, type Tier } from "../maturity";
import { buildMaturityHistoryRows } from "../maturity-history";
import { resolveWindow } from "../window";
import { behavioralReadiness, classifyEngagement, signalDefs, tierMovement, type CoachingPlan, type Experiment } from "../coaching";

// Fixed, reproducible scenario. These are synthetic observations, not live Jira data.
export const DEMO_AS_OF = "2026-06-03";
export const demoTeams: TeamRow[] = dataset.teams.map((team) => ({
  ...team, active: true, jira_board_id: null, last_synced_at: null,
  description: team.board_type === "scrum"
    ? "Sample product team: ordering and checkout, two-week Scrum sprints."
    : "Sample platform team: loyalty and reliability, continuous Kanban delivery.",
}));
const sprints: SprintRow[] = dataset.sprints.map((s) => ({ ...s, completed_points: 0 }));
const issues: IssueRow[] = dataset.issues.map(({ epic, ...issue }) => ({ ...issue, epic_key: epic }));
const epicNames = Object.fromEntries(EPICS.map((e) => [e.key, e.name]));

export function demoMetrics(teamId: string, params = new URLSearchParams()) {
  const team = demoTeams.find((t) => t.id === teamId);
  if (!team) return null;
  const teamSprints = sprints.filter((s) => s.team_id === teamId);
  const win = resolveWindow(team, teamSprints, {
    sprintIds: params.get("sprintIds"), weeks: params.get("weeks"),
  });
  const metrics = computeTeamMetrics(team, teamSprints, issues, {
    epicNames, epic: params.get("epic"), type: params.get("type"),
    weeks: win.cycleWeeks ?? 12, sprintIds: win.sprintIds, cycleWeeks: win.cycleWeeks,
  });
  return { ...metrics, window: {
    mode: team.board_type, sprintIds: win.sprintIds ?? [], cycleWeeks: win.cycleWeeks ?? null,
    label: win.label, labelEn: win.labelEn, availableSprints: win.availableSprints,
    activeSprintSelected: win.activeSprintSelected,
  } };
}

const histories = new Map(demoTeams.map((team) => [team.id, buildMaturityHistoryRows(
  team, sprints.filter((s) => s.team_id === team.id), issues.filter((i) => i.team_id === team.id),
)]));

export function demoCoaching(teamId: string, params = new URLSearchParams()) {
  const metrics = demoMetrics(teamId, params);
  if (!metrics) return null;
  const { team } = metrics;
  const maturity = metrics.window.activeSprintSelected ? null : computeMaturity(metrics);
  const history = histories.get(teamId) ?? [];
  const plan: CoachingPlan = {
    team_id: teamId, coaching: true, coach: "Alex Morgan (sample)",
    engaged_at: "2026-04-08T12:00:00Z", review_at: "2026-06-10",
    main_gap: "Long waiting times before review reduce delivery flow.",
    hypothesis: "A review WIP limit and daily pairing may shorten waiting time.",
    next_step: "Compare cycle time and aging after two delivery cycles.",
    ask: "Reserve two hours per day for shared review capacity.",
  };
  const signals = Object.fromEntries(signalDefs(team.board_type).map((s, i) => [s.key,
    i < (team.board_type === "scrum" ? 3 : 6) ? "consistent" : i < 7 ? "emerging" : "not_yet",
  ]));
  const experiments: Experiment[] = [
    { id: teamId === "espresso" ? 1 : 3, team_id: teamId, pillar: "flow", metric: "Cycle time p85",
      behavior: "Limit review WIP and pair on the oldest item first.",
      hypothesis: "Smaller review queues reduce tail latency.", outcome: null, status: "active",
      created_at: "2026-05-20T12:00:00Z" },
    { id: teamId === "espresso" ? 2 : 4, team_id: teamId, pillar: "quality", metric: "Rework proxy",
      behavior: "Include acceptance examples before development starts.",
      hypothesis: "Earlier feedback reduces rework.", outcome: "Sample retrospective: keep acceptance examples and assess over a longer window.",
      status: "done", created_at: "2026-04-22T12:00:00Z" },
  ];
  return {
    team, maturity, metrics, window: metrics.window, history, plan,
    assessment: { team_id: teamId, signals, note: "Illustrative coaching assessment; not an evaluation of a real team." },
    experiments, comments: [], fieldHistory: [{
      id: teamId === "espresso" ? 1 : 2, team_id: teamId, section: "plan",
      field: "next_step", old_value: "Observe the review queue for one week.",
      new_value: plan.next_step, changed_by: "Alex Morgan (sample)", changed_at: "2026-06-02T12:00:00Z",
    }], coach: plan.coach,
    status: classifyEngagement({ tier: maturity?.tier ?? null,
      historyTiers: history.map((h) => h.tier as Tier | null), coaching: true }),
    evidence: { scatter: metrics.flow.scatter, cycleP50: metrics.flow.deliveryCycleTime.median,
      cycleP85: metrics.flow.deliveryCycleTime.p85, velocity: metrics.scrum?.velocity ?? null,
      throughputSeries: metrics.flow.throughput.series },
  };
}

export function demoPortfolio() {
  return { boards: demoTeams.map((team) => {
    const detail = demoCoaching(team.id)!;
    const movement = tierMovement(detail.history.map((h) => h.tier as Tier | null));
    return {
      team, maturity: detail.maturity, history: detail.history.map(({ as_of, tier }) => ({ as_of, tier })),
      status: detail.status, coaching: true, coach: detail.coach,
      ask: detail.plan.ask, mainGap: detail.plan.main_gap, workingOn: ["flow"],
      behavioral: behavioralReadiness(detail.assessment.signals), ...movement,
      caption: detail.window.labelEn,
    };
  }) };
}

function summary(teamId: string) {
  const metrics = demoMetrics(teamId)!;
  return `### ${metrics.team.name}\n\n` +
    `The selected sample contains **${metrics.totals.issues} work items** across **${metrics.totals.epics} epics**. ` +
    `Delivery cycle time is **${metrics.flow.deliveryCycleTime.median} days at p50** and ` +
    `**${metrics.flow.deliveryCycleTime.p85} days at p85**.\n\n` +
    `**Next step:** inspect aging items and review queues, then compare the same delivery window after a WIP-limit experiment. ` +
    `These observations describe a synthetic scenario and do not establish causation.`;
}

export interface DemoResponse { status: number; body: unknown }

/** Pure allowlisted responder: no database, provider SDK, credentials or network calls. */
export function respondToDemo(method: string, route: string, params: URLSearchParams, body: Record<string, unknown> = {}): DemoResponse {
  const ok = (value: unknown): DemoResponse => ({ status: 200, body: value });
  const error = (status: number, message: string): DemoResponse => ({ status, body: { error: message } });
  if (method === "GET") {
    if (route === "/api/teams") return ok({ teams: demoTeams });
    if (route === "/api/jira/status") return ok({ connected: false, demo: true });
    if (route === "/api/jira/boards") return ok({ boards: [] });
    if (route === "/api/coaching/portfolio") return ok(demoPortfolio());
    if (route === "/api/metrics" || route === "/api/coaching/team") {
      const teamId = params.get("teamId");
      if (!teamId) return error(400, "Select a sample team.");
      const result = route === "/api/metrics" ? demoMetrics(teamId, params) : demoCoaching(teamId, params);
      return result ? ok(result) : error(404, "Sample team not found.");
    }
    return error(404, "This endpoint is not available in the sample workspace.");
  }
  if (method !== "POST" || !["/api/ask", "/api/report", "/api/insights"].includes(route)) {
    return error(403, "Sample workspace is read-only. Exit the demo to use connected services.");
  }
  const teamId = typeof body.teamId === "string" ? body.teamId : null;
  if (teamId && !demoTeams.some((t) => t.id === teamId)) return error(404, "Sample team not found.");
  if (route === "/api/insights") {
    if (!teamId) return error(400, "Select a sample team.");
    const filters = new URLSearchParams();
    for (const key of ["epic", "type", "weeks", "sprintIds"]) {
      if (typeof body[key] === "string" || typeof body[key] === "number") filters.set(key, String(body[key]));
    }
    if (typeof body.sprintId === "string") filters.set("sprintIds", body.sprintId);
    const metrics = demoMetrics(teamId, filters)!;
    return ok({ cached: false, demo: true, insights: {
      cycleTime: `Sample calculation: p50 ${metrics.flow.deliveryCycleTime.median} days; p85 ${metrics.flow.deliveryCycleTime.p85} days.`,
      secondary: "Compare a consistent delivery window before drawing conclusions.",
      flowEfficiency: "Inspect waiting stages and review capacity in this synthetic scenario.",
      predictability: "Use the charts to compare commitments with completed work.",
      chart: "Sample guidance, calculated without a live AI request.",
    } });
  }
  if (route === "/api/ask" && (typeof body.question !== "string" || !body.question.trim() || body.question.length > 2000)) {
    return error(400, "Enter a question of up to 2,000 characters.");
  }
  const content = `**Sample analysis · snapshot ${DEMO_AS_OF} · no live AI request**\n\n` +
    (route === "/api/ask" ? "This demonstration returns a fixed delivery overview. Custom question answering is available with a configured AI connection.\n\n" : "") +
    (teamId ? [teamId] : demoTeams.map((t) => t.id)).map(summary).join("\n\n");
  return ok({ [route === "/api/ask" ? "answer" : "report"]: content, cached: false, demo: true, remaining: null });
}

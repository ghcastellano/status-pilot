/**
 * lib/data.ts — leitura dos dados do Neon (somente backend).
 */
import { getDatabase } from "./db";
import type { TeamRow, SprintRow, IssueRow } from "./metrics";

/** Times ATIVOS (deselecionados no /config ficam active=false e somem das telas). */
export async function fetchTeams(): Promise<TeamRow[]> {
  const sb = getDatabase();
  const { data, error } = await sb.select("teams", { orderBy: "name", ascending: true, where: { ["active"]: true }, columns: "*" });
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamRow[];
}

export interface EpicRow { team_id: string; epic_key: string; name: string; summary: string | null; jira_key: string | null }

export async function fetchTeamData(
  teamId: string
): Promise<{ team: TeamRow | null; sprints: SprintRow[]; issues: IssueRow[]; epics: EpicRow[] }> {
  const sb = getDatabase();
  const [teamRes, sprintsRes, issuesRes, epicsRes] = await Promise.all([
    sb.select("teams", { single: 'optional', where: { ["id"]: teamId }, columns: "*" }),
    sb.select("sprints", { where: { ["team_id"]: teamId }, columns: "*" }),
    sb.select("issues", { where: { ["team_id"]: teamId }, columns: "*" }),
    sb.select("epics", { where: { ["team_id"]: teamId }, columns: "*" }),
  ]);
  for (const r of [teamRes, sprintsRes, issuesRes, epicsRes])
    if (r.error) throw new Error(r.error.message);
  return {
    team: (teamRes.data ?? null) as TeamRow | null,
    sprints: (sprintsRes.data ?? []) as SprintRow[],
    issues: (issuesRes.data ?? []) as IssueRow[],
    epics: (epicsRes.data ?? []) as EpicRow[],
  };
}

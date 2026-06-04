/**
 * lib/data.ts — leitura dos dados do Supabase (somente backend).
 */
import { getSupabaseAdmin } from "./supabase";
import type { TeamRow, SprintRow, IssueRow } from "./metrics";

export async function fetchTeams(): Promise<TeamRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("teams").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as TeamRow[];
}

export interface EpicRow { team_id: string; epic_key: string; name: string; summary: string | null; jira_key: string | null }

export async function fetchTeamData(
  teamId: string
): Promise<{ team: TeamRow | null; sprints: SprintRow[]; issues: IssueRow[]; epics: EpicRow[] }> {
  const sb = getSupabaseAdmin();
  const [teamRes, sprintsRes, issuesRes, epicsRes] = await Promise.all([
    sb.from("teams").select("*").eq("id", teamId).maybeSingle(),
    sb.from("sprints").select("*").eq("team_id", teamId),
    sb.from("issues").select("*").eq("team_id", teamId),
    sb.from("epics").select("*").eq("team_id", teamId),
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

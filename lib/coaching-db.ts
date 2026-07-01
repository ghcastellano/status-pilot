/**
 * lib/coaching-db.ts — acesso às tabelas de coaching no Supabase (SOMENTE backend).
 */
import { getSupabaseAdmin } from "./supabase";
import type { MaturityResult, Tier } from "./maturity";
import type { CoachingPlan, Experiment } from "./coaching";

export interface HistoryRow {
  team_id: string;
  as_of: string; // YYYY-MM-DD
  board_type: "scrum" | "kanban";
  tier: Tier | null;
  metrics: MaturityResult;
}

export async function fetchHistory(teamId: string): Promise<HistoryRow[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("metrics_history")
    .select("team_id, as_of, board_type, tier, metrics")
    .eq("team_id", teamId)
    .order("as_of");
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoryRow[];
}

export async function fetchPlan(teamId: string): Promise<CoachingPlan | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("coaching_plans")
    .select("*")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as CoachingPlan | null;
}

/** Upsert presence-aware: só as chaves enviadas são escritas (merge no existente). */
export async function savePlan(
  teamId: string,
  patch: Partial<Omit<CoachingPlan, "team_id">>
): Promise<CoachingPlan> {
  const sb = getSupabaseAdmin();
  const existing = await fetchPlan(teamId);
  const row = {
    ...(existing ?? { coaching: true }),
    ...patch,
    team_id: teamId,
    // carimba a 1ª engajada; preserva a original em saves posteriores
    engaged_at: existing?.engaged_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("coaching_plans")
    .upsert(row, { onConflict: "team_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CoachingPlan;
}

export interface Assessment {
  team_id: string;
  signals: Record<string, string>;
  note: string | null;
}

export async function fetchAssessment(teamId: string): Promise<Assessment | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("coaching_assessments")
    .select("team_id, signals, note")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Assessment | null;
}

export async function saveAssessment(
  teamId: string,
  signals: Record<string, string>,
  note: string | null
): Promise<Assessment> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("coaching_assessments")
    .upsert(
      { team_id: teamId, signals, note, updated_at: new Date().toISOString() },
      { onConflict: "team_id" }
    )
    .select("team_id, signals, note")
    .single();
  if (error) throw new Error(error.message);
  return data as Assessment;
}

export async function fetchExperiments(teamId: string): Promise<Experiment[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("coaching_experiments")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Experiment[];
}

export async function saveExperiment(
  exp: Partial<Experiment> & { team_id: string; behavior: string; pillar: string }
): Promise<Experiment> {
  const sb = getSupabaseAdmin();
  if (exp.id != null) {
    const { id, team_id: _t, created_at: _c, ...patch } = exp;
    const { data, error } = await sb
      .from("coaching_experiments")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Experiment;
  }
  const { data, error } = await sb
    .from("coaching_experiments")
    .insert({
      team_id: exp.team_id,
      pillar: exp.pillar,
      metric: exp.metric ?? null,
      behavior: exp.behavior,
      hypothesis: exp.hypothesis ?? null,
      outcome: exp.outcome ?? null,
      status: exp.status ?? "active",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Experiment;
}

export async function deleteExperiment(id: number): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("coaching_experiments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

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
  patch: Partial<Omit<CoachingPlan, "team_id">>,
  changedBy = "—"
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
  await recordFieldHistory(
    teamId,
    changedBy,
    diffFields("plan", (existing ?? {}) as Record<string, unknown>, patch as Record<string, unknown>, Object.keys(patch))
  );
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
  note: string | null,
  changedBy = "—"
): Promise<Assessment> {
  const sb = getSupabaseAdmin();
  const existing = await fetchAssessment(teamId);
  const { data, error } = await sb
    .from("coaching_assessments")
    .upsert(
      { team_id: teamId, signals, note, updated_at: new Date().toISOString() },
      { onConflict: "team_id" }
    )
    .select("team_id, signals, note")
    .single();
  if (error) throw new Error(error.message);
  // Diff: 1 entrada por sinal que mudou de fato, + a nota.
  const entries: FieldHistoryEntry[] = [];
  const keys = new Set([...Object.keys(existing?.signals ?? {}), ...Object.keys(signals)]);
  for (const k of keys) {
    const o = normSignal(existing?.signals?.[k]);
    const n = normSignal(signals[k]);
    if (o !== n) entries.push({ section: "signal", field: k, old_value: o || null, new_value: n || null });
  }
  const oNote = normVal(existing?.note);
  const nNote = normVal(note);
  if (oNote !== nNote) entries.push({ section: "signal", field: "note", old_value: oNote || null, new_value: nNote || null });
  await recordFieldHistory(teamId, changedBy, entries);
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
  exp: Partial<Experiment> & { team_id: string; behavior: string; pillar: string },
  changedBy = "—"
): Promise<Experiment> {
  const sb = getSupabaseAdmin();
  if (exp.id != null) {
    const { id, team_id: _t, created_at: _c, ...patch } = exp;
    // snapshot ANTES do update para diferenciar campo a campo
    const { data: before } = await sb
      .from("coaching_experiments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const { data, error } = await sb
      .from("coaching_experiments")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (before) {
      await recordFieldHistory(
        exp.team_id,
        changedBy,
        diffFields("experiment", before as Record<string, unknown>, patch as Record<string, unknown>, Object.keys(patch), {
          id: Number(id),
          label: (before as { behavior?: string }).behavior ?? exp.behavior,
        })
      );
    }
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
  const created = data as Experiment;
  await recordFieldHistory(exp.team_id, changedBy, [
    { section: "experiment", field: "created", old_value: null, new_value: created.behavior, entity_id: created.id, entity_label: created.behavior },
  ]);
  return created;
}

export async function deleteExperiment(id: number, changedBy = "—"): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: before } = await sb
    .from("coaching_experiments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const { error } = await sb.from("coaching_experiments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const b = before as { team_id?: string; behavior?: string } | null;
  if (b?.team_id) {
    await recordFieldHistory(b.team_id, changedBy, [
      { section: "experiment", field: "deleted", old_value: b.behavior ?? null, new_value: null, entity_id: Number(id), entity_label: b.behavior ?? null },
    ]);
  }
}

// ── Comentários de experimento (thread simples: autor · data · texto) ──
export interface ExperimentComment {
  id: number;
  experiment_id: number;
  team_id: string;
  author: string;
  body: string;
  created_at: string;
}

/** Todos os comentários dos experimentos do time, cronológico (antigo→novo).
 *  Resiliente: se a tabela ainda não existe (schema não aplicado), retorna []. */
export async function fetchCommentsForTeam(teamId: string): Promise<ExperimentComment[]> {
  const sb = getSupabaseAdmin();
  try {
    const { data, error } = await sb
      .from("experiment_comments")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ExperimentComment[];
  } catch (e) {
    console.warn("fetchCommentsForTeam:", (e as Error).message);
    return [];
  }
}

export async function addComment(input: {
  experiment_id: number;
  team_id: string;
  author: string;
  body: string;
}): Promise<ExperimentComment> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("experiment_comments")
    .insert({
      experiment_id: input.experiment_id,
      team_id: input.team_id,
      author: input.author,
      body: input.body,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ExperimentComment;
}

export async function deleteComment(id: number): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("experiment_comments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Histórico de mudanças por campo (diff old→new) ───────────────────
export type HistorySection = "plan" | "experiment" | "signal";

export interface FieldHistoryEntry {
  section: HistorySection;
  field: string;
  old_value: string | null;
  new_value: string | null;
  entity_id?: number | null;
  entity_label?: string | null;
}

export interface FieldHistoryRow extends FieldHistoryEntry {
  id: number;
  team_id: string;
  changed_by: string;
  changed_at: string;
}

/** null/undefined/"" são equivalentes — não geram ruído de "mudança". */
const normVal = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "" : String(v);

/** Como normVal, mas "unknown" (sinal não avaliado) também conta como vazio. */
const normSignal = (v: unknown): string => {
  const s = normVal(v);
  return s === "unknown" ? "" : s;
};

/** Diff genérico: 1 entrada por campo cujo valor mudou de fato. */
function diffFields(
  section: HistorySection,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
  entity?: { id?: number | null; label?: string | null }
): FieldHistoryEntry[] {
  const out: FieldHistoryEntry[] = [];
  for (const f of fields) {
    const o = normVal(before[f]);
    const n = normVal(after[f]);
    if (o !== n)
      out.push({
        section,
        field: f,
        old_value: o || null,
        new_value: n || null,
        entity_id: entity?.id ?? null,
        entity_label: entity?.label ?? null,
      });
  }
  return out;
}

/** Grava 1 linha por campo alterado. Best-effort: nunca quebra o save. */
export async function recordFieldHistory(
  teamId: string,
  changedBy: string,
  entries: FieldHistoryEntry[]
): Promise<void> {
  if (!entries.length) return;
  const sb = getSupabaseAdmin();
  try {
    const rows = entries.map((e) => ({
      team_id: teamId,
      section: e.section,
      entity_id: e.entity_id ?? null,
      entity_label: e.entity_label ?? null,
      field: e.field,
      old_value: e.old_value,
      new_value: e.new_value,
      changed_by: changedBy || "—",
    }));
    const { error } = await sb.from("coaching_field_history").insert(rows);
    if (error) throw error;
  } catch (e) {
    console.warn("recordFieldHistory:", (e as Error).message);
  }
}

/** Histórico do time, mais recente primeiro. Resiliente a tabela ausente. */
export async function fetchFieldHistory(teamId: string, limit = 200): Promise<FieldHistoryRow[]> {
  const sb = getSupabaseAdmin();
  try {
    const { data, error } = await sb
      .from("coaching_field_history")
      .select("*")
      .eq("team_id", teamId)
      .order("changed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as FieldHistoryRow[];
  } catch (e) {
    console.warn("fetchFieldHistory:", (e as Error).message);
    return [];
  }
}

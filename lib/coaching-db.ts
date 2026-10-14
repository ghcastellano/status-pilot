/**
 * lib/coaching-db.ts — acesso às tabelas de coaching no Neon (SOMENTE backend).
 */
import { getDatabase } from "./db";
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
  const sb = getDatabase();
  const { data, error } = await sb.select("metrics_history", { orderBy: "as_of", ascending: true, where: { ["team_id"]: teamId }, columns: "team_id, as_of, board_type, tier, metrics" });
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoryRow[];
}

export async function fetchPlan(teamId: string): Promise<CoachingPlan | null> {
  const sb = getDatabase();
  const { data, error } = await sb.select("coaching_plans", { single: 'optional', where: { ["team_id"]: teamId }, columns: "*" });
  if (error) throw new Error(error.message);
  return (data ?? null) as CoachingPlan | null;
}

/** Upsert presence-aware: só as chaves enviadas são escritas (merge no existente). */
export async function savePlan(
  teamId: string,
  patch: Partial<Omit<CoachingPlan, "team_id">>,
  changedBy = "—"
): Promise<CoachingPlan> {
  const sb = getDatabase();
  const existing = await fetchPlan(teamId);
  const row = {
    ...(existing ?? { coaching: true }),
    ...patch,
    team_id: teamId,
    // carimba a 1ª engajada; preserva a original em saves posteriores
    engaged_at: existing?.engaged_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb.upsert("coaching_plans", row, { onConflict: "team_id", single: 'required' });
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
  const sb = getDatabase();
  const { data, error } = await sb.select("coaching_assessments", { single: 'optional', where: { ["team_id"]: teamId }, columns: "team_id, signals, note" });
  if (error) throw new Error(error.message);
  return (data ?? null) as Assessment | null;
}

export async function saveAssessment(
  teamId: string,
  signals: Record<string, string>,
  note: string | null,
  changedBy = "—"
): Promise<Assessment> {
  const sb = getDatabase();
  const existing = await fetchAssessment(teamId);
  const { data, error } = await sb.upsert("coaching_assessments", { team_id: teamId, signals, note, updated_at: new Date().toISOString() }, { onConflict: "team_id", single: 'required', columns: "team_id, signals, note" });
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
  const sb = getDatabase();
  const { data, error } = await sb.select("coaching_experiments", { orderBy: "created_at", ascending: false, where: { ["team_id"]: teamId }, columns: "*" });
  if (error) throw new Error(error.message);
  return (data ?? []) as Experiment[];
}

export async function saveExperiment(
  exp: Partial<Experiment> & { team_id: string; behavior: string; pillar: string },
  changedBy = "—"
): Promise<Experiment> {
  const sb = getDatabase();
  if (exp.id != null) {
    const { id, team_id: _t, created_at: _c, ...patch } = exp;
    // snapshot ANTES do update para diferenciar campo a campo
    const { data: before } = await sb.select("coaching_experiments", { single: 'optional', where: { ["id"]: id }, columns: "*" });
    const { data, error } = await sb.update("coaching_experiments", patch, { single: 'required', where: { ["id"]: id } });
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
  const { data, error } = await sb.insert("coaching_experiments", {
      team_id: exp.team_id,
      pillar: exp.pillar,
      metric: exp.metric ?? null,
      behavior: exp.behavior,
      hypothesis: exp.hypothesis ?? null,
      outcome: exp.outcome ?? null,
      status: exp.status ?? "active",
    }, { single: 'required' });
  if (error) throw new Error(error.message);
  const created = data as Experiment;
  await recordFieldHistory(exp.team_id, changedBy, [
    { section: "experiment", field: "created", old_value: null, new_value: created.behavior, entity_id: created.id, entity_label: created.behavior },
  ]);
  return created;
}

export async function deleteExperiment(id: number, changedBy = "—"): Promise<void> {
  const sb = getDatabase();
  const { data: before } = await sb.select("coaching_experiments", { single: 'optional', where: { ["id"]: id }, columns: "*" });
  const { error } = await sb.delete("coaching_experiments", { where: { ["id"]: id } });
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
  const sb = getDatabase();
  try {
    const { data, error } = await sb.select("experiment_comments", { orderBy: "created_at", ascending: true, where: { ["team_id"]: teamId }, columns: "*" });
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
  const sb = getDatabase();
  const { data, error } = await sb.insert("experiment_comments", {
      experiment_id: input.experiment_id,
      team_id: input.team_id,
      author: input.author,
      body: input.body,
    }, { single: 'required' });
  if (error) throw new Error(error.message);
  return data as ExperimentComment;
}

export async function deleteComment(id: number): Promise<void> {
  const sb = getDatabase();
  const { error } = await sb.delete("experiment_comments", { where: { ["id"]: id } });
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
  const sb = getDatabase();
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
    const { error } = await sb.insert("coaching_field_history", rows, {  });
    if (error) throw error;
  } catch (e) {
    console.warn("recordFieldHistory:", (e as Error).message);
  }
}

/** Histórico do time, mais recente primeiro. Resiliente a tabela ausente. */
export async function fetchFieldHistory(teamId: string, limit = 200): Promise<FieldHistoryRow[]> {
  const sb = getDatabase();
  try {
    const { data, error } = await sb.select("coaching_field_history", { orderBy: "changed_at", ascending: false, limit: limit, where: { ["team_id"]: teamId }, columns: "*" });
    if (error) throw error;
    return (data ?? []) as FieldHistoryRow[];
  } catch (e) {
    console.warn("fetchFieldHistory:", (e as Error).message);
    return [];
  }
}

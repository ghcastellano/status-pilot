/**
 * lib/cache.ts — cache de perguntas→respostas no Supabase.
 * Mesma pergunta (normalizada) + time → resposta do banco, sem chamar o LLM.
 */
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

export function hashKey(teamId: string, normalizedQuestion: string): string {
  return createHash("sha256").update(`${teamId}|${normalizedQuestion}`).digest("hex");
}

export async function getCachedAnswer(
  teamId: string,
  normalizedQuestion: string
): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("qa_cache")
    .select("answer")
    .eq("question_hash", hashKey(teamId, normalizedQuestion))
    .maybeSingle();
  return data?.answer ?? null;
}

export async function setCachedAnswer(
  teamId: string,
  normalizedQuestion: string,
  answer: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  await sb.from("qa_cache").upsert(
    {
      team_id: teamId,
      question_norm: normalizedQuestion,
      question_hash: hashKey(teamId, normalizedQuestion),
      answer,
    },
    { onConflict: "question_hash" }
  );
}

/**
 * lib/cache.ts — cache de perguntas→respostas no Neon.
 * Mesma pergunta (normalizada) + time → resposta do banco, sem chamar o LLM.
 */
import { createHash } from "node:crypto";
import { getDatabase } from "./db";

export function hashKey(teamId: string, normalizedQuestion: string): string {
  return createHash("sha256").update(`${teamId}|${normalizedQuestion}`).digest("hex");
}

export async function getCachedAnswer(
  teamId: string,
  normalizedQuestion: string
): Promise<string | null> {
  const sb = getDatabase();
  const { data } = await sb.select("qa_cache", { single: 'optional', where: { ["question_hash"]: hashKey(teamId, normalizedQuestion) }, columns: "answer" });
  return data?.answer ?? null;
}

export async function setCachedAnswer(
  teamId: string,
  normalizedQuestion: string,
  answer: string
): Promise<void> {
  const sb = getDatabase();
  await sb.upsert("qa_cache", {
      team_id: teamId,
      question_norm: normalizedQuestion,
      question_hash: hashKey(teamId, normalizedQuestion),
      answer,
    }, { onConflict: "question_hash" });
}

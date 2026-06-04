/**
 * lib/validate.ts — validação e sanitização da entrada do usuário.
 */
export const MAX_QUESTION_LEN = 500;

// regex construídas por string para evitar caracteres literais de controle.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");
const DIACRITICS = new RegExp("[\\u0300-\\u036F]", "g");

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateQuestion(input: unknown): ValidationResult {
  if (typeof input !== "string") return { ok: false, error: "Pergunta inválida." };
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Escreva uma pergunta." };
  if (trimmed.length > MAX_QUESTION_LEN)
    return { ok: false, error: `Pergunta muito longa (máx. ${MAX_QUESTION_LEN} caracteres).` };
  const clean = trimmed.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ");
  return { ok: true, value: clean };
}

/** normaliza a pergunta para a chave de cache (sem acento/caixa/pontuação). */
export function normalizeForCache(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** valida um id de time simples (slug). */
export function isValidTeamId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9_-]{1,40}$/.test(id);
}

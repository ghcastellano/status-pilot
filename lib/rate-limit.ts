/**
 * lib/rate-limit.ts — rate limiting por (IP + sessão), persistido no Supabase.
 * Janela deslizante de 1h, máximo de 10 chamadas ao LLM — protege a chave.
 */
import { getSupabaseAdmin } from "./supabase";

export const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

export async function checkRateLimit(bucketKey: string): Promise<RateResult> {
  const sb = getSupabaseAdmin();
  const now = Date.now();

  const { data } = await sb
    .from("rate_limits")
    .select("count, window_start")
    .eq("bucket_key", bucketKey)
    .maybeSingle();

  if (!data) {
    await sb.from("rate_limits").insert({
      bucket_key: bucketKey,
      count: 1,
      window_start: new Date(now).toISOString(),
    });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  const windowStart = new Date(data.window_start).getTime();
  if (now - windowStart > WINDOW_MS) {
    await sb
      .from("rate_limits")
      .update({ count: 1, window_start: new Date(now).toISOString() })
      .eq("bucket_key", bucketKey);
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (data.count >= RATE_LIMIT) return { allowed: false, remaining: 0 };

  await sb.from("rate_limits").update({ count: data.count + 1 }).eq("bucket_key", bucketKey);
  return { allowed: true, remaining: RATE_LIMIT - 1 - data.count };
}

/** deriva o bucket a partir do request (IP do header + sessão do client). */
export function bucketFrom(ip: string | null, sessionId: string | null): string {
  return `${ip ?? "noip"}:${(sessionId ?? "nosession").slice(0, 64)}`;
}

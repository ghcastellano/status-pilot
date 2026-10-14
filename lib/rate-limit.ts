import { getSupabaseAdmin } from "./supabase";
export const RATE_LIMIT = 10;
export interface RateResult { allowed: boolean; remaining: number }
/** Atomic per-user quota AND shared workspace budget, owned by the server. DB failures deny calls. */
export async function checkRateLimit(userId: string): Promise<RateResult> {
  const {data,error}=await getSupabaseAdmin().rpc("consume_ai_budget",{p_actor:userId});
  if(error || !data || typeof data.allowed!=="boolean" || typeof data.remaining!=="number") throw new Error("AI quota unavailable");
  return data;
}

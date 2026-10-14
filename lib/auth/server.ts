import { createNeonAuth } from '@neondatabase/auth/next/server';
import { allowedIdentity, type VerifiedIdentity } from './policy';
export function authConfigured() {
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET && process.env.STATUS_PILOT_ALLOWED_EMAILS?.trim());
}
let cached: ReturnType<typeof createNeonAuth> | undefined;
export function sessionClient() {
  if (!authConfigured()) throw new Error('Workspace authentication is not configured');
  return cached ??= createNeonAuth({baseUrl:process.env.NEON_AUTH_BASE_URL!,cookies:{secret:process.env.NEON_AUTH_COOKIE_SECRET!,sessionDataTtl:60}});
}
export async function workspaceUser(): Promise<VerifiedIdentity | null> {
  const {data,error} = await sessionClient().getSession({query:{disableCookieCache:"true"}});
  const user=data?.user;
  if(error || !user)return null;
  const identity:VerifiedIdentity={id:user.id,email:user.email,email_confirmed_at:user.emailVerified?'verified':undefined};
  return allowedIdentity(identity,process.env.STATUS_PILOT_ALLOWED_USER_IDS,process.env.STATUS_PILOT_ALLOWED_EMAILS)?identity:null;
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { allowedIdentity } from './policy';

export function authConfigured() {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) &&
    (process.env.STATUS_PILOT_ALLOWED_USER_IDS?.trim() || process.env.STATUS_PILOT_ALLOWED_EMAILS?.trim()));
}
export async function sessionClient() {
  if (!authConfigured()) throw new Error('Workspace authentication is not configured');
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!,
    (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!, {
      cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' },
      cookies: { getAll: () => jar.getAll(), setAll: values => { for (const {name,value,options} of values) jar.set(name,value,options); } },
    });
}
export async function workspaceUser() {
  const client = await sessionClient();
  // getUser verifies the token against Supabase Auth; never trust the cookie payload alone.
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !allowedIdentity(user, process.env.STATUS_PILOT_ALLOWED_USER_IDS, process.env.STATUS_PILOT_ALLOWED_EMAILS)) return null;
  return user;
}

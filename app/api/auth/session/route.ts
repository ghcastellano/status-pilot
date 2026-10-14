import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, sessionClient, workspaceUser } from '@/lib/auth/server';
import { allowedIdentity, sameOrigin } from '@/lib/auth/policy';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, {status, headers:{'Cache-Control':'no-store'}});
export async function GET() {
  if (!authConfigured()) return reply({ user:null, configured:false });
  try { const user = await workspaceUser(); return reply({user:user ? {id:user.id,email:user.email} : null, configured:true}); }
  catch { return reply({error:'Unable to verify session.'},503); }
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return reply({error:'Request origin is not allowed.'},403);
  if (!authConfigured()) return reply({error:'Connected workspace is not configured.'},503);
  let body;
  try { body = await req.json(); } catch { return reply({error:'Invalid request.'},400); }
  if (typeof body?.email !== 'string' || body.email.length > 254 || typeof body.password !== 'string' || body.password.length > 1024 || !body.password) return reply({error:'Enter your email and password.'},400);
  try {
    const client = await sessionClient();
    const {data,error} = await client.auth.signInWithPassword({email:body.email.trim(),password:body.password});
    if (error || !allowedIdentity(data.user,process.env.STATUS_PILOT_ALLOWED_USER_IDS,process.env.STATUS_PILOT_ALLOWED_EMAILS)) {
      await client.auth.signOut({scope:'local'});
      return reply({error:'Unable to sign in with this account.'},401);
    }
    return reply({ok:true});
  } catch { return reply({error:'Sign-in is temporarily unavailable.'},503); }
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return reply({error:'Request origin is not allowed.'},403);
  if (!authConfigured()) return reply({ok:true});
  try { const client=await sessionClient(); const {error}=await client.auth.signOut({scope:'local'}); return error ? reply({error:'Unable to sign out.'},503) : reply({ok:true}); }
  catch { return reply({error:'Unable to sign out.'},503); }
}

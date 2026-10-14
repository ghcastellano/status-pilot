import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, sessionClient, workspaceUser } from '@/lib/auth/server';
import { allowedLoginEmail, sameOrigin } from '@/lib/auth/policy';
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
  if (typeof body?.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return reply({error:'Enter a valid email address.'},400);
  const email = body.email.trim().toLowerCase();
  if (!['request-code','verify-code'].includes(body.action)) return reply({error:'Invalid request.'},400);
  // Do not send codes to arbitrary recipients. Neon enforces OTP expiry, attempt limits and rate limits.
  if (!allowedLoginEmail(email,process.env.STATUS_PILOT_ALLOWED_EMAILS)) return body.action === 'request-code' ? reply({ok:true}) : reply({error:'Unable to sign in with this account.'},401);
  try {
    const auth = sessionClient();
    if (body.action === 'request-code') {
      const {error} = await auth.emailOtp.sendVerificationOtp({email,type:'sign-in'});
      return error ? reply({error:'Unable to send a sign-in code. Please try again later.'},429) : reply({ok:true});
    }
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return reply({error:'Enter the six-digit code.'},400);
    const {error} = await auth.signIn.emailOtp({email,otp:body.code});
    if (error || !await workspaceUser()) {
      await auth.signOut();
      return reply({error:'Unable to verify this sign-in code.'},401);
    }
    return reply({ok:true});
  } catch { return reply({error:'Sign-in is temporarily unavailable.'},503); }
}
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return reply({error:'Request origin is not allowed.'},403);
  if (!authConfigured()) return reply({ok:true});
  try { const {error}=await sessionClient().signOut(); return error ? reply({error:'Unable to sign out.'},503) : reply({ok:true}); }
  catch { return reply({error:'Unable to sign out.'},503); }
}

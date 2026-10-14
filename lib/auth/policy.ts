export interface VerifiedIdentity { id: string; email?: string; email_confirmed_at?: string }
/** This installation is one workspace. Only explicitly allowed identities may access it. */
export function allowedIdentity(user: VerifiedIdentity | null, ids: string | undefined, emails?: string): boolean {
  if (!user) return false;
  const allowedIds = new Set((ids ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const allowedEmails = new Set((emails ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  return allowedIds.has(user.id) || Boolean(user.email_confirmed_at && user.email && allowedEmails.has(user.email.toLowerCase()));
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

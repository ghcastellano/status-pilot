import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { authConfigured, workspaceUser } from './server';
import { sameOrigin } from './policy';
import { DEMO_COOKIE, DEMO_VERSION, isDemoOnly } from '../demo/session';
import { respondToDemo } from '../demo/data';

const json = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
export function withWorkspaceAuth(handler: (req: NextRequest, user: User) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    // Defense in depth: demo isolation also holds when middleware is bypassed.
    if (isDemoOnly() || req.cookies.get(DEMO_COOKIE)?.value === DEMO_VERSION) {
      let body = {};
      if (req.method === 'POST' && ['/api/ask', '/api/report', '/api/insights'].includes(req.nextUrl.pathname)) {
        try { body = await req.json(); } catch { return json('Invalid request.', 400); }
      }
      const result = respondToDemo(req.method, req.nextUrl.pathname, req.nextUrl.searchParams, body);
      return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
    }
    if (!['GET','HEAD'].includes(req.method) && !sameOrigin(req)) return json('Request origin is not allowed.', 403);
    if (!authConfigured()) return json('Connected workspace is unavailable. Use the sample workspace.', 503);
    try {
      const user = await workspaceUser();
      if (!user) return json('Sign in with an authorized workspace account.', 401);
      const response = await handler(req, user);
      if (response.status >= 500) {
        console.error(JSON.stringify({event:'workspace_request_failed', path:req.nextUrl.pathname, status:response.status}));
        return json('Unable to complete the request. Please try again.', response.status);
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch {
      console.error(JSON.stringify({event:'workspace_request_failed', path:req.nextUrl.pathname}));
      return json('Unable to complete the request. Please try again.', 500);
    }
  };
}

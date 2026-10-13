import { NextRequest, NextResponse } from "next/server";
import { respondToDemo } from "@/lib/demo/data";
import { DEMO_COOKIE, DEMO_VERSION, isDemoOnly } from "@/lib/demo/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!isDemoOnly() && req.cookies.get(DEMO_COOKIE)?.value !== DEMO_VERSION) {
    return NextResponse.json({ error: "Start the sample workspace first." }, { status: 403, headers });
  }
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const raw = await req.text();
      if (raw.length > 8192) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Expected a JSON object." }, { status: 400, headers });
    }
  }
  const result = respondToDemo(req.method, req.nextUrl.searchParams.get("route") ?? "", req.nextUrl.searchParams, body);
  return NextResponse.json(result.body, { status: result.status, headers });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };

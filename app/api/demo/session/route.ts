import { NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_VERSION, isDemoOnly } from "@/lib/demo/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json({ active: isDemoOnly() || req.cookies.get(DEMO_COOKIE)?.value === DEMO_VERSION }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function changeSession(req: NextRequest, active: boolean) {
  if (!active && isDemoOnly()) {
    return NextResponse.json({ error: "This deployment only provides sample data." }, { status: 403 });
  }
  let origin: URL | null = null;
  try { origin = new URL(req.headers.get("origin") ?? ""); } catch { /* Missing or invalid origin. */ }
  if (!origin || !["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.get("host")) {
    return NextResponse.json({ error: "A same-origin request is required." }, { status: 403 });
  }
  const response = NextResponse.json({ active }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(DEMO_COOKIE, active ? DEMO_VERSION : "", {
    httpOnly: true, sameSite: "lax", secure: origin.protocol === "https:",
    path: "/", maxAge: active ? 86400 : 0,
  });
  return response;
}

export async function POST(req: NextRequest) { return changeSession(req, true); }
export async function DELETE(req: NextRequest) { return changeSession(req, false); }

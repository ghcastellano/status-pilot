import { NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_VERSION, demoDestination, isDemoOnly } from "@/lib/demo/session";

export function middleware(req: NextRequest) {
  const destination = demoDestination(req.nextUrl.pathname, isDemoOnly() ? DEMO_VERSION : req.cookies.get(DEMO_COOKIE)?.value);
  if (!destination) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = destination;
  // Overwrite caller-supplied values. All API requests in demo stay isolated,
  // including unknown routes and writes; the responder uses an allowlist.
  url.searchParams.set("route", req.nextUrl.pathname);
  return NextResponse.rewrite(url);
}

export const config = { matcher: "/api/:path*" };

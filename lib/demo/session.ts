/** A demo cookie selects fixtures; it is not an authentication credential. */
export const DEMO_COOKIE = "status-pilot-demo";
export const DEMO_VERSION = "v1";
export const DEMO_SESSION_PATH = "/api/demo/session";
export const DEMO_DATA_PATH = "/api/demo/data";

/** A public portfolio deployment can disable every live-service route. */
export function isDemoOnly(): boolean { return process.env.STATUS_PILOT_DEMO_ONLY === "1"; }

export function demoDestination(pathname: string, cookie?: string): string | null {
  if (cookie !== DEMO_VERSION || !pathname.startsWith("/api/")) return null;
  if (pathname === DEMO_SESSION_PATH || pathname === DEMO_DATA_PATH) return null;
  return DEMO_DATA_PATH;
}

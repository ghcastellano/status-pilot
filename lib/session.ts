/** id de sessão estável no client (para rate limit por sessão). */
export function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const KEY = "status-pilot:session";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

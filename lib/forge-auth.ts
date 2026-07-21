/**
 * lib/forge-auth.ts — porta de entrada do Forge Remote no backend (Vercel).
 *
 * MECANISMO (verificado 3-0 na pesquisa; ver docs/FORGE.md):
 * um app Forge instalado pelo ADMIN do site chama a Jira como o PRÓPRIO app
 * (`asApp`), com os scopes que o admin consentiu na instalação — NÃO como um
 * usuário via OAuth 3LO. Por isso funciona em instância corporativa que bloqueia
 * "user apps" (ex.: Indeed), onde o nosso 3LO batia em 401 "scope does not match".
 *
 * Fluxo de uma invocação (scheduledTrigger ou page do app Forge):
 *   Jira Cloud → app Forge fino → Forge Remote → ESTE endpoint no Vercel, com:
 *     • Authorization: Bearer <FIT>   (Forge Invocation Token — JWT assinado pela
 *       Atlassian; PROVA que a chamada veio do Forge e traz o contexto: cloudId,
 *       installationId, apiBaseUrl).
 *     • x-forge-oauth-system: <token asApp>  (Bearer curto, TTL ~4h, renovável;
 *       usado p/ chamar api.atlassian.com/ex/jira/{cloudId}/rest/...).
 *
 * Este módulo NÃO guarda token nenhum (regra do Marketplace): valida o FIT por
 * request e usa o token asApp que a Atlassian injeta, só naquela invocação.
 *
 * Docs: https://developer.atlassian.com/platform/forge/remote/
 *       https://developer.atlassian.com/platform/forge/remote/invocation-token/
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * JWKS público do Forge — chaves com que a Atlassian assina o FIT. Endpoint
 * de produção; confirme com a doc "Verifying the Forge Invocation Token" caso
 * a Atlassian rotacione a URL. Cacheado em memória pelo `jose` (respeita TTL).
 */
const FORGE_JWKS_URL =
  process.env.FORGE_JWKS_URL ||
  "https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json";

const jwks = createRemoteJWKSet(new URL(FORGE_JWKS_URL));

/** Contexto extraído e VALIDADO de uma invocação Forge Remote. */
export interface ForgeContext {
  /** cloudId da instância (tenant) que disparou a invocação. */
  cloudId: string;
  /** base de API já pronta p/ asApp: https://api.atlassian.com/ex/jira/{cloudId} */
  apiBaseUrl: string;
  /** id da instalação (chave do tenant p/ multi-tenant no banco). */
  installationId: string | null;
  /** token asApp (Bearer) injetado no header x-forge-oauth-system. */
  systemToken: string;
  /** payload completo do FIT (auditoria/debug). */
  claims: JWTPayload;
}

class ForgeAuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
    this.name = "ForgeAuthError";
  }
}
export { ForgeAuthError };

/** Lê um claim aninhado de forma defensiva (o shape do FIT tem variado entre versões). */
function pick(obj: any, ...paths: string[][]): string | null {
  for (const path of paths) {
    let cur = obj;
    for (const k of path) cur = cur?.[k];
    if (typeof cur === "string" && cur) return cur;
  }
  return null;
}

/**
 * Valida a invocação Forge Remote a partir dos headers da request e devolve o
 * contexto (cloudId + token asApp). Lança `ForgeAuthError` (401/403) se o FIT
 * for inválido, expirado, de outra audience, ou se faltar o token do sistema.
 *
 * @param headers  headers da Request (Next: `req.headers`)
 * @param audience baseUrl do nosso backend registrado como remote no manifest
 *                 (env FORGE_REMOTE_AUDIENCE) — o `aud` do FIT precisa casar.
 */
export async function verifyForgeRequest(
  headers: Headers,
  audience = process.env.FORGE_REMOTE_AUDIENCE
): Promise<ForgeContext> {
  const authz = headers.get("authorization") || "";
  const fit = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  if (!fit) throw new ForgeAuthError("FIT ausente (header Authorization: Bearer).");

  let claims: JWTPayload;
  try {
    const verified = await jwtVerify(fit, jwks, {
      // `aud` só é checado se FORGE_REMOTE_AUDIENCE estiver definido — em dev/spike
      // pode-se omitir; em produção DEFINA para impedir replay de FIT de outro app.
      ...(audience ? { audience } : {}),
    });
    claims = verified.payload;
  } catch (e) {
    throw new ForgeAuthError(`FIT inválido: ${(e as Error).message}`);
  }

  // token asApp injetado pelo Forge Remote. Sem ele não há como chamar a Jira.
  const systemToken = headers.get("x-forge-oauth-system")?.trim();
  if (!systemToken)
    throw new ForgeAuthError(
      "Token asApp ausente (x-forge-oauth-system) — habilite appSystemToken no remote do manifest.",
      403
    );

  // cloudId / apiBaseUrl podem vir em locais diferentes do FIT conforme a versão.
  const cloudId =
    pick(claims, ["context", "cloudId"], ["app", "cloudId"], ["cloudId"]) ??
    // fallback: extrai do apiBaseUrl (.../ex/jira/{cloudId})
    (pick(claims, ["app", "apiBaseUrl"])?.match(/\/ex\/jira\/([^/]+)/)?.[1] ?? null);
  if (!cloudId) throw new ForgeAuthError("cloudId não encontrado no FIT.");

  const apiBaseUrl =
    pick(claims, ["app", "apiBaseUrl"]) || `https://api.atlassian.com/ex/jira/${cloudId}`;
  const installationId = pick(claims, ["app", "installationId"], ["context", "installationId"]);

  return { cloudId, apiBaseUrl, installationId, systemToken, claims };
}

import api, { route } from "@forge/api";

/**
 * Web-trigger de PROVA do asApp. Chama a Jira como o PRÓPRIO app (asApp) e
 * devolve o /myself. Se o `whoami` for a identidade do APP (accountType "app",
 * não "atlassian"/seu usuário), fica provado que a chamada veio do Forge e não
 * do token Basic — que é a pergunta "como sei que veio do Forge?".
 *
 * On-demand: `forge webtrigger` dá uma URL; um GET nela dispara isto.
 */
export async function proof() {
  try {
    const res = await api.asApp().requestJira(route`/rest/api/3/myself`);
    const me = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": ["application/json"] },
      body: JSON.stringify({
        ok: true,
        via: "forge-asApp",
        whoami: {
          accountId: me.accountId,
          displayName: me.displayName,
          accountType: me.accountType, // "app" = identidade do app (prova)
          emailAddress: me.emailAddress ?? null,
        },
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": ["application/json"] },
      body: JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }),
    };
  }
}

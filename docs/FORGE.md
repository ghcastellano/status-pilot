# Status Pilot no Jira — Forge + Forge Remote (asApp)

Estratégia para sair do modo PoC (Basic auth) e virar um produto **instalável em
qualquer empresa via Marketplace**, como Nave e ActionableAgile. Este documento é
a referência da **Fase 1 (spike)** — o scaffold já está no repo.

## Por que Forge (e não OAuth 3LO nem Connect)

- **OAuth 3LO** (o que a PoC tentou primeiro) é autorizado pelo _usuário_. Instância
  corporativa (ex.: Indeed) liga o switch **"Block user apps"** → 3LO na Agile API
  responde `401 "scope does not match"`. Sem saída por esse caminho.
- **Apps de Marketplace** são instalados pelo **admin do site**. A chamada à Jira
  roda como o **próprio app** (`asApp`), com os scopes que o admin consentiu na
  instalação — não como um usuário. É por isso que Nave/ActionableAgile funcionam
  onde o nosso 3LO batia. _(mecanismo verificado 3-0 na pesquisa — ver histórico.)_
- **Connect está morto para app novo**: desde 17/set/2025 todo app novo no
  Marketplace TEM que ser Forge; Connect sai de suporte no Q4/2026. Logo: **Forge**.
- **Forge Remote** deixa o backend continuar **externo** (Vercel/Supabase) — só
  exige declarar o egress no manifest. É o padrão em produção da ActionableAgile
  (55 Degrees migrou Connect→Forge Remote em set/2025 mantendo backend próprio).

## Arquitetura-alvo

```
Jira Cloud (admin instala o app)
   │  scheduledTrigger (1h)  +  globalPage
   ▼
App Forge FINO  (forge-app/manifest.yml)  ── sem lógica; só encaminha
   │  Forge Remote → injeta:
   │   • Authorization: Bearer <FIT>        (JWT da Atlassian: cloudId, installationId)
   │   • x-forge-oauth-system: <asApp>      (Bearer curto, TTL ~4h, renovável)
   ▼
Vercel  POST /api/forge/sync   (app/api/forge/sync/route.ts)
   │  1. verifyForgeRequest()  → valida FIT (JWKS) + extrai contexto  (lib/forge-auth.ts)
   │  2. new ForgeProvider({apiBaseUrl, systemToken})                 (lib/jira.ts)
   │  3. syncIssuesFromJira(teamId, provider)  ← MESMA ingestão de sempre
   ▼
api.atlassian.com/ex/jira/{cloudId}/rest/...   (asApp — passa onde 3LO era bloqueado)
   ▼
Supabase  (issues/sprints/metrics_history)  →  dashboard lê do banco
```

**O que reusamos sem mudar 1 linha:** `JiraBase` (os 11 métodos), `ingestBoard`
(board JQL, changelog, Velocity Chart), métricas, maturidade, histórico, i18n,
insights. O `ForgeProvider` só troca **como** `getBase()` resolve base+auth.

## Peças no repo (Fase 1)

| Arquivo | Papel |
|---|---|
| `lib/forge-auth.ts` | Valida o FIT (jose/JWKS), extrai `cloudId` + token asApp. **Não guarda token.** |
| `lib/jira.ts` → `ForgeProvider` | Provider asApp: base `…/ex/jira/{cloudId}`, `Bearer <asApp>`. |
| `lib/sync.ts` | `syncIssuesFromJira(teamId?, provider?)` — aceita o provider Forge injetado. |
| `app/api/forge/sync/route.ts` | Endpoint do Forge Remote: valida → provider → ingestão. |
| `forge-app/manifest.yml` | App Forge fino: scopes, egress, remote (asApp), trigger, page. |

## Variáveis de ambiente (Vercel)

| Var | Uso |
|---|---|
| `FORGE_ALLOWED_CLOUD_ID` | Trusted Jira cloud UUID; requests from other tenants are rejected. |
| `FORGE_ALLOWED_INSTALLATION_ID` | Trusted Forge installation ARI. |
| `FORGE_REMOTE_AUDIENCE` | Forge app ARI (`ari:cloud:ecosystem::app/...`). The verified FIT audience must match; this is not the backend URL. |
| `FORGE_JWKS_URL` | (opcional) sobrescreve o JWKS do Forge se a Atlassian rotacionar a URL. |

## Rodando o spike (na sua máquina + seu próprio site Atlassian)

> Nada disso toca a Indeed. Instala no **seu** site dev — é o caminho grátis, sem
> review de Marketplace. Só faça quando tiver o Jira permitido (Sootech) ou um
> site dev Atlassian gratuito.

```bash
npm i -g @forge/cli          # CLI do Forge
forge login                  # token de API do SEU site
cd forge-app
forge register               # gera o app.id no manifest (seu)
forge deploy                 # sobe o app fino
forge install                # instala no seu site (concede os scopes asApp)
```

Depois, dispare o endpoint (o trigger roda de hora em hora; p/ testar já):
- abra a **page** do app no Jira, ou
- use `forge tunnel` e force o trigger, ou
- valide o backend isolado apontando `FORGE_REMOTE_AUDIENCE` e mandando um FIT real.

**Prova de sucesso:** `POST /api/forge/sync` retorna `{ ok: true, cloudId, whoami }`
com o `whoami` do app (não um 401) — ou seja, o asApp leu a Agile API. Os times do
tenant aparecem sincronizados no dashboard, calculados dos dados reais.

## Fases seguintes (fora do spike)

- **Fase 2 — multi-tenant real:** coluna `forge_cloud_id` em `teams`; lifecycle
  `installed/uninstalled` (limpar dados no uninstall); page lista os boards do
  tenant. Filtrar o sync por `forge_cloud_id = ctx.cloudId`.
- **Fase 3 — Marketplace:** security questionnaire, KYC/KYB, privacy tab, política
  de privacidade, página de suporte. Review ~10–15 dias úteis. Revenue share Forge
  100% até US$ 1M lifetime.
- **Fase 4 — enterprise:** Cloud Fortified / SOC 2 quando houver tração.

## Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Schema do Forge Remote muda | `forge lint` é a autoridade; manifest anotado com as docs. |
| Egress declarado → sem selo "Runs on Atlassian" | Nave/AA também não têm; buscar Cloud Fortified depois, ou minimizar dado persistido (postura AA: agregar sem guardar issue crua). |
| Token asApp só existe na invocação | Sync agendado (trigger 1h); TTL ~4h renovável. Modelo banco-first já suporta. |
| Data residency corporativa | Supabase em região dedicada; minimizar persistência. |

## Fontes (verificadas 3-0)

- Forge `asApp`/requestJira — developer.atlassian.com/platform/forge/apis-reference/…/product.requestjira
- Block user apps / consentimento 3LO — support.atlassian.com + community.atlassian.com
- Connect EOL / obrigatoriedade Forge — atlassian.com/blog/…/connect-end-of-support
- Forge Remote + backend externo (55 Degrees/ActionableAgile) — 55degrees.se + developer.atlassian.com/platform/forge/remote/

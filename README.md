# Status Pilot

Ferramenta de demonstração que lê dados de um **Jira real** (via REST API),
sincroniza para um banco (Supabase) e mostra **métricas de fluxo dual-track** +
um assistente que responde em linguagem natural e gera **status reports** com IA.

Empresa fictícia: **Café Lavra**. Dois times:
- **Espresso** (Scrum) — projeto Jira `LS`
- **Cold Brew** (Kanban) — projeto Jira `LK`

## Arquitetura

```
Jira Cloud (workflows + issues, tudo criado via API)
      │  REST API v3 / Agile API
      ▼
 sync-jira-to-supabase  →  Supabase (Postgres)
      │
      ▼
 Status Pilot (Next.js)  →  métricas + IA (GPT-4o)
```

> **Nota honesta (build-in-public):** um Jira criado hoje não tem histórico de
> transições — o `created` e o changelog são read-only na API e **não podem ser
> backdatados**. Por isso a *timeline de cada estágio é sintética*: cada marco é
> gravado em **campos de data reais do Jira** (filtráveis por JQL) + um bloco
> `SPMETA` recolhível, e o sync lê de volta da API. A timeline cobre ~8 semanas
> com **variação temporal realista** (ex.: gargalo emergente em Code Review →
> cycle time sobe, throughput cai) para que os gráficos de tendência e o insight
> da IA façam sentido. As issues, board, colunas, sprints e épicos são **reais e
> criados via API**; só a linha do tempo é sintética (rotulada na UI). O mesmo
> código passaria a calcular cycle times reais com semanas de uso de verdade.

## Stack
- **Next.js 14** (App Router) — frontend + API routes serverless
- **Tailwind + shadcn/ui + Recharts** — UI e gráficos
- **Supabase (Postgres)** — banco
- **OpenAI GPT-4o** — chave **só no backend**
- **Jira Cloud REST API** — integração

## Fluxo dual-track (10 estágios)
| Scrum (LS) | Kanban (LK) |
|---|---|
| Opportunity Backlog | Opportunity Backlog |
| Discovery in Progress | Discovery in Progress |
| Ready for Refinement | Prototype & Test |
| Refining / Slicing | Validated / Ready for Refinement |
| Product Backlog (Ready for Sprint) | Backlog Refinement |
| Sprint Backlog | Ready for Dev |
| In Development | In Progress |
| Code Review / QA | Code Review / QA |
| Ready for Release | Ready for Release |
| Live / Done | Live / Done |

Métricas: **Discovery / Delivery / Release Cycle Time**, **Lead Time**,
**Time in Review**, **Flow Efficiency**, **Throughput**, **WIP**, e para Scrum
**Velocity**, **Say-Do ratio** e **Burndown**.

## Variáveis de ambiente (`.env.local`)
Copie `.env.example` para `.env.local` e preencha:
```
OPENAI_API_KEY=...
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...            # só backend
SUPABASE_DB_URL=postgresql://...:5432/postgres   # pooler de sessão (p/ DDL)
JIRA_BASE_URL=https://<seu>.atlassian.net
JIRA_EMAIL=...
JIRA_API_TOKEN=...
JIRA_PROJECT_KEY_SCRUM=LS
JIRA_PROJECT_KEY_KANBAN=LK
```
> `.env.local` é **gitignored**. Nunca comite segredos. `.env.example` só tem placeholders.

## Pipeline de dados (one-off, via API)
```bash
npm install
npx tsx scripts/check-connections.ts      # testa Jira + Supabase
npx tsx scripts/setup-jira-workflows.ts    # cria status + workflows + schemes
npx tsx scripts/setup-jira-boards.ts       # mapeia colunas dos boards
npx tsx scripts/populate-jira.ts           # cria épicos + issues
npx tsx scripts/setup-jira-sprints.ts      # cria sprints e distribui
npx tsx scripts/apply-schema.ts            # cria tabelas no Supabase
npx tsx scripts/sync-jira-to-supabase.ts   # Jira → Supabase
```
Utilitários: `reset-jira.ts` / `cleanup-jira.ts` (limpeza), `clean-descriptions.ts`
(descrições limpas), `probe-jira.ts` (sondagem de capacidades).

## Rodar local
```bash
npm run dev        # http://localhost:3000
```

## Deploy (Vercel)
1. Push para o GitHub.
2. Importar no Vercel (detecta Next.js).
3. Adicionar as env vars (use `printf`, não `echo`, ao colar valores).
4. Deploy — um único projeto serve UI + API.

## Segurança
- Chaves (OpenAI/Supabase/Jira) **apenas** em env vars no backend; nenhuma
  `NEXT_PUBLIC_`, nenhum componente client importa libs de servidor.
- **Rate limit** de 10 chamadas ao LLM por sessão/IP (tabela `rate_limits`).
- **Cache** de respostas (tabela `qa_cache`) — mesma pergunta não chama o LLM.
- Entrada **validada e sanitizada**; acesso ao banco parametrizado (sem SQL cru).
- Dados 100% fictícios.

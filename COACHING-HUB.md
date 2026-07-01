# Coaching Hub — Maturidade Dual Scrum/Kanban no Status Pilot

> **Status:** spec definitiva de design + implementação. Todos os thresholds estão
> marcados **`a calibrar`**. As decisões de design abaixo estão **TRAVADAS** — esta
> spec não as re-litiga; ela descreve como construí-las.
>
> **Fonte única de verdade:** a lógica de maturidade (tier + pilares) vive em lib pura
> (`lib/maturity.ts`), consumida por API, UI e pelo script de replay. Nunca duplicar.

---

## 1. Visão geral + modelo de maturidade dual

### 1.1 O que é

O **Coaching Hub** é uma feature de portfólio que classifica cada time em um de **3 tiers
de maturidade metálicos** — **Silver (1)**, **Gold (2)**, **Platinum (3)** — usando o
modelo **weakest-link**: o tier do time é o **`min()`** dos tiers de cada métrica do seu
método. Um time só sobe de tier quando a sua métrica mais fraca sobe.

A classificação tem duas dimensões complementares:

- **Pilares quantitativos** (métricas de fluxo, calculadas de `computeTeamMetrics`):
  decidem o tier via `min()`.
- **Pilar de Ownership comportamental** (sinais qualitativos, marcados à mão pelo coach):
  **não** entra no `min()` quantitativo — alimenta a prontidão de graduação (`behavioralReadiness`)
  e o suporte recomendado. Compartilhado entre Scrum e Kanban, idêntico.

O switch que decide **qual conjunto de métricas** se aplica é `team.board_type`
(`'scrum' | 'kanban'`), já presente em `teams.board_type` e em todo `m.team.board_type`.

### 1.2 Estrutura de 3 pilares (compartilhada)

| Pilar | Scrum | Kanban | Natureza |
|---|---|---|---|
| **Predictability / Flow** | Sprint Predictability (velocity CV) + Cycle Time p85/p50 | Cycle Time p85/p50 + Throughput stability | quant → entra no `min()` |
| **Flow & Quality** | Flow Efficiency + Rework rate | Flow Efficiency + WIP/Aging health | quant → entra no `min()` |
| **Ownership** | Sinais comportamentais (behavioralReadiness) | Sinais comportamentais (behavioralReadiness) | qualitativo → **NÃO** entra no `min()` |

> O Say-Do ratio (Scrum) é **CONTEXTO**, renderizado como chip separado, banda saudável
> 85–110%. **Nunca** entra em `parts` / `min()`.

### 1.3 Tabela de métricas e thresholds TRAVADOS (todos `a calibrar`)

Direção: **HB** = higher-is-better, **LB** = lower-is-better.

#### Scrum (4 drivers de tier)

| # | Métrica | Pilar | Dir | Platinum (3) | Gold (2) | Silver (1) | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Sprint Predictability** = velocity CV (stdev/avg, últimas ~6 sprints) | Predictability | LB | `< 0.15` | 0.15–0.30 | `> 0.30` | `a calibrar` |
| 2 | **Cycle Time predictability** = p85/p50 ratio | Flow | LB | `< 2.0` | 2.0–3.0 | `> 3.0` | `a calibrar` |
| 3 | **Flow Efficiency** = active/total | Flow & Quality | HB | `> 40%` | 15–40% | `< 15%` | `a calibrar` |
| 4 | **Rework rate** = % itens com ≥1 transição reversa | Quality | LB | `< 7%` | 7–15% | `> 15%` | `a calibrar` ⚠️ inviável hoje — ver §2 |
| — | **Say-Do ratio** (CONTEXTO, não driver) | — | banda | banda saudável **85–110%** | — | — | `a calibrar` |

#### Kanban (4 drivers de tier, "lean flow")

| # | Métrica | Pilar | Dir | Platinum (3) | Gold (2) | Silver (1) | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Cycle Time predictability** = p85/p50 ratio | Flow | LB | `< 2.0` | 2.0–3.0 | `> 3.0` | `a calibrar` |
| 2 | **Throughput stability** = CV de throughput semanal | Predictability | LB | `< 0.4` | 0.4–0.7 | `> 0.7` | `a calibrar` |
| 3 | **Flow Efficiency** = active/total | Flow & Quality | HB | `> 40%` | 15–40% | `< 15%` | `a calibrar` |
| 4 | **WIP/Aging health** = % itens in-flow mais velhos que SLE p85 | Flow & Quality | LB | `< 10%` | 10–30% | `> 30%` | `a calibrar` |

#### Semântica dos tiers (contrato público, **não muda**)

| Tier | Nível | Nome | Suporte recomendado |
|---|---|---|---|
| Silver | 1 | Maturidade inicial | Scrum Manager **necessário** |
| Gold | 2 | Maturidade condicional | Suporte **condicional** |
| Platinum | 3 | Maturidade plena | Scrum Manager **opcional** |

> Tokens de cor: Silver `#94A3B8`, Gold `#D4AF37`, Platinum `#0EA5B7`. Ver §3.5 + §5 (tema).

---

## 2. Veredito de viabilidade de dados (honesto)

Verdicts da verificação adversarial aplicados métrica-a-métrica. **Calculável JÁ** = derivável
de campos exportados por `computeTeamMetrics` hoje. **Precisa função nova** = inputs existem mas
falta o cálculo. **Inviável** = a estrutura de dados atual não suporta o cálculo → fallback.

| Métrica | Veredito | Detalhe |
|---|---|---|
| **Scrum — Velocity CV** | **Precisa função nova** (PARCIAL) | Operandos `avgVelocity` e `velocityStdev` já existem (`ScrumMetrics`, lib/metrics.ts:211-212). MAS: (a) usam **todas** as closed sprints, não as últimas ~6; (b) ambos sofrem `round1` **antes** de exportar → divisão dos campos públicos perde precisão perto do boundary 0.15. ⇒ **Computar CV do `variance`/`avgVelocity` crus dentro de `computeScrum`** e exportar `velocityCV` como campo de 1ª classe. Apenas **4 closed sprints** no seed (Espresso S-12..S-15) → marcar **low-confidence quando n<6**. Guard `avgVelocity===0 → null`. |
| **Scrum — Cycle Time p85/p50** | **Calculável JÁ** | `flow.deliveryCycleTime.p85 / .median`. Guard `median===0 → null` (percentile retorna 0 em times vazios; evita ÷0/Infinity). Gate por `CtStat.count` mínimo. |
| **Scrum — Flow Efficiency** | **Calculável JÁ** | `flow.flowEfficiency` (0..1). `×100` para os thresholds %. |
| **Scrum — Rework rate** | **❌ INVIÁVEL hoje** (REFUTADO) | `buildStamps` (cafe-aurora.ts:273-291) emite stamps **estritamente forward** (`for i=0..currentIdx`, timestamps crescentes, sem repetição de key). **Nenhum** issue tem transição reversa → rework = **0% para todo time**. A ordem canônica (in_progress→review→ready_release→live) não representa "Code Review→In Development". Todos os consumers de `stages[]` assumem ordem monotônica. ⇒ **Fallback obrigatório, ver §2.1.** |
| **Kanban — Cycle Time p85/p50** | **Calculável JÁ** | Mesmo campo `flow.deliveryCycleTime`, board-type-agnóstico. |
| **Kanban — Throughput CV** | **Precisa função nova** (CONFIRMADO) | `stdev(flow.throughput.series.map(s=>s.count)) / flow.throughput.perWeekAvg`. Semanas com throughput 0 entram na série (count=0) — OK desde que `avg>0`; **guard `avg===0`** espelhando os guards das linhas 238-239. Usar a série de `flow.throughput.series` (consistente com `opts.weeks`). |
| **Kanban — Flow Efficiency** | **Calculável JÁ** | Mesmo `flow.flowEfficiency`. |
| **Kanban — WIP/Aging health** | **Calculável JÁ** (CONFIRMADO) | `aging.points.filter(p => p.ageDays > flow.deliveryCycleTime.p85).length / aging.points.length`. ⚠️ Usar `deliveryCycleTime.p85` como SLE — **NÃO** `aging.p85` (distribuição diferente). Caveat: `ageDays` mede tempo no **stage atual**, não age total desde `started_at` → comparação conservadora (subestima breaches). Se precisão exata importar, computar `(now - started_at)/DAY` para cada in-flow issue. |
| **Replay as-of** | **Precisa função nova** (PARCIAL) | Engine threada um único `now` interno limpo, MAS **não há param `asOf`**; `now=referenceNow(allTeam)` é hardcoded (linha 403). E há **duas representações de tempo** (colunas de milestone E `stages[]`) que precisam ser truncadas **juntas**. Ver §4. |

### 2.1 Rework — fallback concreto para o pilar Quality (Scrum)

O Rework rate **não é calculável** sobre o `stages[]` sintético atual. Decisão TRAVADA por
esta spec — **Opção C imediata + Opção A como evolução**:

- **AGORA (ship-blocking):** o 4º driver de Quality do Scrum passa a ser um **proxy de defeito
  calculável do dado existente**, marcado claramente como substituto:
  - **Bug ratio** = `% issues com type === 'bug'` sobre o conjunto in-flow/closed do time.
  - Direção **LB**. Thresholds `a calibrar` (proposta inicial: Platinum `< 5%`, Silver `> 20%`).
  - Slot na UI: rotulado **"Rework (proxy: bug ratio)"** com tooltip explicando que o rework
    "real" (reabertura/transição reversa) está **bloqueado em changelog ingestion**.
- **EVOLUÇÃO (Opção A, fora do ship inicial):** ler o **Jira changelog** no sync e persistir
  `issues.rework_count integer` / `issues.reopened boolean` (transições de status onde
  `rank(destino) < rank(origem)`, ou entradas múltiplas num stage Done/QA). Então
  `reworkRate = % rework_count >= 1`. Quando esse campo existir, trocar o proxy pelo real
  **sem mudar a UI** (mesmo slot, mesma direção LB).
- **NÃO** plantar regressões sintéticas no `buildStamps` (Opção B) no ship inicial: muda a
  semântica monotônica assumida por `flowEfficiency`/`computeCFD`/`computeAging`/`byStage` —
  risco alto por ganho de demo apenas.

> Em `lib/maturity.ts` o conjunto Scrum de `parts` usa, hoje, **`bugRatio`** como 4º tier.
> A interface `MaturityInput` já carrega um campo opcional `reworkRatePct` para o futuro real,
> mas o seletor de método empurra `bugRatio` enquanto `reworkRatePct` for `undefined`.

---

## 3. Mudanças no schema

> ⚠️ **`supabase/schema.sql` é DESTRUTIVO:** todo `npm run db:schema` roda `drop table … cascade`
> + recria. Consequência travada abaixo (§3.4).

### 3.1 Decisão de identidade — `team_id TEXT` (RESOLVIDA)

O Coaching Hub de referência é **INTEGER-keyed** ponta a ponta (`board_id INTEGER`). Status Pilot
não tem id numérico: `teams.id` é **TEXT** (`'espresso'`/`'coldbrew'`), todas as FKs já são
`references teams(id)` TEXT.

**DECISÃO TRAVADA: adotar `team_id TEXT REFERENCES teams(id) ON DELETE CASCADE` como chave única
de coaching.** Consequências, aplicadas em toda a porta:

- Todas as 3 tabelas `coaching_*` e a `metrics_history` usam `team_id TEXT`, não `board_id INTEGER`.
- Routes **dropam** `Number(body.boardId)` — passa a ser `isValidTeamId(teamId)` (slug TEXT).
- `detect-sm` **relaxa** o guard `Number.isInteger&&>0`. Como precisa de um **board id numérico real
  do Jira** (Agile API `/rest/agile/1.0/board/{id}/...`) que `teams` não armazena, adiciona-se um
  **sidecar opcional**: `teams.jira_board_id integer` (nullable). `detect-sm` resolve
  `team_id (TEXT) → jira_board_id (INT)` apenas onde a Agile API exige; se `jira_board_id IS NULL`,
  `detect-sm` retorna **disabled/stub** (200 com `{success:false, error:'no-jira-board-id'}`).
- Sem surrogate numérico não-armazenado (quebraria em qualquer mudança de board).

### 3.2 `metrics_history` (nova — alimenta o portfolio + trends)

```sql
create table metrics_history (
  team_id        text not null references teams(id) on delete cascade,
  week_start     date not null,                 -- Monday-aligned, ancorado em referenceNow
  board_type     text not null check (board_type in ('scrum','kanban')),
  tier           text not null check (tier in ('silver','gold','platinum')),
  maturity_score numeric,                        -- 1..3 (ou score contínuo se calculado)
  pillar_flow    numeric,
  pillar_quality numeric,
  pillar_ownership numeric,
  metrics        jsonb not null default '{}'::jsonb, -- valores crus dos 4 + say-do context
  computed_at    timestamptz not null default now(),
  primary key (team_id, week_start)
);
create index metrics_history_team_idx on metrics_history(team_id, week_start desc);
```

> **`metrics` jsonb guarda os valores crus** dos 4 drivers + say-do. Como **todos os thresholds
> são `a calibrar`**, isto permite **re-derivar tiers após recalibração sem re-rodar o replay**.

### 3.3 Tabelas `coaching_*` (3, adaptadas — `team_id TEXT`, sem `tenant_id`)

```sql
create table coaching_scrum_managers (
  team_id        text primary key references teams(id) on delete cascade,
  team_name      text,
  sm_name        text,
  sm_account_id  text,
  role           text,
  coaching       boolean not null default false,
  coaching_case  jsonb,
  engaged_by     text,
  engaged_at     timestamptz,                    -- COALESCE-stamp na 1ª engajada
  detected_sm    jsonb,                          -- preenchido por detect-sm (parcial)
  detected_at    timestamptz,
  updated_at     timestamptz not null default now()
);

create table coaching_assessments (
  id          bigint generated always as identity primary key,
  team_id     text not null references teams(id) on delete cascade,
  signals     jsonb not null,                    -- 9 sinais comportamentais
  note        text,
  author      text,
  assessed_at timestamptz not null default now()
);
create index coaching_assessments_team_idx on coaching_assessments(team_id, assessed_at desc);

create table coaching_experiments (
  id         bigint generated always as identity primary key,
  team_id    text not null references teams(id) on delete cascade,
  pillar     text,                               -- 'commitment'|'flow'|'ownership' (keys estáveis)
  metric     text,
  behavior   text,
  hypothesis text,
  status     text,
  origin     text,                               -- só INSERT seta; UPDATE não toca
  started_at date,
  target_at  date,
  created_at timestamptz not null default now()
);
create index coaching_experiments_team_idx on coaching_experiments(team_id, created_at desc);
```

> **Drop de `tenant_id`** em todas (single-instance). **Keys de pilar** (`commitment`/`flow`/`ownership`)
> ficam **estáveis** entre métodos — só labels/sinais/templates relabel.

E adicionar à `teams` o sidecar:

```sql
-- na definição de teams:
jira_board_id integer,   -- id numérico real do board Jira p/ Agile API (detect-sm). nullable.
```

### 3.4 O que aplicar (sobrevivência ao `db:schema` destrutivo)

DECISÃO TRAVADA — **Opção (a): adicionar tudo ao `schema.sql` E re-rodar o replay após cada apply.**
Consistente com a convenção idempotente "drop-and-rebuild" do repo.

- `coaching_*` e `metrics_history` ficam **dentro** de `schema.sql` (com seus `drop table if exists … cascade`
  no topo, junto dos existentes).
- `metrics_history` é **wipada** a cada `db:schema` → o **replay (`db:replay`) DEVE rodar depois**.
- **`coaching_*` também são wipadas** a cada `db:schema` → aceitável em ambiente de demo/dev;
  documentar no README que dados humanos de coaching não sobrevivem a `db:schema` (são re-semeáveis
  ou aceita-se reset em dev).
- **NÃO** adicionar limpeza de `metrics_history`/`coaching_*` à invalidação de `qa_cache` em
  `lib/sync.ts` — replay é **desacoplado** do sync; um sync não pode destruir history.

Ordem de comandos: `npm run db:schema` → `npm run db:sync` → `npm run db:replay`.

### 3.5 Tokens de tema (additive, 2 arquivos + badge)

Tailwind v3 (canais HSL crus + `hsl(var())`). **Nunca** alias para `--primary/--accent/--ring`
(todos = teal 167; Platinum `#0EA5B7`≈HSL 188 é o risco real de colisão — escopo só a superfícies
de maturidade).

`app/globals.css` `:root`:
```css
/* Maturity tiers — namespaced, never alias --primary */
--silver: 215 20% 65%;        --silver-foreground: 215 25% 40%;
--gold: 46 65% 52%;           --gold-foreground: 38 75% 32%;
--platinum: 188 87% 38%;      --platinum-foreground: 188 90% 28%;
```
`.dark` (foregrounds mais claros):
```css
--silver: 215 18% 62%;        --silver-foreground: 215 20% 78%;
--gold: 46 70% 58%;           --gold-foreground: 46 80% 70%;
--platinum: 188 80% 50%;      --platinum-foreground: 188 75% 72%;
```
`tailwind.config.ts` (`theme.extend.colors`, após `card`):
```ts
silver:   { DEFAULT: "hsl(var(--silver))",   foreground: "hsl(var(--silver-foreground))" },
gold:     { DEFAULT: "hsl(var(--gold))",     foreground: "hsl(var(--gold-foreground))" },
platinum: { DEFAULT: "hsl(var(--platinum))", foreground: "hsl(var(--platinum-foreground))" },
```
`components/ui/badge.tsx` (após `outline`):
```ts
silver:   "border-transparent bg-silver/15 text-silver-foreground",
gold:     "border-transparent bg-gold/15 text-gold-foreground",
platinum: "border-transparent bg-platinum/15 text-platinum-foreground",
```
> **Hex só em fill/border/ícone; `-foreground` no texto** (Gold/Silver não passam AA sobre branco).
> O lib de maturidade mapeia tier → **classe Tailwind** (`'gold'`, `'platinum'`), nunca hex em TS.

---

## 4. Script de replay do histórico

`scripts/replay-maturity-history.ts` (`npm run db:replay`). Recomputa `computeTeamMetrics` **as-of**
cada uma das últimas ~12 semanas e semeia `metrics_history`.

### 4.1 Pré-requisito de engine (1 linha + 1 campo)

Em `lib/metrics.ts`:
- Adicionar `asOf?: number` a `FilterOptions`.
- Trocar linha 403: `const now = opts.asOf ?? referenceNow(allTeam);`

Isso basta para threadar o cutoff — os downstream (`computeFlow`/`computeAdvanced`/`computeScrum`)
já aceitam `now` explícito. **Mas filtrar só `stages[]` é insuficiente** (verdict): há duas
representações de tempo.

### 4.2 Passo a passo (por time × semana)

1. **Carregar** via `getSupabaseAdmin()`: `teams`, `sprints`, `issues` (backend-only).
2. **Grid de semanas:** ancorar em `referenceNow(allIssues)` (edge do dado sintético, **não**
   wall-clock 2026-06-29). Gerar `[referenceNow − 11w … referenceNow]`, **Monday-aligned**, 12 semanas.
   `week_start` = a segunda-feira de cada janela.
3. Para cada time, para cada cutoff `W` (ms):
   a. **`truncateIssueAsOf(issue, W)`** → clona `IssueRow` e:
      - **`stages`** = `issue.stages.filter(s => Date.parse(s.at) <= W)`. Se vazio, o issue
        **não conta** nessa semana (ainda não existia in-flow).
      - **Anular toda coluna de milestone `> W`**: `committed_at`, `started_at`,
        `review_started_at`, `done_at`, `released_at`, `discovery_*`. (Truncar só `stages` deixa
        `referenceNow` e `intervalStats` puxando dado futuro.)
      - **Re-derivar `current_stage`** do **último stamp sobrevivente** (não copiar do row — o
        `current_stage` vem live do Jira, é futuro).
   b. **Gate de sprints (Scrum):** considerar "closed" só sprints com `end_date <= W` (não o campo
      `state` armazenado — replay não reabre sprints; sprints "closed" no seed podem não ter
      terminado em `W`).
   c. `computeTeamMetrics(team, sprintsAsOf, issuesAsOf, { asOf: W })` → `TeamMetrics`.
   d. `computeMaturity(metrics, team.board_type)` → `{ tier, score, pillars, metrics }`.
   e. Montar row `metrics_history` (`metrics` jsonb = valores crus dos 4 + say-do).
4. **Escrita idempotente** (espelha `lib/sync.ts`): `sb.from('metrics_history').delete().eq('team_id', id)`
   depois **insert em chunks de 200** com checagem de erro por chunk. (Volume é pequeno —
   ~12×2 — mas segue o padrão batched do repo.)
5. **Filtros:** replay roda **unfiltered** (`opts = { asOf }`, sem epic/type/sprint) para que a
   history seja comparável semana-a-semana. A página live pode recomputar filtrado on-demand.

> Sanity-check: `advanced.trends` já produz buckets semanais — usar para validar o output do replay.

---

## 5. Plano arquivo-a-arquivo

Agrupado por camada. `create` = novo; `edit` = existente; `translate` = porta do reference Koa/pg.

### Camada: lib pura (maturidade + métricas)

| Arquivo | Ação | Responsabilidade | Assinaturas-chave |
|---|---|---|---|
| `lib/maturity.ts` | **create** | **SSOT** do modelo dual. Primitivas direcionais + tier tables por método + `computeMaturity` weakest-link. Reusada por API, UI, replay. | `tierHigherBetter(v,{platinumMin,silverBelow}): 1\|2\|3`; `tierLowerBetter(v,{platinumBelow,silverAbove}): 1\|2\|3`; `SCRUM_THRESHOLDS`, `KANBAN_THRESHOLDS`; `computeMaturity(m: TeamMetrics, boardType): { tier; level:1\|2\|3; score; pillars; metrics; sayDoContext? }`; `tierTextClass(tier)`; `tierColorToken(tier): 'silver'\|'gold'\|'platinum'`; `formatMetric(key, v)` (ratio `2.3x` / count `14/wk` / pct `38%`) substituindo o `formatPct%` cego |
| `lib/metrics.ts` | **edit** | Adicionar `velocityCV` (cru, windowed ≤6 closed, `null` se n<3 ou avg=0), helper p85/p50 ratio, `throughputCV` (stdev/avg da série, guard avg=0), `agingBreachPct` (vs `deliveryCycleTime.p85`), `bugRatio` (proxy de rework). Threadar `opts.asOf`. | `referenceNow(issues): number`; `computeTeamMetrics(team, sprints, issues, opts: FilterOptions & {epicNames?})` (+ `asOf`); `computeScrum(...,now)` (exporta `velocityCV`); `canonicalStages(issues)` |

> **Copy-as-is do reference (generalizar `min()` e tier layer; NÃO duplicar):** o esqueleto
> `Math.min(...parts.map(p=>p.tier))` e os 3 blocos de retorno Silver/Gold/Platinum são
> **method-neutral** e ficam **byte-for-byte**. Só o **set de tiers em `parts`** e as strings
> de `characteristics` trocam por método. `behavioralReadiness`, `SIGNAL_KEYS`, `graduationReady`,
> `classifyEngagement`, `supportModelFor`, `summarize`, `levelNameToNumber`, `RECOMMENDATIONS`,
> `MaturityLevel` interface → **copy-as-is**.

### Camada: db / data

| Arquivo | Ação | Responsabilidade | Assinaturas-chave |
|---|---|---|---|
| `lib/supabase.ts` | copy-as-is | `getSupabaseAdmin()` — único entrypoint (service_role, cached, backend-only) | `getSupabaseAdmin(): SupabaseClient` |
| `lib/data.ts` | **edit** | Reader de history | `fetchMetricsHistory(teamId): Promise<MetricsHistoryRow[]>` (`select('*').eq('team_id',id).order('week_start')`) |
| `lib/coaching/db.ts` | **translate** | Porta Supabase das 8 fns de coaching + `getPortfolioHistory`. Drop `tenant_id`. Encoda presence-aware upsert, insert-then-prune, dedup JS. | `getCoachingAssignments()`; `upsertCoachingAssignment(a)` (read-merge presence-aware + `engaged_at` COALESCE); `saveDetectedSm(d)` (parcial); `getLatestAssessments()` (dedup-by-team em JS); `saveAssessment(r)` (insert+prune); `getExperiments()`; `saveExperiment(e)` (id? update : insert); `deleteExperiment(id)`; `getPortfolioHistory(perBoard=30)` |
| `lib/coaching/access.ts` | **create** | Gate server-side de coaching (substitui x-user-email allowlist). Mantém mecanismo gate-no-topo + 403 literal. | `isDbEnabled(): boolean` (env-presence, **não throwa**); `denyCoachingAccess(req): NextResponse \| null` (403 `"Not authorized to access the Coaching Hub."`) |
| `supabase/schema.sql` | **edit** | Append `coaching_*` + `metrics_history` + `teams.jira_board_id`. `team_id TEXT` (decisão §3.1). | ver §3 |
| `scripts/apply-schema.ts` | copy-as-is | aplica schema.sql inteiro (destrutivo) | — |
| `lib/sync.ts` | copy-as-is | referência idempotent write (delete-by-team + chunk 200). **Não** tocar — não adicionar limpeza de history. | — |

### Camada: API routes (`app/api/coaching/**`) — todas `runtime="nodejs"`, `dynamic="force-dynamic"`

| Arquivo | Ação | Verbos | Responsabilidade |
|---|---|---|---|
| `app/api/coaching/portfolio/route.ts` | **create** | GET | `getPortfolioHistory` + `getCoachingAssignments` + `getLatestAssessments` + `getExperiments` em paralelo → `buildPortfolio` + `summarize`. Retorna `{success,dbEnabled,period,boards,summary}`. |
| `app/api/coaching/board-managers/route.ts` | **create** | GET, POST | POST = presence-aware upsert (merge só keys enviadas). |
| `app/api/coaching/detect-sm/route.ts` | **create** | POST | Resolve `team_id → jira_board_id`; se null → stub. Creds de `lib/jira.ts` (não do body). `saveDetectedSm`. |
| `app/api/coaching/assessments/route.ts` | **create** | GET, POST | GET = latest per team (JS dedup). POST = insert-then-prune best-effort. |
| `app/api/coaching/experiments/route.ts` | **create** | GET, POST | GET order `created_at DESC`. POST id? update (não toca origin/board) : insert. |
| `app/api/coaching/experiments/[id]/route.ts` | **create** | DELETE | `delete().eq('id',id)`, retorna `removed` count. |
| `app/api/coaching/maturity/route.ts` | **create** | GET | **Read-only pure-compute** (sem session/rate-limit, como `/api/metrics`). `teamId` query param → `fetchTeamData` → `computeTeamMetrics({})` → `computeMaturity`. Retorna `{ maturity, metrics, team }`. |

> **Convenções (travadas pelas conventions facts):** sem envelope genérico — payload bare;
> erros `{ error: "…" }` pt-BR + status explícito; POST com try/catch em `req.json()` → 400
> `"JSON inválido."`; GET via `req.nextUrl.searchParams.get`; `isValidTeamId` (POST) / presence-check
> (GET); try/catch top-level → 500 `{ error: message }`. **Nenhuma** route de coaching chama LLM →
> **nenhuma** usa rate-limit/`getSessionId`. Cache opcional via `getCachedAnswer/setCachedAnswer`
> (versioned key) se necessário; não cachear vazio. **Envelopes literais do reference preservados:**
> GET DB-off → 200 `{success:true,<empty>,dbEnabled:false}`; write DB-off → 200
> `{success:false,error:'db-disabled',dbEnabled:false}`.

### Camada: client (página + contexto)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `app/coaching/page.tsx` | **create** | `"use client"`. `const { selectedTeam } = useTeam();` — **guard `if (!selectedTeam) return …`** (pode ser null durante load). Fetch `/api/coaching/maturity?teamId=…` + `/api/coaching/portfolio` com `cache:'no-store'`. **Branch por-card** em `board.board_type`. Renderiza portfolio + detalhe. |
| `app/coaching/` | **create** | Pasta de rota; co-loca componentes Coaching-only. |

> Time vem do **TeamProvider/context**, não da URL. Sem `[teamId]` no ship inicial. A página
> herda Sidebar + TeamSelector + TeamProvider do `app/layout.tsx` sem fiação.

### Camada: componentes (porta do reference, branch por `board_type`)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `components/coaching/CoachingHub.tsx` | **create** (porta) | Root + hash-routing (portfolio/leadership/team) + portfolio TeamCard. Branch nos 4 mini-KPIs, `sprintTrend`/`sprintWindow`, caption "últimas N sprints" por `board.board_type`. ProgramHeader/Section/RosterModal/Switch copy-as-is. |
| `components/coaching/CoachingTeamPage.tsx` | **create** (porta) | Detalhe do time. Branch `METRICS` array + painel Maturity + `METRICS_BY_PILLAR` (dropdown de experimento) + caption + gating de charts. |
| `components/coaching/ui.tsx` | **create** (porta) | `PILLARS` (sinais), `PILLAR_LABEL` (keys estáveis), `EXPERIMENT_TEMPLATES` — variantes por método. `LevelChip`/`Segmented`/`TierStrip`/`SignalSegments` copy-as-is. |
| `components/coaching/LeadershipSummary.tsx` | **create** (copy-as-is) | Rollup por `currentLevel`/`status`/`coachingCase`/`focus[0].pillar`. Funciona em portfolio misto. |
| `components/coaching/designTokens.ts` | **create** (copy-as-is) | `LEVEL_NAMES`/`LEVEL_CHIP_CLASS`/`TIER_PANEL`/`STATUS_META`/`READINESS_META`/`RUBRIC`. Method-agnostic. |
| `components/coaching/MaturityBadge.tsx` | **create** (copy-as-is) | Badge metálico por level numérico 1/2/3. |
| `components/coaching/portfolio.ts` | **create** (porta) | `buildPortfolio` + `summarize`. Generalizar `metricsOf`/`hasCompleteQuantMetrics`/`quantLevel` por `board_type`; `metricTrends` → record method-keyed; `recentSprints` gated a Scrum (Kanban usa série semanal de `metrics_history`). Resto (engagement/aggregation) copy-as-is. |

### Camada: charts

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `components/charts-maturity.tsx` | **create** | Charts de maturidade, `"use client"`, reusando toolkit compartilhado (`ACCENT`/`MUTED`/`GRID`/`axis`/`tip`) + novos tokens de tier. Barra tier-colorida (port do padrão `<Cell>` de `AgingScatter` aplicado a `<Bar>`, dirigido por `tierColor(tier)`). Linha de trend (template `BurndownLine`, `number\|null` + `connectNulls` p/ semanas sem dado). |
| `components/charts.tsx` | **edit** | Reuso `CycleScatter` (Kanban cycle scatter c/ ReferenceLine p85/p50), `ThroughputBar` (run chart Kanban), `BurndownLine` (template de trend). Adicionar/importar `tierColor` se estender aqui. |
| `components/charts-advanced.tsx` | **edit** | `AgingScatter` (fonte do `<Cell>`+`ReferenceArea`), `TrendsChart` (dual-axis, alternativa p/ trend de unidades diferentes). |

> **Tokens de tier são net-new** — `zoneColor` (red/amber/green) é semântica de **risco**, não de
> tier; não reusar. `MetricTrendLineChart` do reference fixa Y 0–100 + 3 séries Scrum — Kanban precisa
> séries próprias (cycle ratio ~1–4x, throughput count) **fora** de 0–100.

### Camada: rotas/sidebar

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `components/sidebar.tsx` | **edit** | 2 edits: import `Trophy` (lucide 0.441.0 OK); append `{ href: "/coaching", label: "Coaching", icon: Trophy }` ao `NAV`. **Sem gating** (não existe primitivo). Active = `pathname === "/coaching"` (strict) — suficiente p/ rota única; se adicionar nested depois, trocar p/ prefix-match guardando `"/"`. |

### Camada: tema

(ver §3.5) — `app/globals.css` (edit), `tailwind.config.ts` (edit), `components/ui/badge.tsx` (edit). Additive, não-breaking.

### Camada: i18n / copy

Sem lib i18n no projeto — copy é **pt-BR hardcoded inline**, termos técnicos em inglês. Toda copy
nova (labels de KPI, captions, focus text, templates) segue isso. `focusAreas`/`coachingFocus` (em
`lib/maturity.ts`) geram texto method-aware: Scrum mantém wording de sprint/velocity; Kanban usa
lean-flow (reduzir cauda de cycle-time, estabilizar throughput, subir flow efficiency, limpar WIP
envelhecido). Datas via `toLocaleDateString("pt-BR", …)`.

### Camada: scripts / package.json

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `scripts/replay-maturity-history.ts` | **create** | §4. `npm run db:replay`. |
| `package.json` | **edit** | Adicionar `"db:replay": "tsx scripts/replay-maturity-history.ts"`. |

---

## 6. Cards (portfolio) e tela de detalhe — diferenças por `board_type`

O switch é **por-CARD** (`board.board_type`), nunca um toggle de página: portfolio e leadership
**misturam** Scrum e Kanban nas mesmas listas. Só mini-KPIs / charts / sinais / templates / focus
ramificam; tier-bands / movement-strip / rollups de leadership **agregam across métodos** sem mudança.

### 6.1 Os 4 mini-KPIs

| Slot | Scrum | Kanban |
|---|---|---|
| 1 | **Predictability** — velocity CV (`0.18`, dir LB) | **Cycle p85/p50** (`2.3x`, LB) |
| 2 | **Cycle p85/p50** (`2.3x`, LB) | **Throughput CV** (`0.52`, LB) |
| 3 | **Flow Efficiency** (`38%`, HB) | **Flow Efficiency** (`38%`, HB) |
| 4 | **Rework (proxy: bug ratio)** (`9%`, LB) | **WIP/Aging breach** (`22%`, LB) |
| chip extra | **Say-Do** (contexto, banda 85–110%, `97%`) — chip separado, **não** colorido por tier | — (Kanban não tem Say-Do) |

Cada KPI: cor por `metricTier(key, v, boardType)` + `tierTextClass` + `formatMetric(key, v)`
(per-metric: ratio `x` / count `/wk` / pct `%`). No detalhe, seta de trend `arrowFor(series)`
lê `metricTrends[key]`.

### 6.2 Charts por método (tela de detalhe)

| | Scrum | Kanban |
|---|---|---|
| **Maturity bar** | "Maturidade por sprint" — X = códigos de sprint, tooltip 3 métricas Scrum | "Maturidade por semana" — X = week-of labels, tooltip 4 métricas Kanban (da `metrics_history` replay) |
| **Trend line** | "Métricas por sprint" — séries Predictability/Cycle/Flow (multi-line) | "Métricas por semana" — cycle ratio + throughput + flow efficiency, **eixos/escala próprios** (não 0–100) |
| **Scatter** | (opcional) cycle scatter | **CycleScatter** c/ ReferenceLine p85/p50 |
| **Run chart** | — | **ThroughputBar** + ReferenceLine média ± banda CV |

> Kanban não tem sprints → o spine `recentSprints` (caption, sprintTrend, ambos charts) é
> substituído por **série semanal** de `metrics_history`. Caption Kanban: "últimas N semanas ·
> semana de M/D".

### 6.3 Copy method-aware

- Caption: Scrum "média das últimas N sprints analisadas · M/D–M/D"; Kanban "últimas N semanas · semana de M/D".
- Focus card / leadership "active focus": `coachingFocus` ramifica (§5 i18n).
- Sinais comportamentais: labels relabel por método (§7), keys de pilar estáveis.

---

## 7. Sinais comportamentais + experiment templates

Pilar **Ownership = sinais comportamentais somente** (ambos os métodos), idêntico em estrutura.
9 sinais (`SIGNAL_KEYS`), `behavioralReadiness` copy-as-is. Keys de pilar `commitment`/`flow`/`ownership`
**estáveis** (reusadas como `experiment.pillar`, `METRICS_BY_PILLAR` keys, `focus.pillar`, rollups).

### 7.1 Os 5 sinais compartilhados (mesma label em ambos)

São os sinais cuja semântica é method-neutral — mantêm wording idêntico:

1. **Trabalho é puxado, não empurrado** (pull discipline) — `ownership`
2. **Facilitação rotaciona** (facilitation rotates) — `ownership`
3. **Time levanta riscos cedo** (raises risks early) — `ownership`
4. **Decisões tomadas pelo time** (team-owned decisions) — `ownership`
5. **Melhoria contínua é hábito** (continuous improvement habit) — `flow`

### 7.2 As 4 variantes por método

Os 4 sinais restantes são re-worded por `board_type` (mesmas keys, labels diferentes):

| key | Scrum | Kanban |
|---|---|---|
| `commit_realistic` | "Compromissos de sprint realistas" | "WIP limits respeitados" |
| `scope_churn` | "Scope churn sob controle" | "Cadência de replenishment definida" |
| `ceremonies` | "Cerimônias efetivas" | "Revisão de fluxo cadenciada" |
| `dod_discipline` | "Disciplina de DoD (Done limpo)" | "Política de pull/SLE explícita" |

### 7.3 Experiment templates

`EXPERIMENT_TEMPLATES` + `METRICS_BY_PILLAR` ramificam por método.

**Scrum METRICS_BY_PILLAR:** `commitment:['Sprint Predictability','Say-Do']`,
`flow:['Cycle Time','Flow Efficiency']`, `ownership:['Backlog Readiness','Ceremony ownership']`.

**Kanban METRICS_BY_PILLAR:** `commitment:['Throughput stability']`,
`flow:['Cycle Time','Flow Efficiency','WIP/Aging']`, `ownership:['Pull discipline','Replenishment cadence']`.

Templates Scrum: "planejar para velocity recente (yesterday's weather)", "reforçar DoD p/ reduzir rework".
Templates Kanban: "impor WIP limits", "definir cadência de replenishment", "definir SLE explícito",
"limpar WIP envelhecido (aging > SLE p85)".

---

## 8. Ordem de build + checklist de fidelidade + riscos/gaps

### 8.1 Ordem de build

1. **Tema** — globals.css + tailwind.config.ts + badge.tsx (additive, desbloqueia tier chips).
2. **Engine** — `lib/metrics.ts`: `velocityCV` (cru/windowed), p85/p50, `throughputCV`, `agingBreachPct`,
   `bugRatio`, `opts.asOf`.
3. **SSOT** — `lib/maturity.ts`: primitivas direcionais + thresholds + `computeMaturity`.
4. **Schema** — `supabase/schema.sql` (`team_id TEXT`, `coaching_*`, `metrics_history`, `teams.jira_board_id`).
   `npm run db:schema` → `db:sync`.
5. **Replay** — `scripts/replay-maturity-history.ts` + `db:replay`. Validar contra `advanced.trends`.
6. **DB layer** — `lib/coaching/db.ts` + `lib/data.ts#fetchMetricsHistory` + `lib/coaching/access.ts`.
7. **API** — 7 routes `app/api/coaching/**`.
8. **portfolio.ts** — `buildPortfolio`/`summarize` generalizados.
9. **Componentes** — designTokens/MaturityBadge/LeadershipSummary (copy) → ui.tsx → CoachingHub → CoachingTeamPage.
10. **Charts** — `components/charts-maturity.tsx`.
11. **Página + sidebar** — `app/coaching/page.tsx` + `components/sidebar.tsx`.
12. **Copy method-aware** — focus/templates/sinais.

### 8.2 Checklist de fidelidade

- [ ] `min()` weakest-link e os 3 blocos Silver/Gold/Platinum **byte-for-byte** do reference.
- [ ] Keys de pilar `commitment`/`flow`/`ownership` estáveis entre métodos.
- [ ] Say-Do como **chip de contexto**, fora de `parts`/`min()`.
- [ ] Ownership = só sinais comportamentais, ambos os métodos.
- [ ] Switch **por-card** (`board_type`), rollups agregam misto.
- [ ] `velocityCV` do valor **cru** (não dos campos round1), windowed ≤6, low-confidence se n<6.
- [ ] Aging usa `deliveryCycleTime.p85` como SLE (NÃO `aging.p85`).
- [ ] Throughput CV guarda `avg===0`; cycle p85/p50 guarda `median===0`.
- [ ] Replay trunca `stages[]` **E** colunas de milestone juntas; re-deriva `current_stage`; gate de sprints por `end_date<=W`.
- [ ] `metrics_history.metrics` jsonb guarda valores **crus** (re-tier sem re-replay).
- [ ] Thresholds em `SCRUM_THRESHOLDS`/`KANBAN_THRESHOLDS`, nunca inline; todos **`a calibrar`**.
- [ ] Tokens de tier nunca aliasam `--primary/--accent/--ring`; lib mapeia tier→classe, hex só em globals.css.
- [ ] Coaching = item de sidebar (sem gating de identidade — não existe).
- [ ] `team_id TEXT` em todas as tabelas de coaching; routes sem `Number(boardId)`.
- [ ] Presence-aware upsert (read-merge); `engaged_at` COALESCE; insert-then-prune assessments; dedup JS.
- [ ] `db:schema` destrutivo → `db:replay` re-roda depois; replay desacoplado do sync.
- [ ] Envelopes literais + strings de erro pt-BR preservados.

### 8.3 Riscos / gaps em aberto

- **Rework refutado (maior gap):** o driver Quality do Scrum é **proxy (bug ratio)** até o changelog
  ser ingerido. Decidir se a feature ship com o proxy rotulado ou aguarda a Opção A. Threshold do
  proxy `a calibrar` separadamente do rework real.
- **Velocity CV com n=4:** só 4 closed sprints no seed (< 6 do spec). CV é computável mas thin;
  flag low-confidence. Calibração dos thresholds Scrum precisa de mais sprints reais.
- **`detect-sm` precisa de `jira_board_id` real:** `teams` não tem hoje. Sidecar nullable adicionado;
  enquanto null, `detect-sm` é stub. Confirmar se há board id numérico obtível por time.
- **`db:schema` wipa `coaching_*`:** dados humanos de coaching não sobrevivem a re-apply em dev.
  Aceito p/ demo; produção futura precisa de migration não-destrutiva.
- **`ageDays` é tempo no stage atual, não age total:** aging-breach% é conservador (subestima).
  Se calibração mostrar viés, trocar por `(now - started_at)/DAY`.
- **Precisão round1 perto de boundaries:** velocity CV mitigado (valor cru). Vigiar outros thresholds
  na calibração.
- **Replay anchor:** ancorado em `referenceNow` (edge sintético), não wall-clock. Confirmar
  Monday-align vs ISO-week na calibração visual dos charts.
- **Calibração geral:** TODOS os thresholds são `a calibrar` — agendar pass de calibração com dados
  reais antes de tratar tiers como autoritativos. `metrics.metrics` jsonb permite re-tier sem re-replay.

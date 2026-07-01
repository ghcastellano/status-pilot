-- ─────────────────────────────────────────────────────────────
-- Status Pilot — schema do Supabase (Postgres)
-- Modela o fluxo dual-track de 10 estágios lido do Jira (via SPMETA).
-- Idempotente: seguro re-rodar.
-- ─────────────────────────────────────────────────────────────

drop table if exists coaching_experiments cascade;
drop table if exists coaching_assessments cascade;
drop table if exists coaching_plans cascade;
drop table if exists metrics_history cascade;
drop table if exists qa_cache cascade;
drop table if exists rate_limits cascade;
drop table if exists issues cascade;
drop table if exists epics cascade;
drop table if exists sprints cascade;
drop table if exists teams cascade;

-- Times = projetos/boards no Jira (um Scrum, um Kanban)
create table teams (
  id            text primary key,            -- 'espresso' | 'coldbrew'
  name          text not null,
  board_type    text not null check (board_type in ('scrum','kanban')),
  description   text,
  jira_label    text,
  jira_project_key text,                      -- 'LS' | 'LK'
  created_at    timestamptz not null default now()
);

-- Épicos (features) — agrupam issues
create table epics (
  team_id   text not null references teams(id) on delete cascade,
  epic_key  text not null,                    -- 'loyalty', 'checkout', ...
  name      text not null,
  summary   text,
  jira_key  text,                             -- chave real no Jira (ex: LS-1)
  primary key (team_id, epic_key)
);

-- Sprints (time Scrum)
create table sprints (
  id                text primary key,         -- 'S-16'
  team_id           text not null references teams(id) on delete cascade,
  name              text not null,
  goal              text,
  start_date        date not null,
  end_date          date not null,
  committed_points  numeric not null default 0,
  state             text not null check (state in ('active','closed','future')),
  created_at        timestamptz not null default now()
);

-- Issues = tickets do Jira (lidos via API). Timeline dual-track por estágio.
create table issues (
  id                    text primary key,     -- = issue_key do Jira
  team_id               text not null references teams(id) on delete cascade,
  sprint_id             text references sprints(id) on delete set null,
  epic_key              text,                 -- referencia epics(epic_key) do time
  issue_key             text not null unique,
  title                 text not null,
  type                  text not null check (type in ('story','bug','task')),
  status                text not null check (status in ('To Do','In Progress','Done')),
  current_stage         text not null,        -- estágio atual (nome do status no Jira)
  story_points          numeric,
  -- carimbos de tempo por papel (dual-track):
  created_at            timestamptz not null, -- entrou no funil
  discovery_started_at  timestamptz,
  discovery_done_at     timestamptz,
  committed_at          timestamptz,
  started_at            timestamptz,          -- entrou em desenvolvimento
  review_started_at     timestamptz,
  done_at               timestamptz,          -- trabalho concluído (Ready for Release)
  released_at           timestamptz,          -- Live / Done
  stages                jsonb not null default '[]'::jsonb  -- [{key,jira,kind,at}]
);

create index issues_team_idx     on issues(team_id);
create index issues_sprint_idx   on issues(sprint_id);
create index issues_released_idx on issues(released_at);
create index issues_stage_idx    on issues(current_stage);

-- Cache de perguntas → respostas da IA (protege custo da chave)
create table qa_cache (
  id             bigint generated always as identity primary key,
  team_id        text not null references teams(id) on delete cascade,
  question_norm  text not null,
  question_hash  text not null unique,
  answer         text not null,
  created_at     timestamptz not null default now()
);

-- Rate limiting por IP + sessão (janela deslizante)
create table rate_limits (
  id            bigint generated always as identity primary key,
  bucket_key    text not null unique,
  count         int not null default 0,
  window_start  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Coaching Hub — maturidade dual (Scrum/Kanban)
-- ─────────────────────────────────────────────────────────────

-- Histórico de maturidade: 1 snapshot por time por semana (replay da timeline
-- sintética + snapshots futuros). `metrics` guarda o MaturityResult inteiro,
-- permitindo re-derivar tiers após recalibração de thresholds sem re-replay.
create table metrics_history (
  team_id      text not null references teams(id) on delete cascade,
  as_of        date not null,               -- data de corte do snapshot
  board_type   text not null check (board_type in ('scrum','kanban')),
  tier         int check (tier in (1,2,3)), -- null = sem dados suficientes
  metrics      jsonb not null default '{}'::jsonb,  -- MaturityResult completo
  computed_at  timestamptz not null default now(),
  primary key (team_id, as_of)
);
create index metrics_history_team_idx on metrics_history(team_id, as_of desc);

-- Plano de coaching: 1 por time (gap, hipótese, próximo passo, ask, check-in)
create table coaching_plans (
  team_id     text primary key references teams(id) on delete cascade,
  coaching    boolean not null default true,
  coach       text,
  engaged_at  timestamptz,
  main_gap    text,
  hypothesis  text,
  next_step   text,
  ask         text,                          -- onde a liderança pode ajudar
  review_at   date,                          -- próximo check-in
  updated_at  timestamptz not null default now()
);

-- Sinais comportamentais (pilar Ownership): última avaliação por time
create table coaching_assessments (
  team_id     text primary key references teams(id) on delete cascade,
  signals     jsonb not null default '{}'::jsonb, -- {key: not_yet|emerging|consistent}
  note        text,
  updated_at  timestamptz not null default now()
);

-- Experimentos / intervenções de coaching
create table coaching_experiments (
  id          bigint generated always as identity primary key,
  team_id     text not null references teams(id) on delete cascade,
  pillar      text not null check (pillar in ('flow','quality','ownership')),
  metric      text,                          -- métrica a mover
  behavior    text not null,                 -- o comportamento a testar
  hypothesis  text,
  outcome     text,                          -- resultado observado
  status      text not null default 'active' check (status in ('active','done','dropped')),
  created_at  timestamptz not null default now()
);
create index coaching_experiments_team_idx on coaching_experiments(team_id, created_at desc);

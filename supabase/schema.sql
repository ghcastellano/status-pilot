-- ─────────────────────────────────────────────────────────────
-- Status Pilot — schema do Supabase (Postgres)
-- Modela o fluxo dual-track de 10 estágios lido do Jira (via SPMETA).
-- Idempotente: seguro re-rodar.
-- ─────────────────────────────────────────────────────────────

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

-- Server role is a dedicated LOGIN role provisioned separately; it cannot own schema objects.
grant usage on schema public to status_pilot_runtime;
-- One private workspace, accessed only through authenticated server routes.
-- No browser role may read provider credentials or bypass application authorization.
do $$
declare t text;
begin
  foreach t in array array['teams','epics','sprints','issues','qa_cache','rate_limits','metrics_history','coaching_plans','coaching_assessments','coaching_experiments','experiment_comments','coaching_field_history','jira_connections'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public',t);
    execute format('grant select, insert, update, delete on table public.%I to status_pilot_runtime',t);
    execute format('drop policy if exists workspace_server_access on public.%I',t);
    execute format('create policy workspace_server_access on public.%I to status_pilot_runtime using (true) with check (true)',t);
  end loop;
end $$;

alter table public.teams add column if not exists last_sync_source text;
alter table public.issues drop constraint if exists issues_issue_key_key;
create unique index if not exists issues_team_key_unique on public.issues(team_id,issue_key);

create or replace function public.consume_ai_budget(p_actor text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare ts timestamptz := now(); individual integer; shared integer;
begin
  if p_actor is null or length(p_actor)>128 or length(p_actor)=0 then raise exception 'Invalid actor'; end if;
  -- Same lock order for every endpoint; no client-controlled session/IP reset.
  perform pg_advisory_xact_lock(hashtextextended('status-pilot:ai-budget',0));
  insert into public.rate_limits(bucket_key,count,window_start)
    values ('workspace',0,ts),('user:'||p_actor,0,ts) on conflict(bucket_key) do nothing;
  update public.rate_limits set count=0,window_start=ts
    where bucket_key in ('workspace','user:'||p_actor) and window_start<=ts-interval '1 hour';
  select count into individual from public.rate_limits where bucket_key='user:'||p_actor;
  select count into shared from public.rate_limits where bucket_key='workspace';
  if individual>=10 or shared>=100 then return jsonb_build_object('allowed',false,'remaining',0); end if;
  update public.rate_limits set count=count+1 where bucket_key in ('workspace','user:'||p_actor);
  return jsonb_build_object('allowed',true,'remaining',least(9-individual,99-shared));
end $$;
revoke all on function public.consume_ai_budget(text) from public;
grant execute on function public.consume_ai_budget(text) to status_pilot_runtime;

create or replace function public.replace_team_snapshot(
 p_team text,p_issues jsonb,p_sprints jsonb default null,p_board_type text default null,
 p_source text default 'basic',p_history jsonb default null
) returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if jsonb_typeof(p_issues) is distinct from 'array' or jsonb_array_length(p_issues)>5000
    or (p_sprints is not null and jsonb_typeof(p_sprints)<>'array')
    or (p_history is not null and jsonb_typeof(p_history)<>'array') then raise exception 'Invalid snapshot'; end if;
  perform 1 from public.teams where id=p_team for update;
  if not found then raise exception 'Unknown team'; end if;
  if exists(select 1 from jsonb_array_elements(p_issues) r where r->>'team_id' is distinct from p_team)
    or exists(select 1 from jsonb_array_elements(coalesce(p_sprints,'[]')) r where r->>'team_id' is distinct from p_team)
    or exists(select 1 from jsonb_array_elements(coalesce(p_history,'[]')) r where r->>'team_id' is distinct from p_team)
    then raise exception 'Snapshot scope mismatch'; end if;
  -- Prevent overwriting a record owned by another team, even with a crafted ID.
  if exists(select 1 from public.issues i join jsonb_array_elements(p_issues) r on i.id=r->>'id' where i.team_id<>p_team)
    or exists(select 1 from public.sprints s join jsonb_array_elements(coalesce(p_sprints,'[]')) r on s.id=r->>'id' where s.team_id<>p_team)
    then raise exception 'Snapshot identity conflict'; end if;
  delete from public.issues where team_id=p_team;
  if p_sprints is not null then
    delete from public.sprints where team_id=p_team;
    insert into public.sprints(id,team_id,name,goal,start_date,end_date,committed_points,completed_points,state)
      select id,team_id,name,goal,start_date,end_date,coalesce(committed_points,0),coalesce(completed_points,0),state
      from jsonb_populate_recordset(null::public.sprints,p_sprints);
  end if;
  if exists(select 1 from jsonb_array_elements(p_issues) r where r->>'sprint_id' is not null and not exists(
      select 1 from public.sprints s where s.id=r->>'sprint_id' and s.team_id=p_team)) then raise exception 'Sprint scope mismatch'; end if;
  insert into public.issues(id,team_id,sprint_id,epic_key,issue_key,title,type,status,current_stage,story_points,created_at,
    discovery_started_at,discovery_done_at,committed_at,started_at,review_started_at,done_at,released_at,stages)
    select id,team_id,sprint_id,epic_key,issue_key,title,type,status,current_stage,story_points,created_at,
      discovery_started_at,discovery_done_at,committed_at,started_at,review_started_at,done_at,released_at,coalesce(stages,'[]')
    from jsonb_populate_recordset(null::public.issues,p_issues);
  if p_history is not null then
    delete from public.metrics_history where team_id=p_team;
    insert into public.metrics_history(team_id,as_of,board_type,tier,metrics)
      select team_id,as_of,board_type,tier,metrics from jsonb_populate_recordset(null::public.metrics_history,p_history);
  end if;
  update public.teams set board_type=coalesce(p_board_type,board_type),last_synced_at=now(),last_sync_source=p_source where id=p_team;
  delete from public.qa_cache where team_id=p_team;
  return jsonb_array_length(p_issues);
end $$;
revoke all on function public.replace_team_snapshot(text,jsonb,jsonb,text,text,jsonb) from public;
grant execute on function public.replace_team_snapshot(text,jsonb,jsonb,text,text,jsonb) to status_pilot_runtime;

-- Replay jobs use the same team lock as ingestion and never expose a partial history.
create or replace function public.replace_team_history(p_team text,p_history jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if jsonb_typeof(p_history) is distinct from 'array' or jsonb_array_length(p_history)>1000 then raise exception 'Invalid history'; end if;
  perform 1 from public.teams where id=p_team for update;
  if not found then raise exception 'Unknown team'; end if;
  if exists(select 1 from jsonb_array_elements(p_history) r where r->>'team_id' is distinct from p_team) then raise exception 'History scope mismatch'; end if;
  delete from public.metrics_history where team_id=p_team;
  insert into public.metrics_history(team_id,as_of,board_type,tier,metrics)
    select team_id,as_of,board_type,tier,metrics from jsonb_populate_recordset(null::public.metrics_history,p_history);
  return jsonb_array_length(p_history);
end $$;
revoke all on function public.replace_team_history(text,jsonb) from public;
grant execute on function public.replace_team_history(text,jsonb) to status_pilot_runtime;

grant usage, select on all sequences in schema public to status_pilot_runtime;
revoke create on schema public from public;

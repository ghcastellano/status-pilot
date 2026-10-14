-- Fail closed if an API-managed owner role is accidentally substituted for the runtime role.
do $$
begin
  if exists(select 1 from pg_roles where rolname='status_pilot_runtime' and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) then
    raise exception 'Runtime database role must have no administrative privileges';
  end if;
  if exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='status_pilot_runtime') then
    raise exception 'Runtime database role must not inherit other roles';
  end if;
end $$;

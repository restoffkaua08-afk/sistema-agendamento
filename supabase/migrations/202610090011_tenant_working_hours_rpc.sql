-- Atomically replace the tenant-wide business schedule for all active staff.
create or replace function public.replace_tenant_working_hours(
  p_tenant_id uuid,
  p_days jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  v_staff record;
  v_day jsonb;
  v_weekday integer;
  v_start time;
  v_end time;
  v_open boolean;
  v_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> 7 then
    raise exception 'INVALID_WORKING_HOURS' using errcode = '22023';
  end if;
  if (select count(distinct (d->>'weekday')::integer) from jsonb_array_elements(p_days) d) <> 7
     or exists (select 1 from jsonb_array_elements(p_days) d
       where coalesce((d->>'weekday')::integer, -1) not between 0 and 6
         or coalesce((d->>'open')::boolean, false) not in (true,false)) then
    raise exception 'INVALID_WORKING_HOURS' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_days) d
    where coalesce((d->>'open')::boolean,false)
      and ((d->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or (d->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or (d->>'start')::time >= (d->>'end')::time)) then
    raise exception 'INVALID_WORKING_HOURS' using errcode = '22023';
  end if;

  delete from public.working_hours wh where wh.tenant_id = p_tenant_id;
  for v_staff in select s.id from public.staff s where s.tenant_id = p_tenant_id and s.active
  loop
    for v_day in select value from jsonb_array_elements(p_days)
    loop
      v_open := coalesce((v_day->>'open')::boolean,false);
      if v_open then
        v_weekday := (v_day->>'weekday')::integer;
        v_start := (v_day->>'start')::time;
        v_end := (v_day->>'end')::time;
        insert into public.working_hours(tenant_id,staff_id,weekday,starts_at,ends_at,active)
        values (p_tenant_id,v_staff.id,v_weekday,v_start,v_end,true);
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('savedRows',v_count);
end;
$$;
revoke all on function public.replace_tenant_working_hours(uuid,jsonb) from public, anon;
grant execute on function public.replace_tenant_working_hours(uuid,jsonb) to authenticated;

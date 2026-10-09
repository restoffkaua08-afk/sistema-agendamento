-- Atomically replace all services assigned to a professional.
-- SECURITY INVOKER keeps the caller's RLS context; no elevated privileges are used.
create or replace function public.replace_staff_services(
  p_tenant_id uuid,
  p_staff_id uuid,
  p_service_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $$
declare
  requested_ids uuid[] := coalesce(p_service_ids, array[]::uuid[]);
  distinct_count integer;
  matching_count integer;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.role in ('owner', 'admin')
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.staff s
    where s.id = p_staff_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(distinct x), count(x)
    into distinct_count, matching_count
    from unnest(requested_ids) as t(x);
  if distinct_count <> cardinality(requested_ids) then
    raise exception 'DUPLICATE_SERVICE_IDS' using errcode = '22023';
  end if;

  if cardinality(requested_ids) > 100 then
    raise exception 'TOO_MANY_SERVICE_IDS' using errcode = '22023';
  end if;

  if cardinality(requested_ids) > 0 then
    select count(*) into matching_count
    from public.services s
    where s.tenant_id = p_tenant_id
      and s.id = any(requested_ids);
    if matching_count <> cardinality(requested_ids) then
      raise exception 'INVALID_SERVICE' using errcode = '22023';
    end if;
  end if;

  delete from public.staff_services ss
  where ss.tenant_id = p_tenant_id and ss.staff_id = p_staff_id;

  insert into public.staff_services (tenant_id, staff_id, service_id)
  select p_tenant_id, p_staff_id, x
  from unnest(requested_ids) as t(x);

  return jsonb_build_object(
    'staffId', p_staff_id,
    'serviceIds', to_jsonb(requested_ids)
  );
end;
$$;

revoke all on function public.replace_staff_services(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.replace_staff_services(uuid, uuid, uuid[]) to authenticated;

-- Public read RPCs and strict idempotency replay protection.
alter table public.appointments
  add column if not exists request_hash text;

create or replace function public.get_public_catalog(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t public.tenants%rowtype;
begin
  select * into t from public.tenants where slug = p_slug and status = 'active';
  if not found then return null; end if;
  return jsonb_build_object(
    'tenant', jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'timezone', t.timezone),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'durationMinutes', s.duration_minutes, 'bufferMinutes', s.buffer_minutes, 'price', s.price
      ) order by s.created_at, s.id)
      from public.services s where s.tenant_id = t.id and s.active
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'name', st.name,
        'serviceIds', coalesce((
          select jsonb_agg(ss.service_id)
          from public.staff_services ss
          join public.services s on s.id = ss.service_id and s.tenant_id = ss.tenant_id and s.active
          where ss.tenant_id = t.id and ss.staff_id = st.id
        ), '[]'::jsonb)
      ) order by st.name)
      from public.staff st where st.tenant_id = t.id and st.active
    ), '[]'::jsonb),
    'workingHours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staffId', wh.staff_id, 'weekday', wh.weekday,
        'startsAt', to_char(wh.starts_at, 'HH24:MI'), 'endsAt', to_char(wh.ends_at, 'HH24:MI')
      ) order by wh.weekday, wh.starts_at)
      from public.working_hours wh where wh.tenant_id = t.id and wh.active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_public_appointments(p_slug text, p_staff_id uuid, p_date date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare t public.tenants%rowtype;
begin
  select * into t from public.tenants where slug = p_slug and status = 'active';
  if not found then return null; end if;
  if not exists (select 1 from public.staff where id = p_staff_id and tenant_id = t.id and active) then
    raise exception using errcode = '22023', message = 'INVALID_STAFF';
  end if;
  return jsonb_build_object('appointments', coalesce((
    select jsonb_agg(jsonb_build_object('startsAt', a.starts_at, 'endsAt', a.ends_at, 'status', a.status))
    from public.appointments a
    where a.tenant_id = t.id and a.staff_id = p_staff_id
      and a.starts_at < ((p_date + 1)::timestamp at time zone t.timezone)
      and a.ends_at > (p_date::timestamp at time zone t.timezone)
      and a.status in ('pending','confirmed')
  ), '[]'::jsonb));
end;
$$;

create or replace function public.create_public_appointment(
  p_slug text, p_service_id uuid, p_staff_id uuid, p_starts_at timestamptz,
  p_customer_name text, p_customer_email text, p_customer_phone text,
  p_whatsapp_opt_in boolean, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.tenants%rowtype;
  s public.services%rowtype;
  a public.appointments%rowtype;
  body_hash text;
  local_start timestamp;
  local_end timestamp;
  new_end timestamptz;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_customer_name is null or length(trim(p_customer_name)) not between 2 and 100
    or p_customer_email is null or length(trim(p_customer_email)) > 254
    or p_customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_customer_phone is null or length(trim(p_customer_phone)) not between 8 and 20 then
    raise exception using errcode = '22023', message = 'VALIDATION_ERROR';
  end if;
  select * into t from public.tenants where slug = p_slug and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'TENANT_NOT_FOUND'; end if;
  body_hash := md5(concat_ws('|', p_service_id, p_staff_id, p_starts_at, trim(p_customer_name), lower(trim(p_customer_email)), trim(p_customer_phone), coalesce(p_whatsapp_opt_in,false)));
  perform pg_advisory_xact_lock(hashtextextended(t.id::text || ':' || p_staff_id::text, 0));
  select * into a from public.appointments where tenant_id = t.id and idempotency_key = p_idempotency_key;
  if found then
    if a.request_hash is not null and a.request_hash <> body_hash then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return jsonb_build_object('id', a.id, 'readableNumber', 'A-' || upper(substr(replace(a.id::text, '-', ''), 1, 8)), 'startsAt', a.starts_at, 'endsAt', a.ends_at, 'status', a.status);
  end if;
  select * into s from public.services
    where id = p_service_id and tenant_id = t.id and active;
  if not found or not exists (
    select 1 from public.staff_services ss join public.staff st on st.id = ss.staff_id and st.tenant_id = ss.tenant_id
    where ss.tenant_id = t.id and ss.staff_id = p_staff_id and ss.service_id = p_service_id and st.active
  ) then raise exception using errcode = '22023', message = 'SERVICE_OR_STAFF_UNAVAILABLE'; end if;
  if p_starts_at <= now() or p_starts_at > now() + interval '90 days' then
    raise exception using errcode = '22023', message = 'INVALID_START_TIME';
  end if;
  new_end := p_starts_at + make_interval(mins => s.duration_minutes + s.buffer_minutes);
  local_start := p_starts_at at time zone t.timezone;
  local_end := new_end at time zone t.timezone;
  if not exists (
    select 1 from public.working_hours wh
    where wh.tenant_id = t.id and wh.staff_id = p_staff_id and wh.active
      and wh.weekday = extract(dow from local_start)::integer
      and local_start::time >= wh.starts_at and local_end::time <= wh.ends_at
      and local_start::date = local_end::date
  ) then raise exception using errcode = '22023', message = 'OUTSIDE_WORKING_HOURS'; end if;
  if exists (
    select 1 from public.appointments other
    where other.tenant_id = t.id and other.staff_id = p_staff_id
      and other.status in ('pending','confirmed')
      and other.starts_at < new_end and other.ends_at > p_starts_at
  ) then raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE'; end if;
  insert into public.appointments (
    tenant_id, service_id, staff_id, starts_at, ends_at, customer_name, customer_email,
    customer_phone, whatsapp_opt_in, status, idempotency_key, request_hash
  ) values (
    t.id, p_service_id, p_staff_id, p_starts_at, new_end, trim(p_customer_name),
    lower(trim(p_customer_email)), trim(p_customer_phone), coalesce(p_whatsapp_opt_in,false),
    'pending', p_idempotency_key, body_hash
  ) returning * into a;
  return jsonb_build_object('id', a.id, 'readableNumber', 'A-' || upper(substr(replace(a.id::text, '-', ''), 1, 8)), 'startsAt', a.starts_at, 'endsAt', a.ends_at, 'status', a.status);
end;
$$;

revoke all on function public.get_public_catalog(text) from public, anon, authenticated;
revoke all on function public.get_public_appointments(text, uuid, date) from public, anon, authenticated;
revoke all on function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.get_public_catalog(text) to anon, service_role;
grant execute on function public.get_public_appointments(text, uuid, date) to anon, service_role;
grant execute on function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) to anon, service_role;

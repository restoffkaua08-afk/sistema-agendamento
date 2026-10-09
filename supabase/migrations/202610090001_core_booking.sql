-- Core multi-tenant booking schema for Supabase/PostgreSQL.
-- Apply this file to the dedicated SaaS project before enabling production traffic.
create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,50}$'),
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text not null default '',
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 120),
  price numeric(12,2) check (price is null or price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table if not exists public.staff_services (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null,
  service_id uuid not null,
  primary key (tenant_id, staff_id, service_id),
  foreign key (tenant_id, staff_id) references public.staff(tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id) references public.services(tenant_id, id) on delete cascade
);

create table if not exists public.working_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  check (ends_at > starts_at),
  foreign key (tenant_id, staff_id) references public.staff(tenant_id, id) on delete cascade
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  whatsapp_opt_in boolean not null default false,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed','no_show')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, service_id) references public.services(tenant_id, id),
  foreign key (tenant_id, staff_id) references public.staff(tenant_id, id)
);

create index if not exists appointments_staff_start_idx on public.appointments(tenant_id, staff_id, starts_at);
create index if not exists services_tenant_active_idx on public.services(tenant_id, active);
create index if not exists staff_tenant_active_idx on public.staff(tenant_id, active);
create index if not exists working_hours_lookup_idx on public.working_hours(tenant_id, staff_id, weekday, active);

alter table public.tenants enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.working_hours enable row level security;
alter table public.appointments enable row level security;

-- Public traffic must go through the API; only the server-side service role may access rows.
revoke all on public.tenants, public.services, public.staff, public.staff_services, public.working_hours, public.appointments from anon, authenticated;
grant all on public.tenants, public.services, public.staff, public.staff_services, public.working_hours, public.appointments to service_role;

create or replace function public.create_public_appointment(
  p_slug text,
  p_service_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_whatsapp_opt_in boolean,
  p_idempotency_key text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_service public.services%rowtype;
  v_appointment public.appointments%rowtype;
  v_ends_at timestamptz;
  v_weekday integer;
  v_local_start time;
  v_local_end time;
begin
  select * into v_tenant from public.tenants where slug = p_slug and status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'TENANT_NOT_FOUND'; end if;

  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 200 then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  select * into v_appointment from public.appointments
    where tenant_id = v_tenant.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_appointment.id, 'readableNumber', 'A-' || upper(substr(replace(v_appointment.id::text, '-', ''), 1, 8)), 'startsAt', v_appointment.starts_at, 'endsAt', v_appointment.ends_at, 'status', v_appointment.status);
  end if;

  select s.* into v_service from public.services s
    join public.staff_services ss on ss.tenant_id = s.tenant_id and ss.service_id = s.id
    join public.staff st on st.tenant_id = ss.tenant_id and st.id = ss.staff_id
    where s.tenant_id = v_tenant.id and s.id = p_service_id and st.id = p_staff_id and s.active and st.active;
  if not found then raise exception using errcode = '22023', message = 'SERVICE_OR_STAFF_UNAVAILABLE'; end if;

  if p_starts_at <= now() or p_starts_at > now() + interval '90 days' then
    raise exception using errcode = '22023', message = 'INVALID_START_TIME';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes + v_service.buffer_minutes);
  v_weekday := extract(dow from p_starts_at at time zone v_tenant.timezone)::integer;
  v_local_start := p_starts_at at time zone v_tenant.timezone;
  v_local_end := v_ends_at at time zone v_tenant.timezone;

  if not exists (
    select 1 from public.working_hours wh
    where wh.tenant_id = v_tenant.id and wh.staff_id = p_staff_id and wh.weekday = v_weekday and wh.active
      and v_local_start::time >= wh.starts_at and v_local_end::time <= wh.ends_at
      and (v_local_start::date = v_local_end::date)
  ) then raise exception using errcode = '22023', message = 'OUTSIDE_WORKING_HOURS'; end if;

  -- Serialize reservations per tenant and professional to prevent overlapping concurrent bookings.
  perform pg_advisory_xact_lock(hashtextextended(v_tenant.id::text || ':' || p_staff_id::text, 0));
  select * into v_appointment from public.appointments
    where tenant_id = v_tenant.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_appointment.id, 'readableNumber', 'A-' || upper(substr(replace(v_appointment.id::text, '-', ''), 1, 8)), 'startsAt', v_appointment.starts_at, 'endsAt', v_appointment.ends_at, 'status', v_appointment.status);
  end if;

  if exists (
    select 1 from public.appointments a
    where a.tenant_id = v_tenant.id and a.staff_id = p_staff_id
      and a.status in ('pending','confirmed')
      and a.starts_at < v_ends_at and a.ends_at > p_starts_at
  ) then raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE'; end if;

  insert into public.appointments(tenant_id, service_id, staff_id, starts_at, ends_at, customer_name, customer_email, customer_phone, whatsapp_opt_in, status, idempotency_key)
  values (v_tenant.id, p_service_id, p_staff_id, p_starts_at, v_ends_at, trim(p_customer_name), lower(trim(p_customer_email)), trim(p_customer_phone), coalesce(p_whatsapp_opt_in, false), 'pending', p_idempotency_key)
  returning * into v_appointment;

  return jsonb_build_object('id', v_appointment.id, 'readableNumber', 'A-' || upper(substr(replace(v_appointment.id::text, '-', ''), 1, 8)), 'startsAt', v_appointment.starts_at, 'endsAt', v_appointment.ends_at, 'status', v_appointment.status);
end;
$$;

revoke all on function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) to service_role;

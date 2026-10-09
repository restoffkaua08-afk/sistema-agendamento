-- Authenticated tenant membership and owner API access.
-- Membership rows are provisioned by an authorized operator after the user signs up in Supabase Auth.
create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists tenant_members_user_idx on public.tenant_members(user_id, tenant_id);
alter table public.tenant_members enable row level security;
revoke all on public.tenant_members from anon, authenticated;
grant select on public.tenant_members to authenticated;
create policy tenant_members_read_self on public.tenant_members
  for select to authenticated using (user_id = (select auth.uid()));

-- Read access is limited to tenants for which the JWT subject has a membership.
grant select on public.tenants, public.services, public.staff, public.staff_services, public.working_hours, public.appointments to authenticated;
grant update (status) on public.appointments to authenticated;

create policy tenant_members_read_tenant on public.tenants
  for select to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = tenants.id and tm.user_id = (select auth.uid()))
  );
create policy services_member_read on public.services
  for select to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = services.tenant_id and tm.user_id = (select auth.uid()))
  );
create policy staff_member_read on public.staff
  for select to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = staff.tenant_id and tm.user_id = (select auth.uid()))
  );
create policy staff_services_member_read on public.staff_services
  for select to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = staff_services.tenant_id and tm.user_id = (select auth.uid()))
  );
create policy working_hours_member_read on public.working_hours
  for select to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = working_hours.tenant_id and tm.user_id = (select auth.uid()))
  );
create policy appointments_member_read on public.appointments
  for select to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = appointments.tenant_id and tm.user_id = (select auth.uid()))
  );
create policy appointments_member_update on public.appointments
  for update to authenticated
  using (exists (select 1 from public.tenant_members tm where tm.tenant_id = appointments.tenant_id and tm.user_id = (select auth.uid())))
  with check (exists (select 1 from public.tenant_members tm where tm.tenant_id = appointments.tenant_id and tm.user_id = (select auth.uid())));

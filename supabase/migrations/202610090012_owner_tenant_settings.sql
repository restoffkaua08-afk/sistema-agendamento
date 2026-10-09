alter table public.tenants add column if not exists phone text not null default '';
alter table public.tenants add column if not exists address text not null default '';
alter table public.tenants add column if not exists currency text not null default 'BRL';
alter table public.tenants add column if not exists min_advance_hours integer not null default 1;
alter table public.tenants add column if not exists cancellation_hours integer not null default 2;
alter table public.tenants add column if not exists auto_confirm boolean not null default false;
grant update (name, phone, address, timezone, currency, min_advance_hours, cancellation_hours, auto_confirm) on public.tenants to authenticated;
create policy tenants_owner_admin_update on public.tenants for update to authenticated using (exists (select 1 from public.tenant_members tm where tm.tenant_id = tenants.id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin'))) with check (exists (select 1 from public.tenant_members tm where tm.tenant_id = tenants.id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin')));
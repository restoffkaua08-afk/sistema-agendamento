-- Restrict administrative writes to tenant owners/admins. Staff remain read-only.
create policy services_owner_admin_insert on public.services
  for insert to authenticated with check (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = services.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin'))
  );
create policy services_owner_admin_update on public.services
  for update to authenticated
  using (exists (select 1 from public.tenant_members tm where tm.tenant_id = services.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin')))
  with check (exists (select 1 from public.tenant_members tm where tm.tenant_id = services.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin')));
create policy staff_owner_admin_insert on public.staff
  for insert to authenticated with check (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = staff.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin'))
  );
create policy staff_owner_admin_update on public.staff
  for update to authenticated
  using (exists (select 1 from public.tenant_members tm where tm.tenant_id = staff.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin')))
  with check (exists (select 1 from public.tenant_members tm where tm.tenant_id = staff.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin')));

grant insert, update on public.services, public.staff to authenticated;

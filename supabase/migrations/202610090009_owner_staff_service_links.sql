-- Owners/admins may manage service assignments, scoped to their own tenant.
create policy staff_services_owner_admin_insert on public.staff_services
  for insert to authenticated with check (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = staff_services.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin'))
  );
create policy staff_services_owner_admin_delete on public.staff_services
  for delete to authenticated using (
    exists (select 1 from public.tenant_members tm where tm.tenant_id = staff_services.tenant_id and tm.user_id = (select auth.uid()) and tm.role in ('owner','admin'))
  );
grant insert, delete on public.staff_services to authenticated;

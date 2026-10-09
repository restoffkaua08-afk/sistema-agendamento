-- Cover composite tenant/service foreign keys reported by the Supabase performance advisor.
-- Applied to the test Supabase project as migration index_tenant_service_foreign_keys.
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_service
  ON public.appointments (tenant_id, service_id);

CREATE INDEX IF NOT EXISTS idx_staff_services_tenant_service
  ON public.staff_services (tenant_id, service_id);

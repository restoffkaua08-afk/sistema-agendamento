-- Cover composite tenant/service foreign keys reported by the Supabase performance advisor.
-- Safe to run repeatedly; these indexes do not change booking behavior.
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_service
  ON public.appointments (tenant_id, service_id);

CREATE INDEX IF NOT EXISTS idx_staff_services_tenant_service
  ON public.staff_services (tenant_id, service_id);

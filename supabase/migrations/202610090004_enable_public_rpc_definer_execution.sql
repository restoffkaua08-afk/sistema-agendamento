-- Ensure the three narrowly scoped public booking RPCs execute with their owner privileges.
-- Public roles still have no direct table privileges. Keep a fixed search path.
alter function public.get_public_catalog(text) security definer;
alter function public.get_public_catalog(text) set search_path = public, pg_temp;

alter function public.get_public_appointments(text, uuid, date) security definer;
alter function public.get_public_appointments(text, uuid, date) set search_path = public, pg_temp;

alter function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) security definer;
alter function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) set search_path = public, pg_temp;

revoke all on function public.get_public_catalog(text) from public, authenticated;
revoke all on function public.get_public_appointments(text, uuid, date) from public, authenticated;
revoke all on function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) from public, authenticated;
grant execute on function public.get_public_catalog(text) to anon, service_role;
grant execute on function public.get_public_appointments(text, uuid, date) to anon, service_role;
grant execute on function public.create_public_appointment(text, uuid, uuid, timestamptz, text, text, text, boolean, text) to anon, service_role;

export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type Service = { id: string; name: string; description: string; durationMinutes: number; price?: number };
export type Staff = { id: string; name: string; role: string; serviceIds: string[] };
export type PublicTenant = { slug: string; name: string; tagline: string; accent: string; contactLabel: string };
export type Appointment = { id: string; readableNumber: string; tenantSlug: string; serviceId: string; staffId: string; startsAt: string; endsAt: string; customerName: string; customerEmail: string; customerPhone: string; status: AppointmentStatus };
export type CreateAppointmentInput = { serviceId: string; staffId: string; startsAt: string; customerName: string; customerEmail: string; customerPhone: string };

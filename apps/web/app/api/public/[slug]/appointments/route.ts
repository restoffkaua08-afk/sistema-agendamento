import { NextResponse } from "next/server";
import { services, staff, workingHours } from "@/lib/demo-data";

type StoredAppointment = { id: string; readableNumber: string; slug: string; serviceId: string; staffId: string; startsAt: string; endsAt: string; customerName: string; customerEmail: string; customerPhone: string; status: "confirmed" };
const appointments: StoredAppointment[] = [];
const idempotency = new Map<string, { fingerprint: string; response: StoredAppointment }>();
const toMinutes = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
const inMemoryFallbackEnabled = process.env.NODE_ENV === "development" && !process.env.VERCEL;
const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());
const fallbackUnavailable = () => NextResponse.json({
  code: "BOOKING_BACKEND_UNAVAILABLE",
  message: apiConfigured
    ? "A rota de demonstração está disponível apenas no desenvolvimento local."
    : "Agendamentos indisponíveis: configure NEXT_PUBLIC_API_URL para conectar ao serviço de reservas.",
}, { status: 503 });

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!inMemoryFallbackEnabled) return fallbackUnavailable();
  const { slug } = await context.params;
  const key = request.headers.get("Idempotency-Key");
  if (!key) return NextResponse.json({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Envie uma chave de idempotência." }, { status: 400 });
  const input = await request.json() as Partial<StoredAppointment>;
  if (!input.serviceId || !input.staffId || !input.startsAt || !input.customerName || !input.customerEmail || !input.customerPhone) return NextResponse.json({ code: "VALIDATION_ERROR", message: "Dados obrigatórios ausentes." }, { status: 400 });

  const service = services.find((item) => item.id === input.serviceId);
  const professional = staff.find((item) => item.id === input.staffId);
  if (!service || !professional) return NextResponse.json({ code: "NOT_FOUND", message: "Serviço ou profissional não encontrado." }, { status: 404 });
  if (!professional.serviceIds.includes(service.id)) return NextResponse.json({ code: "INVALID_ASSIGNMENT", message: "Este profissional não atende o serviço escolhido." }, { status: 409 });

  const slotMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(input.startsAt);
  const start = new Date(input.startsAt);
  if (!slotMatch || Number.isNaN(start.getTime())) return NextResponse.json({ code: "VALIDATION_ERROR", message: "Data e hora inválidas." }, { status: 400 });
  const [, date, hours, minutes] = slotMatch;
  const schedule = workingHours.find((item) => item.weekday === new Date(`${date}T00:00:00Z`).getUTCDay());
  const startMinute = Number(hours) * 60 + Number(minutes);
  const endMinute = startMinute + service.durationMinutes;
  if (!schedule || startMinute % 30 !== 0 || startMinute < toMinutes(schedule.startsAt) || endMinute > toMinutes(schedule.endsAt)) return NextResponse.json({ code: "SLOT_UNAVAILABLE", message: "O horário não está dentro da disponibilidade." }, { status: 409 });

  const fingerprint = JSON.stringify({ slug, ...input });
  const idempotencyKey = `${slug}:${key}`;
  const previous = idempotency.get(idempotencyKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return NextResponse.json({ code: "IDEMPOTENCY_KEY_REUSED", message: "A chave já foi usada com outro conteúdo." }, { status: 409 });
    return NextResponse.json({ appointment: { id: previous.response.id, readableNumber: previous.response.readableNumber, status: previous.response.status } }, { status: 201 });
  }

  const end = new Date(start.getTime() + service.durationMinutes * 60000);
  const conflict = appointments.some((item) => item.slug === slug && item.staffId === input.staffId && item.status === "confirmed" && new Date(item.startsAt) < end && new Date(item.endsAt) > start);
  if (conflict) return NextResponse.json({ code: "SLOT_UNAVAILABLE", message: "O horário não está mais disponível." }, { status: 409 });
  const appointment: StoredAppointment = { id: crypto.randomUUID(), readableNumber: `A-${String(appointments.length + 1).padStart(4, "0")}`, slug, serviceId: input.serviceId, staffId: input.staffId, startsAt: start.toISOString(), endsAt: end.toISOString(), customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone, status: "confirmed" };
  appointments.push(appointment);
  idempotency.set(idempotencyKey, { fingerprint, response: appointment });
  return NextResponse.json({ appointment: { id: appointment.id, readableNumber: appointment.readableNumber, status: appointment.status } }, { status: 201 });
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!inMemoryFallbackEnabled) return fallbackUnavailable();
  const { slug } = await context.params;
  const staffId = new URL(request.url).searchParams.get("staffId");
  return NextResponse.json({ appointments: appointments.filter((item) => item.slug === slug && (!staffId || item.staffId === staffId)).map(({ startsAt, endsAt, status }) => ({ startsAt, endsAt, status })) });
}

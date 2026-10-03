"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateAvailability, localDateTimeToInstant, type AvailabilityAppointment } from "@agenda/contracts";
import { services as demoServices, staff as demoStaff, tenant as demoTenant, workingHours as demoWorkingHours } from "@/lib/demo-data";

type Step = "service" | "time" | "customer" | "done";

const parseDateInput = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
const firstBookableDate = (hours = demoWorkingHours, timeZone = demoTenant.timezone ?? "America/Sao_Paulo") => { const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value])); const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`); for (let offset = 0; offset < 7; offset += 1) { if (hours.some((item) => item.weekday === date.getUTCDay())) return date.toISOString().slice(0, 10); date.setUTCDate(date.getUTCDate() + 1); } return date.toISOString().slice(0, 10); };
const formatSlot = (date: Date, timeZone: string) => date.toLocaleTimeString("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" });
const apiBase = (process.env.NEXT_PUBLIC_API_URL?.trim() ?? "").replace(/\/$/, "");
const localDemoFallback = process.env.NODE_ENV === "development";
const bookingUnavailable = !apiBase && !localDemoFallback;
const publicApiPath = (slug: string, suffix: string) => apiBase ? `${apiBase}/v1/public/${slug}${suffix}` : `/api/public/${slug}${suffix}`;
type CatalogHours = Array<(typeof demoWorkingHours)[number] & { staffId?: string }>;
type Catalog = { tenant: typeof demoTenant; services: typeof demoServices; staff: typeof demoStaff; workingHours: CatalogHours };

export function BookingFlow() {
  const [catalog, setCatalog] = useState<Catalog>({ tenant: demoTenant, services: demoServices, staff: demoStaff, workingHours: demoWorkingHours });
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState(demoServices[0].id);
  const [staffId, setStaffId] = useState(demoStaff[0].id);
  const [slot, setSlot] = useState<string | null>(null);
  const [date, setDate] = useState(firstBookableDate);
  const [bookedAppointments, setBookedAppointments] = useState<AvailabilityAppointment[]>([]);
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const pendingBooking = useRef<{ fingerprint: string; key: string } | null>(null);
  const { tenant, services, staff, workingHours } = catalog;
  const service = services.find((item) => item.id === serviceId) ?? services[0];
  const eligibleStaff = staff.filter((item) => item.serviceIds.includes(serviceId));
  const professional = staff.find((item) => item.id === staffId) ?? eligibleStaff[0] ?? staff[0];
  const selectedDate = parseDateInput(date);

  const selectedWeekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const timeZone = tenant.timezone ?? "America/Sao_Paulo";
  const availableSlotValues = useMemo(() => calculateAvailability({ date: selectedDate, weekday: selectedWeekday, timeZone, durationMinutes: service?.durationMinutes ?? 0, bufferMinutes: service?.bufferMinutes ?? 0, intervalMinutes: 30, schedules: workingHours.filter((item) => !item.staffId || item.staffId === staffId), blocks: [], appointments: bookedAppointments }).map((item) => formatSlot(item, timeZone)), [bookedAppointments, date, service?.bufferMinutes, service?.durationMinutes, staffId, timeZone, workingHours]);

  useEffect(() => {
    if (!apiBase) return;
    let cancelled = false;
    const loadCatalog = async () => {
      try {
        const response = await fetch(publicApiPath(demoTenant.slug, "/catalog"));
        if (!response.ok) return;
        const payload = await response.json() as { tenant?: Partial<typeof demoTenant> & { timezone?: string }; services?: typeof demoServices; staff?: typeof demoStaff; workingHours?: CatalogHours };
        if (!cancelled) {
          const nextServices = payload.services ?? catalog.services;
          const nextStaff = payload.staff ?? catalog.staff;
          setCatalog((current) => ({ tenant: { ...current.tenant, ...payload.tenant }, services: payload.services ?? current.services, staff: payload.staff ?? current.staff, workingHours: payload.workingHours ?? current.workingHours }));
          setServiceId((current) => nextServices.some((item) => item.id === current) ? current : nextServices[0]?.id ?? "");
          setStaffId((current) => nextStaff.some((item) => item.id === current) ? current : nextStaff[0]?.id ?? "");
        }
      } catch { /* fallback visual stays available until the API is configured */ }
    };
    void loadCatalog();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { if (!eligibleStaff.some((item) => item.id === staffId)) setStaffId(eligibleStaff[0]?.id ?? staff[0]?.id ?? ""); }, [eligibleStaff, staff, staffId]);
  useEffect(() => { if (!workingHours.some((item) => item.weekday === selectedWeekday)) setDate(firstBookableDate(workingHours, tenant.timezone)); }, [workingHours, selectedWeekday, tenant.timezone]);
  useEffect(() => {
    if (bookingUnavailable) return;
    let cancelled = false;
    const loadAppointments = async () => {
      try {
        const response = await fetch(publicApiPath(tenant.slug, `/appointments?staffId=${encodeURIComponent(staffId)}`));
        if (!response.ok) return;
        const payload = await response.json() as { appointments?: Array<{ startsAt: string; endsAt: string; status: AvailabilityAppointment["status"] }> };
        if (!cancelled) setBookedAppointments((payload.appointments ?? []).map((item) => ({ ...item, startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt) })));
      } catch { if (!cancelled) setBookedAppointments([]); }
    };
    void loadAppointments();
    return () => { cancelled = true; };
  }, [date, staffId]);
  useEffect(() => { if (!slot || !availableSlotValues.includes(slot)) setSlot(availableSlotValues[0] ?? null); }, [availableSlotValues, slot]);

  const updateCustomer = (key: keyof typeof customer, value: string) => setCustomer((current) => ({ ...current, [key]: value }));
  const next = () => { setError(""); if (step === "service") setStep("time"); else if (step === "time") { if (!slot) { setError("Não há horário disponível para esta combinação."); return; } setStep("customer"); } };
  async function confirm() {
    if (!slot) { setError("Escolha um horário disponível."); return; }
    if (!customer.name || !customer.email || !customer.phone) { setError("Preencha nome, e-mail e telefone para continuar."); return; }
    setError("");
    const startsAt = localDateTimeToInstant(date, slot, timeZone);
    if (!startsAt) { setError("Esse horário não existe no fuso local do estabelecimento. Escolha outro horário."); return; }
    const booking = { serviceId, staffId, startsAt: startsAt.toISOString(), ...customer };
    const fingerprint = JSON.stringify({ slug: tenant.slug, ...booking });
    const attempt = pendingBooking.current?.fingerprint === fingerprint
      ? pendingBooking.current
      : { fingerprint, key: crypto.randomUUID() };
    pendingBooking.current = attempt;

    try {
      const response = await fetch(publicApiPath(tenant.slug, "/appointments"), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key }, body: JSON.stringify(booking) });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { code?: string; message?: string } | null;
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          setError(retryAfter ? `Muitas tentativas. Tente novamente em ${retryAfter} segundos.` : "Muitas tentativas. Aguarde antes de tentar novamente.");
        } else if (response.status >= 500) {
          setError(failure?.code === "BOOKING_BACKEND_UNAVAILABLE" && failure.message ? failure.message : "O serviço de agendamentos está indisponível. Tente novamente mais tarde.");
        } else if (failure?.code === "SLOT_UNAVAILABLE") {
          setError("Esse horário acabou de ficar indisponível. Escolha outro para tentar novamente.");
        } else {
          setError(failure?.message ?? "Não foi possível confirmar o agendamento. Confira os dados e tente novamente.");
        }
        return;
      }
      const payload = await response.json() as { appointment?: { readableNumber?: string } };
      setConfirmationNumber(payload.appointment?.readableNumber ?? "");
      setStep("done");
    } catch {
      setError("Não foi possível conectar ao serviço de agendamentos. Confira sua conexão e tente novamente; os mesmos dados reutilizarão a tentativa anterior.");
    }
  }

  return <div className="booking-wrap"><div className="shell"><header className="booking-header"><Link className="brand" href="/"><span className="brand-mark">M</span>{tenant.name}</Link></header><div className="booking-panel">{bookingUnavailable ? <section className="success" role="status"><div className="eyebrow">Agendamentos indisponíveis</div><h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)" }}>Agendamento online indisponível.</h1><p>Este estabelecimento ainda não pode receber reservas online.</p></section> : <><div className="stepper" aria-label="Etapas do agendamento"><div className={`step ${step === "service" ? "active" : ""}`}>1. Serviço</div><div className={`step ${step === "time" ? "active" : ""}`}>2. Horário</div><div className={`step ${step === "customer" ? "active" : ""}`}>3. Dados</div><div className={`step ${step === "done" ? "active" : ""}`}>4. Confirmado</div></div>
  {step === "service" && <section className="card"><div className="eyebrow">Primeiro passo</div><h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)" }}>Escolha um serviço.</h1><p className="muted">Selecione uma opção para ver os horários disponíveis.</p>{services.length ? <div className="choice-grid">{services.map((item) => <button className={`choice ${item.id === serviceId ? "selected" : ""}`} key={item.id} onClick={() => setServiceId(item.id)}><span><strong>{item.name}</strong><small>{item.description} · {item.durationMinutes} min</small></span><span className="choice-price">R$ {item.price?.toFixed(2)}</span></button>)}</div> : <p className="empty-state">Este estabelecimento ainda não cadastrou serviços para agendamento.</p>}<div className="actions"><button className="button" onClick={next} disabled={!service}>Continuar</button></div></section>}
  {step === "time" && <section className="card"><div className="eyebrow">Segundo passo</div><h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)" }}>Escolha seu horário.</h1><p className="muted">Os horários são calculados pela jornada e removidos assim que já estão ocupados.</p><div className="form-grid"><label className="field">Dia<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><small className="muted">Dias sem jornada não exibem horários.</small></label><label className="field">Profissional<select value={staffId} onChange={(event) => setStaffId(event.target.value)}>{eligibleStaff.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="slot-grid" aria-live="polite">{availableSlotValues.length ? availableSlotValues.map((item) => <button className={`slot ${item === slot ? "selected" : ""}`} key={item} onClick={() => setSlot(item)}>{item}</button>) : <p className="empty-state">Nenhum horário disponível neste dia. Escolha outra data ou profissional.</p>}</div>{error && <p className="error" role="alert">{error}</p>}<div className="actions"><button className="button secondary" onClick={() => setStep("service")}>Voltar</button><button className="button" onClick={next} disabled={!slot}>Continuar</button></div></section>}
  {step === "customer" && <section className="card"><div className="eyebrow">Terceiro passo</div><h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)" }}>Seus dados.</h1><p className="muted">Usaremos essas informações apenas para confirmar o atendimento.</p><div className="summary"><div className="summary-row"><span>Serviço</span><strong>{service.name}</strong></div><div className="summary-row"><span>Data e hora</span><strong>{date} · {slot}</strong></div><div className="summary-row"><span>Profissional</span><strong>{professional.name}</strong></div></div><div className="form-grid"><label className="field">Nome completo<input value={customer.name} onChange={(event) => updateCustomer("name", event.target.value)} autoComplete="name" /></label><label className="field">E-mail<input type="email" value={customer.email} onChange={(event) => updateCustomer("email", event.target.value)} autoComplete="email" /></label><label className="field">Telefone<input value={customer.phone} onChange={(event) => updateCustomer("phone", event.target.value)} autoComplete="tel" /></label></div>{error && <p className="error" role="alert">{error}</p>}<div className="actions"><button className="button secondary" onClick={() => setStep("time")}>Voltar</button><button className="button" onClick={confirm}>Confirmar horário</button></div></section>}
  {step === "done" && <section className="success"><div className="eyebrow">Tudo certo</div><h1 style={{ fontSize: "clamp(2rem,5vw,3.3rem)" }}>Horário reservado.</h1><p>Agendamento confirmado.</p>{confirmationNumber && <p className="muted">Código do agendamento: <strong>{confirmationNumber}</strong></p>}<div className="actions"><Link className="button" href="/">Voltar ao início</Link><Link className="button secondary" href="/painel">Abrir painel</Link></div></section>}
  </>}</div></div></div>;
}

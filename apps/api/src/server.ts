import { createHash, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { createDatabase } from "./db/client.js";
import { appointmentEvents, appointments, bookingRateLimits, customers, idempotencyKeys, mobilePairingCodes, mobilePairRateLimits, notificationOutbox, services, staff, staffServices, tenants, timeOff, workingHours } from "./db/schema.js";
import { auditEvents, memberships, users } from "./db/schema.js";
import { canManageTenant, signSession, verifyPassword, verifySession } from "./auth.js";
import { CONTRACT_VERSION, localDateTimeToInstant } from "@agenda/contracts";
import { bookingClientAddress, bookingClientIpHash, bookingRateWindow, RATE_LIMIT_MAX_ATTEMPTS, loginClientIpHash, mobilePairClientIpHash } from "./domain/booking-rate-limit.js";
import { createMobilePairingCode, formatMobilePairingCode, hashMobilePairingCode, MOBILE_PAIRING_TTL_MS } from "./domain/mobile-pairing.js";
import { isUuid, parseServiceSettings } from "./domain/service-settings.js";

export const app = Fastify({ logger: true });
const database = createDatabase();
const activeStatuses = ["pending", "confirmed"] as const;
const weekdayNames: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type CreateAppointment = { serviceId: string; staffId: string; startsAt: string; customerName: string; customerEmail: string; customerPhone: string; whatsappOptIn?: boolean };
type AppointmentResponse = { appointment: { readableNumber: string; status: string; startsAt: string; endsAt: string }; manageToken: string };
type LoginInput = { email: string; password: string; tenantSlug: string };
type StatusInput = { status: "confirmed" | "cancelled" | "completed" | "no_show" };

class HttpError extends Error {
  constructor(readonly statusCode: number, readonly payload: { code: string; message: string }) { super(payload.message); }
}

function isCreateAppointment(input: unknown): input is CreateAppointment {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<CreateAppointment>;
  const phoneLength = typeof value.customerPhone === "string" ? value.customerPhone.replace(/\D/g, "").length : 0;
  return typeof value.serviceId === "string" && typeof value.staffId === "string" && typeof value.startsAt === "string" && typeof value.customerName === "string" && value.customerName.trim().length >= 2 && typeof value.customerEmail === "string" && value.customerEmail.includes("@") && typeof value.customerPhone === "string" && phoneLength >= 8 && (value.whatsappOptIn === undefined || typeof value.whatsappOptIn === "boolean") && (value.whatsappOptIn !== true || (phoneLength >= 10 && phoneLength <= 15));
}

function unavailable(message: string): never { throw new HttpError(409, { code: "SLOT_UNAVAILABLE", message }); }
function hashRequest(value: CreateAppointment): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function minutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return -1;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return result >= 0 && result <= 1439 ? result : -1;
}

function localParts(date: Date, timeZone: string): { weekday: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = weekdayNames[values.weekday];
  const minute = Number(values.hour) * 60 + Number(values.minute);
  if (weekday === undefined || !Number.isFinite(minute)) throw new HttpError(500, { code: "INVALID_TIMEZONE", message: "O fuso horário da empresa está inválido." });
  return { weekday, minute };
}

function idempotencyHeader(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }
function bearerToken(value: string | string[] | undefined): string | undefined { const header = idempotencyHeader(value); return header?.startsWith("Bearer ") ? header.slice(7) : undefined; }
function isLoginInput(value: unknown): value is LoginInput { if (!value || typeof value !== "object") return false; const input = value as Partial<LoginInput>; return typeof input.email === "string" && typeof input.password === "string" && typeof input.tenantSlug === "string"; }
function isStatusInput(value: unknown): value is StatusInput { if (!value || typeof value !== "object") return false; const status = (value as Partial<StatusInput>).status; return status === "confirmed" || status === "cancelled" || status === "completed" || status === "no_show"; }
function isUniqueViolation(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505"); }
export function localDateBounds(date: string, timeZone: string): { startsAt: Date; endsAt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  day.setUTCDate(day.getUTCDate() + 1);
  const startsAt = localDateTimeToInstant(date, "00:00", timeZone);
  const endsAt = localDateTimeToInstant(day.toISOString().slice(0, 10), "00:00", timeZone);
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}

async function findTenant(slug: string) {
  if (!database) return null;
  const rows = await database.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return rows[0] ?? null;
}

async function ownerTenant(request: { params: { slug: string }; headers: Record<string, string | string[] | undefined> }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  if (!database) { reply.code(503).send({ code: "PERSISTENCE_NOT_CONFIGURED", message: "Configure DATABASE_URL para usar o painel." }); return null; }
  const tenant = await findTenant(request.params.slug);
  const session = verifySession(bearerToken(request.headers.authorization));
  if (!tenant || !session) { reply.code(401).send({ code: "UNAUTHORIZED", message: "Faça login para acessar o painel." }); return null; }
  if (session.tenantId !== tenant.id) { reply.code(403).send({ code: "FORBIDDEN", message: "Esta conta não pertence a este estabelecimento." }); return null; }
  const [membership] = await database.db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, session.userId))).limit(1);
  if (!membership || !canManageTenant(membership.role)) { reply.code(403).send({ code: "FORBIDDEN", message: "Seu perfil não pode administrar este estabelecimento." }); return null; }
  return { tenant, session: { ...session, role: membership.role } };
}

function addCorsHeaders(request: { headers: Record<string, string | string[] | undefined> }, reply: { header: (name: string, value: string) => void }) {
  const origin = request.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && (allowed.includes("*") || allowed.includes(origin as string))) reply.header("Access-Control-Allow-Origin", origin as string);
  reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  reply.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, OPTIONS");
  reply.header("Vary", "Origin");
}

app.addHook("onRequest", async (request, reply) => { addCorsHeaders(request, reply); });
app.addHook("onSend", async (_request, reply, payload) => { reply.header("X-Agenda-Contract-Version", CONTRACT_VERSION); return payload; });
app.options("/*", async (_request, reply) => reply.code(204).send());

app.get("/health", async () => ({ status: "ok", service: "agenda-api", contractVersion: CONTRACT_VERSION, persistence: database ? "configured" : "missing_DATABASE_URL" }));

app.get<{ Params: { slug: string } }>("/v1/public/:slug/catalog", async (request, reply) => {
  if (!database) return reply.code(503).send({ code: "PERSISTENCE_NOT_CONFIGURED", message: "Configure DATABASE_URL para carregar o catálogo." });
  const tenant = await findTenant(request.params.slug);
  if (!tenant) return reply.code(404).send({ code: "NOT_FOUND", message: "Estabelecimento não encontrado." });
  const [serviceRows, staffRows, linkRows, scheduleRows] = await Promise.all([
    database.db.select().from(services).where(and(eq(services.tenantId, tenant.id), eq(services.active, true))),
    database.db.select().from(staff).where(and(eq(staff.tenantId, tenant.id), eq(staff.active, true))),
    database.db.select().from(staffServices),
    database.db.select({ staffId: workingHours.staffId, weekday: workingHours.weekday, startsAt: workingHours.startsAt, endsAt: workingHours.endsAt }).from(workingHours).where(and(eq(workingHours.tenantId, tenant.id), eq(workingHours.active, true)))
  ]);
  const staffIds = new Set(staffRows.map((item) => item.id));
  return reply.send({ tenant: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone }, services: serviceRows.map((item) => ({ id: item.id, name: item.name, description: item.description, durationMinutes: item.durationMinutes, bufferMinutes: item.bufferMinutes, price: item.priceCents === null ? undefined : item.priceCents / 100 })), staff: staffRows.map((item) => ({ id: item.id, name: item.name, role: item.role, serviceIds: linkRows.filter((link) => link.staffId === item.id && serviceRows.some((service) => service.id === link.serviceId)).map((link) => link.serviceId) })), workingHours: scheduleRows.filter((item) => staffIds.has(item.staffId)) });
});

app.post<{ Body: unknown }>("/v1/auth/login", async (request, reply) => {
  if (!database || !process.env.SESSION_SECRET) return reply.code(503).send({ code: "AUTH_NOT_CONFIGURED", message: "Configure DATABASE_URL e SESSION_SECRET para entrar no painel." });
  const address = bookingClientAddress(request.ip, request.headers["x-real-ip"], request.headers["x-forwarded-for"], Boolean(process.env.VERCEL));
  const ipHash = address && loginClientIpHash(address, process.env.SESSION_SECRET);
  if (!ipHash) return reply.code(503).send({ code: "AUTH_PROTECTION_NOT_CONFIGURED", message: "A proteção de acesso não está configurada." });
  if (!isLoginInput(request.body)) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Informe estabelecimento, e-mail e senha." });
  let tenant;
  try {
    tenant = await findTenant(request.body.tenantSlug);
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ code: "AUTH_PROTECTION_UNAVAILABLE", message: "Não foi possível validar o limite de acesso." });
  }
  if (!tenant) return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "E-mail, senha ou estabelecimento inválidos." });
  const window = bookingRateWindow(Date.now());
  let countedAttempt;
  try {
    [countedAttempt] = await database.db.insert(bookingRateLimits).values({ tenantId: tenant.id, ipHash, windowStartedAt: new Date(window.startedAtMs), attempts: 1 }).onConflictDoUpdate({
      target: [bookingRateLimits.tenantId, bookingRateLimits.ipHash, bookingRateLimits.windowStartedAt],
      set: { attempts: sql`${bookingRateLimits.attempts} + 1` },
      setWhere: lt(bookingRateLimits.attempts, RATE_LIMIT_MAX_ATTEMPTS)
    }).returning({ attempts: bookingRateLimits.attempts });
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ code: "AUTH_PROTECTION_UNAVAILABLE", message: "Não foi possível validar o limite de acesso." });
  }
  if (!countedAttempt) {
    reply.header("Retry-After", String(window.retryAfterSeconds));
    return reply.code(429).send({ code: "AUTH_RATE_LIMITED", message: "Limite de tentativas atingido. Tente novamente após o período indicado." });
  }
  const rows = await database.db.select({ id: users.id, email: users.email, displayName: users.displayName, passwordHash: users.passwordHash, tenantId: memberships.tenantId, role: memberships.role }).from(users).innerJoin(memberships, eq(memberships.userId, users.id)).where(and(eq(users.email, request.body.email.trim().toLowerCase()), eq(memberships.tenantId, tenant.id))).limit(1);
  const account = rows[0];
  if (!account || !verifyPassword(request.body.password, account.passwordHash)) return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "E-mail, senha ou estabelecimento inválidos." });
  const token = signSession({ userId: account.id, tenantId: account.tenantId, role: account.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 });
  return reply.send({ token, user: { email: account.email, displayName: account.displayName, role: account.role }, tenant: { slug: tenant.slug, name: tenant.name } });
});

app.post<{ Params: { slug: string } }>("/v1/owner/:slug/mobile-pairings", async (request, reply) => {
  const access = await ownerTenant(request, reply);
  if (!access || !database) return;
  const code = createMobilePairingCode();
  const expiresAt = new Date(Date.now() + MOBILE_PAIRING_TTL_MS);
  try {
    const pairing = await database.db.transaction(async (tx) => {
      await tx.delete(mobilePairingCodes).where(lt(mobilePairingCodes.expiresAt, new Date()));
      const [created] = await tx.insert(mobilePairingCodes).values({
        tenantId: access.tenant.id,
        createdByUserId: access.session.userId,
        codeHash: hashMobilePairingCode(code)!,
        expiresAt
      }).returning({ id: mobilePairingCodes.id });
      await tx.insert(auditEvents).values({
        tenantId: access.tenant.id,
        actorUserId: access.session.userId,
        action: "mobile.pairing_code.created",
        entityType: "mobile_pairing_code",
        entityId: created.id,
        metadata: { expiresAt: expiresAt.toISOString() }
      });
      return created;
    });
    return reply.code(201).send({ code: formatMobilePairingCode(code), expiresAt: expiresAt.toISOString(), tenant: { slug: access.tenant.slug, name: access.tenant.name } });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ code: "PAIRING_CODE_CREATE_FAILED", message: "Não foi possível gerar o código de conexão." });
  }
});

app.post<{ Body: unknown }>("/v1/mobile/pair", async (request, reply) => {
  if (!database || !process.env.SESSION_SECRET) return reply.code(503).send({ code: "PAIRING_NOT_CONFIGURED", message: "Configure DATABASE_URL e SESSION_SECRET para conectar o aplicativo." });
  const address = bookingClientAddress(request.ip, request.headers["x-real-ip"], request.headers["x-forwarded-for"], Boolean(process.env.VERCEL));
  const ipHash = address && mobilePairClientIpHash(address, process.env.SESSION_SECRET);
  if (!ipHash) return reply.code(503).send({ code: "PAIRING_PROTECTION_NOT_CONFIGURED", message: "A proteção de conexão não está configurada." });
  const window = bookingRateWindow(Date.now());
  let countedAttempt;
  try {
    await database.db.delete(mobilePairRateLimits).where(lt(mobilePairRateLimits.windowStartedAt, new Date(window.startedAtMs)));
    await database.db.delete(mobilePairingCodes).where(lt(mobilePairingCodes.expiresAt, new Date()));
    [countedAttempt] = await database.db.insert(mobilePairRateLimits).values({ ipHash, windowStartedAt: new Date(window.startedAtMs), attempts: 1 }).onConflictDoUpdate({
      target: [mobilePairRateLimits.ipHash, mobilePairRateLimits.windowStartedAt],
      set: { attempts: sql`${mobilePairRateLimits.attempts} + 1` },
      setWhere: lt(mobilePairRateLimits.attempts, RATE_LIMIT_MAX_ATTEMPTS)
    }).returning({ attempts: mobilePairRateLimits.attempts });
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ code: "PAIRING_PROTECTION_UNAVAILABLE", message: "Não foi possível validar o limite de conexões." });
  }
  if (!countedAttempt) {
    reply.header("Retry-After", String(window.retryAfterSeconds));
    return reply.code(429).send({ code: "PAIRING_RATE_LIMITED", message: "Limite de tentativas atingido. Tente novamente após o período indicado." });
  }
  const codeHash = hashMobilePairingCode((request.body as { code?: unknown } | null)?.code);
  if (!codeHash) return reply.code(401).send({ code: "INVALID_PAIRING_CODE", message: "Código inválido ou expirado." });

  try {
    const paired = await database.db.transaction(async (tx) => {
      const now = new Date();
      const [pairing] = await tx.select({ id: mobilePairingCodes.id, tenantId: mobilePairingCodes.tenantId, createdByUserId: mobilePairingCodes.createdByUserId })
        .from(mobilePairingCodes)
        .where(and(eq(mobilePairingCodes.codeHash, codeHash), gt(mobilePairingCodes.expiresAt, now)))
        .limit(1).for("update");
      if (!pairing) return null;
      await tx.delete(mobilePairingCodes).where(eq(mobilePairingCodes.id, pairing.id));
      const [account] = await tx.select({ id: users.id, email: users.email, displayName: users.displayName, role: memberships.role })
        .from(users).innerJoin(memberships, eq(memberships.userId, users.id))
        .where(and(eq(users.id, pairing.createdByUserId), eq(memberships.tenantId, pairing.tenantId))).limit(1);
      if (!account || !canManageTenant(account.role)) return null;
      const [tenant] = await tx.select({ id: tenants.id, slug: tenants.slug, name: tenants.name, timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, pairing.tenantId)).limit(1);
      if (!tenant) return null;
      await tx.insert(auditEvents).values({
        tenantId: pairing.tenantId,
        actorUserId: pairing.createdByUserId,
        action: "mobile.pairing_code.consumed",
        entityType: "mobile_pairing_code",
        entityId: pairing.id,
        metadata: { paired: true }
      });
      return { account, tenant };
    });
    if (!paired) return reply.code(401).send({ code: "INVALID_PAIRING_CODE", message: "Código inválido ou expirado." });
    const token = signSession({ userId: paired.account.id, tenantId: paired.tenant.id, role: paired.account.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 });
  return reply.send({ token, user: { email: paired.account.email, displayName: paired.account.displayName, role: paired.account.role }, tenant: { slug: paired.tenant.slug, name: paired.tenant.name, timezone: paired.tenant.timezone } });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ code: "PAIRING_FAILED", message: "Não foi possível conectar o aplicativo." });
  }
});

app.get<{ Params: { slug: string }; Querystring: { date?: string; month?: string } }>("/v1/owner/:slug/appointments", async (request, reply) => {
  const access = await ownerTenant(request, reply);
  if (!access || !database) return;
  if (request.query.date && request.query.month) return reply.code(400).send({ code: "INVALID_DATE", message: "Escolha um dia ou um mês para consultar." });
  let dateBounds = request.query.date ? localDateBounds(request.query.date, access.tenant.timezone) : null;
  if (request.query.month) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(request.query.month);
    if (match) {
      const start = localDateBounds(`${request.query.month}-01`, access.tenant.timezone);
      const nextMonth = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1)).toISOString().slice(0, 10);
      const end = localDateBounds(nextMonth, access.tenant.timezone);
      if (start && end) dateBounds = { startsAt: start.startsAt, endsAt: end.startsAt };
    }
  }
  if ((request.query.date || request.query.month) && !dateBounds) return reply.code(400).send({ code: "INVALID_DATE", message: "Informe um dia ou mês válido no fuso do estabelecimento." });
  const filters = [eq(appointments.tenantId, access.tenant.id), inArray(appointments.status, ["pending", "confirmed", "completed", "no_show"] as const)];
  if (dateBounds) filters.push(gte(appointments.startsAt, dateBounds.startsAt), lt(appointments.startsAt, dateBounds.endsAt));
  const rows = await database.db.select({ id: appointments.id, readableNumber: appointments.readableNumber, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status, serviceName: appointments.serviceNameSnapshot, customerName: customers.name, customerEmail: customers.email, customerPhone: customers.phone, whatsappOptIn: appointments.whatsappOptIn, staffName: staff.name }).from(appointments).innerJoin(customers, eq(customers.id, appointments.customerId)).innerJoin(staff, eq(staff.id, appointments.staffId)).where(and(...filters));
  return reply.send({ appointments: rows });
});

app.patch<{ Params: { slug: string; id: string }; Body: unknown }>("/v1/owner/:slug/appointments/:id", async (request, reply) => {
  const access = await ownerTenant(request, reply);
  if (!access || !database) return;
  const body = request.body;
  if (!isStatusInput(body)) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Status inválido." });
  const [appointment] = await database.db.select({ id: appointments.id, status: appointments.status }).from(appointments).where(and(eq(appointments.id, request.params.id), eq(appointments.tenantId, access.tenant.id))).limit(1);
  if (!appointment) return reply.code(404).send({ code: "NOT_FOUND", message: "Agendamento não encontrado." });
  const canChange = appointment.status === "pending"
    ? body.status === "confirmed" || body.status === "cancelled"
    : appointment.status === "confirmed" && (body.status === "cancelled" || body.status === "completed" || body.status === "no_show");
  if (!canChange) return reply.code(409).send({ code: "INVALID_STATUS_TRANSITION", message: "Este agendamento já foi atualizado." });
  const [updated] = await database.db.transaction(async (tx) => {
    const result = await tx.update(appointments).set({ status: body.status }).where(and(eq(appointments.id, appointment.id), eq(appointments.tenantId, access.tenant.id), eq(appointments.status, appointment.status))).returning({ id: appointments.id, status: appointments.status });
    if (!result[0]) return [];
    await tx.insert(appointmentEvents).values({ tenantId: access.tenant.id, appointmentId: appointment.id, type: "status_changed", payload: { from: appointment.status, to: body.status, actorUserId: access.session.userId } });
    await tx.insert(auditEvents).values({ tenantId: access.tenant.id, actorUserId: access.session.userId, action: "appointment.status_changed", entityType: "appointment", entityId: appointment.id, metadata: { from: appointment.status, to: body.status } });
    if (body.status === "cancelled") await tx.insert(notificationOutbox).values({ tenantId: access.tenant.id, appointmentId: appointment.id, kind: "appointment.cancelled", payload: { appointmentId: appointment.id } });
    return result;
  });
  if (!updated) return reply.code(409).send({ code: "INVALID_STATUS_TRANSITION", message: "Este agendamento já foi atualizado." });
  return reply.send({ appointment: updated });
});

app.get<{ Params: { slug: string } }>("/v1/owner/:slug/services", async (request, reply) => {
  const access = await ownerTenant(request, reply);
  if (!access || !database) return;
  const serviceRows = await database.db.select({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, bufferMinutes: services.bufferMinutes, priceCents: services.priceCents, active: services.active }).from(services).where(eq(services.tenantId, access.tenant.id));
  const staffRows = await database.db.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.tenantId, access.tenant.id), eq(staff.active, true)));
  const serviceIds = serviceRows.map((item) => item.id);
  const links = serviceIds.length ? await database.db.select({ serviceId: staffServices.serviceId, staffId: staffServices.staffId }).from(staffServices).where(inArray(staffServices.serviceId, serviceIds)) : [];
  return reply.send({ services: serviceRows.map((item) => ({ ...item, staffIds: links.filter((link) => link.serviceId === item.id).map((link) => link.staffId) })), staff: staffRows });
});

app.post<{ Params: { slug: string }; Body: unknown }>("/v1/owner/:slug/services", async (request, reply) => {
  const access = await ownerTenant(request, reply);
  if (!access || !database) return;
  const input = parseServiceSettings(request.body);
  if (!input) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Revise os dados do serviço e selecione ao menos um profissional ativo." });
  const assignedStaff = input.staffIds.length ? await database.db.select({ id: staff.id }).from(staff)
    .where(and(eq(staff.tenantId, access.tenant.id), eq(staff.active, true), inArray(staff.id, input.staffIds))) : [];
  if (assignedStaff.length !== input.staffIds.length) return reply.code(400).send({ code: "INVALID_STAFF", message: "Selecione somente profissionais ativos deste estabelecimento." });
  try {
    const created = await database.db.transaction(async (tx) => {
      const [service] = await tx.insert(services).values({
        tenantId: access.tenant.id,
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        priceCents: input.priceCents,
        active: input.active
      }).returning({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, bufferMinutes: services.bufferMinutes, priceCents: services.priceCents, active: services.active });
      if (input.staffIds.length) await tx.insert(staffServices).values(input.staffIds.map((staffId) => ({ serviceId: service.id, staffId })));
      await tx.insert(auditEvents).values({
        tenantId: access.tenant.id,
        actorUserId: access.session.userId,
        action: "service.created",
        entityType: "service",
        entityId: service.id,
        metadata: { name: service.name, description: service.description, durationMinutes: service.durationMinutes, bufferMinutes: service.bufferMinutes, priceCents: service.priceCents, active: service.active, staffIds: input.staffIds }
      });
      return service;
    });
    return reply.code(201).send({ service: { ...created, staffIds: input.staffIds } });
  } catch (error) {
    if (isUniqueViolation(error)) return reply.code(409).send({ code: "SERVICE_NAME_EXISTS", message: "Já existe um serviço com esse nome." });
    request.log.error(error);
    return reply.code(500).send({ code: "SERVICE_SAVE_FAILED", message: "Não foi possível salvar o serviço." });
  }
});

app.put<{ Params: { slug: string; id: string }; Body: unknown }>("/v1/owner/:slug/services/:id", async (request, reply) => {
  const access = await ownerTenant(request, reply);
  if (!access || !database) return;
  if (!isUuid(request.params.id)) return reply.code(400).send({ code: "INVALID_ID", message: "Serviço inválido." });
  const input = parseServiceSettings(request.body);
  if (!input) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Revise os dados do serviço e selecione ao menos um profissional ativo." });
  const assignedStaff = input.staffIds.length ? await database.db.select({ id: staff.id }).from(staff)
    .where(and(eq(staff.tenantId, access.tenant.id), eq(staff.active, true), inArray(staff.id, input.staffIds))) : [];
  if (assignedStaff.length !== input.staffIds.length) return reply.code(400).send({ code: "INVALID_STAFF", message: "Selecione somente profissionais ativos deste estabelecimento." });
  try {
    const updated = await database.db.transaction(async (tx) => {
      const [before] = await tx.select({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, bufferMinutes: services.bufferMinutes, priceCents: services.priceCents, active: services.active }).from(services)
        .where(and(eq(services.id, request.params.id), eq(services.tenantId, access.tenant.id))).limit(1).for("update");
      if (!before) return null;
      const previousStaff = await tx.select({ staffId: staffServices.staffId }).from(staffServices).where(eq(staffServices.serviceId, before.id));
      const [service] = await tx.update(services).set({
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        priceCents: input.priceCents,
        active: input.active
      }).where(and(eq(services.id, before.id), eq(services.tenantId, access.tenant.id)))
        .returning({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, bufferMinutes: services.bufferMinutes, priceCents: services.priceCents, active: services.active });
      await tx.delete(staffServices).where(eq(staffServices.serviceId, before.id));
      if (input.staffIds.length) await tx.insert(staffServices).values(input.staffIds.map((staffId) => ({ serviceId: before.id, staffId })));
      await tx.insert(auditEvents).values({
        tenantId: access.tenant.id,
        actorUserId: access.session.userId,
        action: "service.updated",
        entityType: "service",
        entityId: before.id,
        metadata: {
          before: { name: before.name, description: before.description, durationMinutes: before.durationMinutes, bufferMinutes: before.bufferMinutes, priceCents: before.priceCents, active: before.active, staffIds: previousStaff.map((item) => item.staffId) },
          after: { name: service.name, description: service.description, durationMinutes: service.durationMinutes, bufferMinutes: service.bufferMinutes, priceCents: service.priceCents, active: service.active, staffIds: input.staffIds }
        }
      });
      return service;
    });
    if (!updated) return reply.code(404).send({ code: "NOT_FOUND", message: "Serviço não encontrado." });
    return reply.send({ service: { ...updated, staffIds: input.staffIds } });
  } catch (error) {
    if (isUniqueViolation(error)) return reply.code(409).send({ code: "SERVICE_NAME_EXISTS", message: "Já existe um serviço com esse nome." });
    request.log.error(error);
    return reply.code(500).send({ code: "SERVICE_SAVE_FAILED", message: "Não foi possível salvar o serviço." });
  }
});

app.get<{ Params: { slug: string }; Querystring: { staffId?: string } }>("/v1/public/:slug/appointments", async (request, reply) => {
  if (!database) return reply.code(503).send({ code: "PERSISTENCE_NOT_CONFIGURED", message: "Configure DATABASE_URL para usar agendamentos online." });
  const tenant = await findTenant(request.params.slug);
  if (!tenant || !request.query.staffId) return reply.code(404).send({ code: "NOT_FOUND", message: "Estabelecimento ou profissional não encontrado." });
  const professional = await database.db.select({ id: staff.id }).from(staff).where(and(eq(staff.id, request.query.staffId), eq(staff.tenantId, tenant.id), eq(staff.active, true))).limit(1);
  if (!professional[0]) return reply.code(404).send({ code: "NOT_FOUND", message: "Profissional não encontrado." });
  const rows = await database.db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status }).from(appointments).where(and(eq(appointments.tenantId, tenant.id), eq(appointments.staffId, request.query.staffId), inArray(appointments.status, [...activeStatuses])));
  return reply.send({ appointments: rows });
});

app.post<{ Params: { slug: string }; Body: unknown }>("/v1/public/:slug/appointments", async (request, reply) => {
  if (!database) return reply.code(503).send({ code: "PERSISTENCE_NOT_CONFIGURED", message: "Configure DATABASE_URL para usar agendamentos online." });
  const address = bookingClientAddress(request.ip, request.headers["x-real-ip"], request.headers["x-forwarded-for"], Boolean(process.env.VERCEL));
  const ipHash = address && bookingClientIpHash(address, process.env.SESSION_SECRET);
  if (!ipHash) return reply.code(503).send({ code: "BOOKING_PROTECTION_NOT_CONFIGURED", message: "A proteção de agendamentos não está configurada." });
  const tenant = await findTenant(request.params.slug);
  if (!tenant) return reply.code(404).send({ code: "NOT_FOUND", message: "Estabelecimento não encontrado." });
  const now = Date.now();
  const window = bookingRateWindow(now);
  let countedAttempt;
  try {
    [countedAttempt] = await database.db.insert(bookingRateLimits).values({ tenantId: tenant.id, ipHash, windowStartedAt: new Date(window.startedAtMs), attempts: 1 }).onConflictDoUpdate({
      target: [bookingRateLimits.tenantId, bookingRateLimits.ipHash, bookingRateLimits.windowStartedAt],
      set: { attempts: sql`${bookingRateLimits.attempts} + 1` },
      setWhere: lt(bookingRateLimits.attempts, RATE_LIMIT_MAX_ATTEMPTS)
    }).returning({ attempts: bookingRateLimits.attempts });
  } catch (error) {
    request.log.error(error);
    return reply.code(503).send({ code: "BOOKING_PROTECTION_UNAVAILABLE", message: "Não foi possível validar o limite de agendamentos." });
  }
  if (!countedAttempt) {
    reply.header("Retry-After", String(window.retryAfterSeconds));
    return reply.code(429).send({ code: "BOOKING_RATE_LIMITED", message: "Limite de tentativas atingido. Tente novamente após o período indicado." });
  }
  const body = request.body;
  if (!isCreateAppointment(body)) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Dados inválidos." });
  const key = idempotencyHeader(request.headers["idempotency-key"]);
  if (!key || key.length > 200) return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Envie um Idempotency-Key válido." });
  const serviceRows = await database.db.select().from(services).where(and(eq(services.id, body.serviceId), eq(services.tenantId, tenant.id), eq(services.active, true))).limit(1);
  const staffRows = await database.db.select().from(staff).where(and(eq(staff.id, body.staffId), eq(staff.tenantId, tenant.id), eq(staff.active, true))).limit(1);
  const service = serviceRows[0];
  const professional = staffRows[0];
  if (!service || !professional) return reply.code(404).send({ code: "NOT_FOUND", message: "Serviço ou profissional não encontrado." });
  const link = await database.db.select({ staffId: staffServices.staffId }).from(staffServices).where(and(eq(staffServices.staffId, professional.id), eq(staffServices.serviceId, service.id))).limit(1);
  if (!link[0]) return reply.code(409).send({ code: "SERVICE_NOT_AVAILABLE", message: "Este profissional não realiza o serviço escolhido." });
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return reply.code(400).send({ code: "INVALID_START", message: "Escolha um horário futuro válido." });
  const endsAt = new Date(startsAt.getTime() + (service.durationMinutes + service.bufferMinutes) * 60_000);
  let local;
  try { local = localParts(startsAt, tenant.timezone); } catch (error) { if (error instanceof HttpError) return reply.code(error.statusCode).send(error.payload); throw error; }
  const schedules = await database.db.select({ startsAt: workingHours.startsAt, endsAt: workingHours.endsAt }).from(workingHours).where(and(eq(workingHours.tenantId, tenant.id), eq(workingHours.staffId, professional.id), eq(workingHours.weekday, local.weekday), eq(workingHours.active, true)));
  if (!schedules.some((schedule) => local.minute >= minutes(schedule.startsAt) && local.minute + service.durationMinutes + service.bufferMinutes <= minutes(schedule.endsAt))) return reply.code(409).send({ code: "SLOT_UNAVAILABLE", message: "Esse horário está fora da jornada do profissional." });
  const requestHash = hashRequest(body);
  try {
    const result = await database.db.transaction(async (tx) => {
      const existing = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.tenantId, tenant.id), eq(idempotencyKeys.key, key))).limit(1);
      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) throw new HttpError(409, { code: "IDEMPOTENCY_CONFLICT", message: "A chave já foi usada para outra reserva." });
        return { response: existing[0].response as AppointmentResponse, replay: true };
      }
      const insertedKey = await tx.insert(idempotencyKeys).values({ tenantId: tenant.id, key, requestHash, response: {} }).onConflictDoNothing().returning({ id: idempotencyKeys.id });
      if (!insertedKey[0]) {
        const concurrent = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.tenantId, tenant.id), eq(idempotencyKeys.key, key))).limit(1);
        if (concurrent[0]?.requestHash !== requestHash) throw new HttpError(409, { code: "IDEMPOTENCY_CONFLICT", message: "A chave já foi usada para outra reserva." });
        if (concurrent[0]?.response && Object.keys(concurrent[0].response as object).length) return { response: concurrent[0].response as AppointmentResponse, replay: true };
        throw new HttpError(409, { code: "IDEMPOTENCY_IN_PROGRESS", message: "A reserva está sendo processada. Tente novamente." });
      }
      const [timeOffConflict] = await tx.select({ id: timeOff.id }).from(timeOff).where(and(eq(timeOff.tenantId, tenant.id), eq(timeOff.staffId, professional.id), lt(timeOff.startsAt, endsAt), gt(timeOff.endsAt, startsAt))).limit(1);
      if (timeOffConflict) unavailable("Esse horário está bloqueado na agenda.");
      const [appointmentConflict] = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.tenantId, tenant.id), eq(appointments.staffId, professional.id), inArray(appointments.status, [...activeStatuses]), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))).limit(1);
      if (appointmentConflict) unavailable("Esse horário acabou de ser ocupado.");
      const [customer] = await tx.insert(customers).values({ tenantId: tenant.id, name: body.customerName.trim(), email: body.customerEmail.trim().toLowerCase(), phone: body.customerPhone.trim() }).onConflictDoUpdate({ target: [customers.tenantId, customers.phone], set: { name: body.customerName.trim(), email: body.customerEmail.trim().toLowerCase() } }).returning({ id: customers.id });
      const manageToken = randomBytes(24).toString("base64url");
      const readableNumber = `A-${randomBytes(4).toString("hex").toUpperCase()}`;
      const [appointment] = await tx.insert(appointments).values({ tenantId: tenant.id, customerId: customer.id, staffId: professional.id, serviceId: service.id, serviceNameSnapshot: service.name, durationMinutesSnapshot: service.durationMinutes, startsAt, endsAt, status: "pending", origin: "public", whatsappOptIn: body.whatsappOptIn === true, manageTokenHash: createHash("sha256").update(manageToken).digest("hex"), manageTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), readableNumber }).returning({ id: appointments.id, readableNumber: appointments.readableNumber, status: appointments.status, startsAt: appointments.startsAt, endsAt: appointments.endsAt });
      await tx.insert(appointmentEvents).values({ tenantId: tenant.id, appointmentId: appointment.id, type: "created", payload: { origin: "public" } });
      await tx.insert(notificationOutbox).values({ tenantId: tenant.id, appointmentId: appointment.id, kind: "appointment.created", payload: { appointmentId: appointment.id, readableNumber: appointment.readableNumber } });
      const response: AppointmentResponse = { appointment: { readableNumber: appointment.readableNumber, status: appointment.status, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt.toISOString() }, manageToken };
      await tx.update(idempotencyKeys).set({ response }).where(eq(idempotencyKeys.id, insertedKey[0].id));
      return { response, replay: false };
    });
    return reply.code(result.replay ? 200 : 201).send(result.response);
  } catch (error) {
    if (error instanceof HttpError) return reply.code(error.statusCode).send(error.payload);
    const code = (error as { code?: string }).code;
    if (code === "23P01" || code === "23505") return reply.code(409).send({ code: "SLOT_UNAVAILABLE", message: "Esse horário acabou de ser ocupado." });
    request.log.error(error);
    return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Não foi possível concluir o agendamento." });
  }
});

if (!process.env.VERCEL) app.listen({ port: Number(process.env.PORT ?? 3333), host: process.env.HOST ?? "0.0.0.0" }).catch((error) => { app.log.error(error); process.exit(1); });

import Fastify, { type FastifyRequest } from "fastify";

const app = Fastify({ logger: true, bodyLimit: 16_000, trustProxy: false });
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? "https://localhost")
  .split(",").map((origin) => origin.trim()).filter(Boolean));

type CreateAppointment = {
  serviceId?: unknown;
  staffId?: unknown;
  startsAt?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerPhone?: unknown;
  whatsappOptIn?: unknown;
};

function isCreateAppointment(input: unknown): input is CreateAppointment {
  if (!input || typeof input !== "object") return false;
  const value = input as CreateAppointment;
  return typeof value.serviceId === "string" && /^[0-9a-f-]{36}$/i.test(value.serviceId)
    && typeof value.staffId === "string" && /^[0-9a-f-]{36}$/i.test(value.staffId)
    && typeof value.startsAt === "string" && !Number.isNaN(Date.parse(value.startsAt))
    && typeof value.customerName === "string" && value.customerName.trim().length >= 2 && value.customerName.length <= 100
    && typeof value.customerEmail === "string" && value.customerEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.customerEmail.trim())
    && typeof value.customerPhone === "string" && value.customerPhone.trim().length >= 8 && value.customerPhone.length <= 20
    && (value.whatsappOptIn === undefined || typeof value.whatsappOptIn === "boolean");
}

function supabaseConfig() {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!base || !key) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return { base: url.origin, key };
  } catch { return null; }
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const config = supabaseConfig();
  if (!config) throw Object.assign(new Error("DATABASE_NOT_CONFIGURED"), { code: "DATABASE_NOT_CONFIGURED" });
  const response = await fetch(new URL(path, `${config.base}/`), {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : typeof data?.hint === "string" ? data.hint : "DATABASE_REQUEST_FAILED";
    throw Object.assign(new Error(message), { code: data?.code ?? "DATABASE_REQUEST_FAILED", status: response.status });
  }
  return data;
}

function errorResponse(error: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const value = error as { code?: string; message?: string };
  const code = value?.message ?? value?.code ?? "INTERNAL_ERROR";
  if (code === "DATABASE_NOT_CONFIGURED") return reply.code(503).send({ code, message: "A agenda está sendo configurada. Tente novamente mais tarde." });
  if (code === "TENANT_NOT_FOUND" || code === "P0002") return reply.code(404).send({ code: "TENANT_NOT_FOUND", message: "Estabelecimento não encontrado ou indisponível." });
  if (code === "SLOT_UNAVAILABLE" || value?.code === "23P01") return reply.code(409).send({ code: "SLOT_UNAVAILABLE", message: "Este horário acabou de ser ocupado. Escolha outro." });
  if (["VALIDATION_ERROR", "INVALID_SERVICE", "INVALID_STAFF_SERVICE", "SERVICE_OR_STAFF_UNAVAILABLE", "INVALID_START_TIME", "OUTSIDE_WORKING_HOURS", "PAST_APPOINTMENT", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_REUSED", "INVALID_STAFF"].includes(code) || value?.code === "22023" || value?.code === "23505") {
    return reply.code(400).send({ code: code === "23505" ? "IDEMPOTENCY_KEY_REUSED" : code, message: "Confira os dados e o horário escolhido e tente novamente." });
  }
  app.log.error({ err: error }, "Agenda API request failed");
  return reply.code(502).send({ code: "AGENDA_UNAVAILABLE", message: "Não foi possível acessar a agenda agora. Tente novamente." });
}

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key");
    reply.header("Access-Control-Max-Age", "600");
  }
  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) return reply.code(403).send();
    return reply.code(204).send();
  }
});

app.get("/health", async () => ({
  status: "ok",
  service: "agenda-api",
  persistence: supabaseConfig() ? "configured" : "not_configured",
}));

app.get("/v1/public/:slug/catalog", async (request, reply) => {
  const { slug } = request.params as { slug: string };
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) return reply.code(400).send({ code: "INVALID_TENANT", message: "Estabelecimento inválido." });
  try {
    const data = await supabaseFetch("rest/v1/rpc/get_public_catalog", {
      method: "POST",
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!data) return reply.code(404).send({ code: "TENANT_NOT_FOUND", message: "Estabelecimento não encontrado." });
    return reply.header("Cache-Control", "no-store").send(data);
  } catch (error) { return errorResponse(error, reply); }
});

app.get("/v1/public/:slug/appointments", async (request, reply) => {
  const { slug } = request.params as { slug: string };
  const query = request.query as { staffId?: string; date?: string };
  if (!/^[a-z0-9-]{2,50}$/.test(slug) || !query.staffId || !/^[0-9a-f-]{36}$/i.test(query.staffId) || !query.date || !/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
    return reply.code(400).send({ code: "INVALID_QUERY", message: "Escolha um profissional e uma data válidos." });
  }
  try {
    const data = await supabaseFetch("rest/v1/rpc/get_public_appointments", {
      method: "POST",
      body: JSON.stringify({ p_slug: slug, p_staff_id: query.staffId, p_date: query.date }),
    });
    if (!data) return reply.code(404).send({ code: "TENANT_NOT_FOUND", message: "Estabelecimento não encontrado." });
    return reply.header("Cache-Control", "no-store").send(data);
  } catch (error) { return errorResponse(error, reply); }
});

app.post("/v1/public/:slug/appointments", async (request: FastifyRequest, reply) => {
  const { slug } = request.params as { slug: string };
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) return reply.code(400).send({ code: "INVALID_TENANT", message: "Estabelecimento inválido." });
  if (!isCreateAppointment(request.body)) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Nome, e-mail, telefone, serviço, profissional e horário são obrigatórios." });
  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "Atualize a página e tente novamente." });
  }
  const body = request.body;
  try {
    const data = await supabaseFetch("rest/v1/rpc/create_public_appointment", {
      method: "POST",
      body: JSON.stringify({
        p_slug: slug,
        p_service_id: body.serviceId,
        p_staff_id: body.staffId,
        p_starts_at: body.startsAt,
        p_customer_name: body.customerName,
        p_customer_email: body.customerEmail,
        p_customer_phone: body.customerPhone,
        p_whatsapp_opt_in: body.whatsappOptIn === true,
        p_idempotency_key: idempotencyKey,
      }),
    });
    return reply.code(201).header("Cache-Control", "no-store").send({ appointment: data });
  } catch (error) { return errorResponse(error, reply); }
});


type OwnerContext = { userId: string; tenantId: string; role: "owner" | "admin" | "staff"; token: string };
async function ownerContext(request: FastifyRequest, slug: string): Promise<OwnerContext | null> {
  const auth = request.headers.authorization;
  if (!/^[a-z0-9-]{2,50}$/.test(slug) || !auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token || token.length > 8192) return null;
  const config = supabaseConfig();
  if (!config) throw Object.assign(new Error("DATABASE_NOT_CONFIGURED"), { code: "DATABASE_NOT_CONFIGURED" });
  const res = await fetch(new URL("auth/v1/user", `${config.base}/`), {
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null) as { id?: string } | null;
  if (!user?.id) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const tenants = await supabaseFetch(`rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=id&limit=1`, { headers });
  const tenant = Array.isArray(tenants) ? tenants[0] as { id?: string } : undefined;
  if (!tenant?.id) return null;
  const memberships = await supabaseFetch(`rest/v1/tenant_members?tenant_id=eq.${tenant.id}&user_id=eq.${user.id}&select=role&limit=1`, { headers });
  const member = Array.isArray(memberships) ? memberships[0] as { role?: string } : undefined;
  if (!member || !["owner", "admin", "staff"].includes(member.role ?? "")) return null;
  return { userId: user.id, tenantId: tenant.id, role: member.role as OwnerContext["role"], token };
}
const ownerHeaders = (ctx: OwnerContext) => ({ Authorization: `Bearer ${ctx.token}` });

app.get("/v1/owner/:slug/session", async (request, reply) => {
  try {
    const ctx = await ownerContext(request, (request.params as { slug: string }).slug);
    if (!ctx) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Conta não autorizada para esta barbearia." });
    return reply.header("Cache-Control", "no-store").send({ userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role });
  } catch (error) { return errorResponse(error, reply); }
});

app.get("/v1/owner/:slug/catalog", async (request, reply) => {
  try {
    const ctx = await ownerContext(request, (request.params as { slug: string }).slug);
    if (!ctx) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Conta não autorizada para esta barbearia." });
    const headers = ownerHeaders(ctx);
    const [services, staff, workingHours] = await Promise.all([
      supabaseFetch(`rest/v1/services?tenant_id=eq.${ctx.tenantId}&select=id,name,description,duration_minutes,buffer_minutes,price,active&order=name.asc`, { headers }),
      supabaseFetch(`rest/v1/staff?tenant_id=eq.${ctx.tenantId}&select=id,name,active&order=name.asc`, { headers }),
      supabaseFetch(`rest/v1/working_hours?tenant_id=eq.${ctx.tenantId}&select=id,staff_id,weekday,starts_at,ends_at,active&order=weekday.asc,starts_at.asc`, { headers }),
    ]);
    return reply.header("Cache-Control", "no-store").send({ services, staff, workingHours });
  } catch (error) { return errorResponse(error, reply); }
});

app.get("/v1/owner/:slug/appointments", async (request, reply) => {
  const q = request.query as { from?: string; to?: string; status?: string };
  if (!q.from || !q.to || !Number.isFinite(Date.parse(q.from)) || !Number.isFinite(Date.parse(q.to)) || Date.parse(q.from) >= Date.parse(q.to) || Date.parse(q.to) - Date.parse(q.from) > 93 * 86400000)
    return reply.code(400).send({ code: "INVALID_RANGE", message: "Informe um intervalo válido de até 93 dias." });
  if (q.status && !["pending","confirmed","cancelled","completed","no_show"].includes(q.status))
    return reply.code(400).send({ code: "INVALID_STATUS", message: "Filtro de status inválido." });
  try {
    const ctx = await ownerContext(request, (request.params as { slug: string }).slug);
    if (!ctx) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Conta não autorizada para esta barbearia." });
    const filters = [`tenant_id=eq.${ctx.tenantId}`, `starts_at=gte.${encodeURIComponent(q.from)}`, `starts_at=lt.${encodeURIComponent(q.to)}`,
      "select=id,service_id,staff_id,starts_at,ends_at,customer_name,customer_email,customer_phone,status,created_at", "order=starts_at.asc", "limit=1000"];
    if (q.status) filters.push(`status=eq.${q.status}`);
    const appointments = await supabaseFetch(`rest/v1/appointments?${filters.join("&")}`, { headers: ownerHeaders(ctx) });
    return reply.header("Cache-Control", "no-store").send({ appointments });
  } catch (error) { return errorResponse(error, reply); }
});

app.patch("/v1/owner/:slug/appointments/:id", async (request, reply) => {
  const { slug, id } = request.params as { slug: string; id: string };
  const body = request.body as { status?: unknown } | null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !body || !["confirmed","cancelled","completed","no_show"].includes(String(body.status)))
    return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Status ou agendamento inválido." });
  try {
    const ctx = await ownerContext(request, slug);
    if (!ctx) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Conta não autorizada para esta barbearia." });
    const headers = ownerHeaders(ctx);
    const path = `rest/v1/appointments?id=eq.${id}&tenant_id=eq.${ctx.tenantId}`;
    const rows = await supabaseFetch(`${path}&select=id,status&limit=1`, { headers });
    const current = Array.isArray(rows) ? rows[0] as { status?: string } : undefined;
    if (!current) return reply.code(404).send({ code: "APPOINTMENT_NOT_FOUND", message: "Agendamento não encontrado." });
    const transitions: Record<string, string[]> = { pending: ["confirmed","cancelled"], confirmed: ["cancelled","completed","no_show"], cancelled: [], completed: [], no_show: [] };
    if (!transitions[current.status ?? ""]?.includes(String(body.status)))
      return reply.code(409).send({ code: "INVALID_STATUS_TRANSITION", message: "Este agendamento não pode mudar para esse status." });
    const updated = await supabaseFetch(path, { method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify({ status: body.status }) });
    const appointment = Array.isArray(updated) ? updated[0] : undefined;
    if (!appointment) return reply.code(409).send({ code: "UPDATE_CONFLICT", message: "Atualize a agenda e tente novamente." });
    return reply.header("Cache-Control", "no-store").send({ appointment });
  } catch (error) { return errorResponse(error, reply); }
});

app.setErrorHandler((error, _request, reply) => {
  if (error.statusCode === 413) return reply.code(413).send({ code: "PAYLOAD_TOO_LARGE", message: "Os dados enviados são muito grandes." });
  app.log.error({ err: error }, "Unhandled API error");
  return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado." });
});

app.listen({ port: Number(process.env.PORT ?? 3333), host: process.env.HOST ?? "0.0.0.0" })
  .catch((error) => { app.log.error(error); process.exit(1); });

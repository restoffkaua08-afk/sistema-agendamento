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
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

app.setErrorHandler((error, _request, reply) => {
  if (error.statusCode === 413) return reply.code(413).send({ code: "PAYLOAD_TOO_LARGE", message: "Os dados enviados são muito grandes." });
  app.log.error({ err: error }, "Unhandled API error");
  return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado." });
});

app.listen({ port: Number(process.env.PORT ?? 3333), host: process.env.HOST ?? "0.0.0.0" })
  .catch((error) => { app.log.error(error); process.exit(1); });

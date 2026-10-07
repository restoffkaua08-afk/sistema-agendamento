import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const tenants = pgTable("tenants", { id: id(), slug: text("slug").notNull().unique(), name: text("name").notNull(), timezone: text("timezone").notNull().default("America/Sao_Paulo"), config: jsonb("config").notNull().default({}), createdAt: createdAt() }, (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)]);
export const users = pgTable("users", { id: id(), email: text("email").notNull().unique(), passwordHash: text("password_hash").notNull(), displayName: text("display_name").notNull(), createdAt: createdAt() });
export const memberships = pgTable("memberships", { tenantId: uuid("tenant_id").notNull().references(() => tenants.id), userId: uuid("user_id").notNull().references(() => users.id), role: text("role").notNull().default("reception"), createdAt: createdAt() }, (table) => [primaryKey({ columns: [table.tenantId, table.userId] })]);
export const services = pgTable("services", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(), description: text("description").notNull().default(""), durationMinutes: integer("duration_minutes").notNull(), bufferMinutes: integer("buffer_minutes").notNull().default(0), priceCents: integer("price_cents"), active: boolean("active").notNull().default(true), createdAt: createdAt() }, (table) => [uniqueIndex("services_tenant_name_idx").on(table.tenantId, table.name)]);
export const staff = pgTable("staff", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(), role: text("role").notNull().default("professional"), active: boolean("active").notNull().default(true), createdAt: createdAt() });
export const staffServices = pgTable("staff_services", { staffId: uuid("staff_id").notNull().references(() => staff.id), serviceId: uuid("service_id").notNull().references(() => services.id) }, (table) => [primaryKey({ columns: [table.staffId, table.serviceId] })]);
export const workingHours = pgTable("working_hours", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), staffId: uuid("staff_id").notNull().references(() => staff.id), weekday: integer("weekday").notNull(), startsAt: text("starts_at").notNull(), endsAt: text("ends_at").notNull(), active: boolean("active").notNull().default(true) });
export const timeOff = pgTable("time_off", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), staffId: uuid("staff_id").notNull().references(() => staff.id), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), reason: text("reason"), createdAt: createdAt() });
export const customers = pgTable("customers", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), name: text("name").notNull(), email: text("email"), phone: text("phone"), anonymizedAt: timestamp("anonymized_at", { withTimezone: true }), createdAt: createdAt() }, (table) => [uniqueIndex("customers_tenant_phone_idx").on(table.tenantId, table.phone)]);
export const appointments = pgTable("appointments", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), customerId: uuid("customer_id").notNull().references(() => customers.id), staffId: uuid("staff_id").notNull().references(() => staff.id), serviceId: uuid("service_id").notNull().references(() => services.id), serviceNameSnapshot: text("service_name_snapshot").notNull(), durationMinutesSnapshot: integer("duration_minutes_snapshot").notNull(), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }).notNull(), status: text("status").notNull().default("pending"), origin: text("origin").notNull().default("public"), whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false), manageTokenHash: text("manage_token_hash").notNull().unique(), manageTokenExpiresAt: timestamp("manage_token_expires_at", { withTimezone: true }).notNull(), readableNumber: text("readable_number").notNull(), createdAt: createdAt() }, (table) => [uniqueIndex("appointments_tenant_readable_idx").on(table.tenantId, table.readableNumber), index("appointments_staff_time_idx").on(table.staffId, table.startsAt, table.endsAt)]);
export const appointmentEvents = pgTable("appointment_events", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), appointmentId: uuid("appointment_id").notNull().references(() => appointments.id), type: text("type").notNull(), payload: jsonb("payload").notNull().default({}), createdAt: createdAt() });
export const auditEvents = pgTable("audit_events", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), actorUserId: uuid("actor_user_id").references(() => users.id), action: text("action").notNull(), entityType: text("entity_type").notNull(), entityId: uuid("entity_id"), metadata: jsonb("metadata").notNull().default({}), createdAt: createdAt() });
export const notificationOutbox = pgTable("notification_outbox", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), appointmentId: uuid("appointment_id").references(() => appointments.id), kind: text("kind").notNull(), payload: jsonb("payload").notNull().default({}), status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0), availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(), createdAt: createdAt() });
export const idempotencyKeys = pgTable("idempotency_keys", { id: id(), tenantId: uuid("tenant_id").notNull().references(() => tenants.id), key: text("key").notNull(), requestHash: text("request_hash").notNull(), response: jsonb("response").notNull(), createdAt: createdAt() }, (table) => [uniqueIndex("idempotency_keys_tenant_key_idx").on(table.tenantId, table.key)]);
export const bookingRateLimits = pgTable("booking_rate_limits", { tenantId: uuid("tenant_id").notNull().references(() => tenants.id), ipHash: text("ip_hash").notNull(), windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(), attempts: integer("attempts").notNull().default(1) }, (table) => [primaryKey({ columns: [table.tenantId, table.ipHash, table.windowStartedAt] }), check("booking_rate_limits_attempts_check", sql`${table.attempts} BETWEEN 1 AND 5`)]);

export const tenantRelations = relations(tenants, ({ many }) => ({ memberships: many(memberships), services: many(services), staff: many(staff) }));
export const serviceRelations = relations(services, ({ one, many }) => ({ tenant: one(tenants, { fields: [services.tenantId], references: [tenants.id] }), staff: many(staffServices) }));
export const staffRelations = relations(staff, ({ one, many }) => ({ tenant: one(tenants, { fields: [staff.tenantId], references: [tenants.id] }), services: many(staffServices) }));

export const mobilePairingCodes = pgTable("mobile_pairing_codes", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt()
}, (table) => [index("mobile_pairing_codes_expires_at_idx").on(table.expiresAt)]);

export const mobilePairRateLimits = pgTable("mobile_pair_rate_limits", {
  ipHash: text("ip_hash").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(1)
}, (table) => [
  primaryKey({ columns: [table.ipHash, table.windowStartedAt] }),
  index("mobile_pair_rate_limits_window_started_at_idx").on(table.windowStartedAt),
  check("mobile_pair_rate_limits_attempts_check", sql`${table.attempts} BETWEEN 1 AND 5`)
]);

import { and, eq } from "drizzle-orm";
import { hashPassword } from "../auth.js";
import { createDatabase } from "./client.js";
import { memberships, services, staff, staffServices, tenants, users, workingHours } from "./schema.js";

const database = createDatabase();
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };

async function main() {
  if (!database) throw new Error("DATABASE_URL is required");
  const slug = process.env.TENANT_SLUG ?? "marca";
  const name = process.env.TENANT_NAME ?? "Marca";
  const email = required("ADMIN_EMAIL").trim().toLowerCase();
  const password = required("ADMIN_PASSWORD");
  const [createdTenant] = await database.db.insert(tenants).values({ slug, name, timezone: process.env.TENANT_TIMEZONE ?? "America/Sao_Paulo" }).onConflictDoNothing().returning({ id: tenants.id });
  const tenant = createdTenant ?? (await database.db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  if (!tenant) throw new Error("Could not create tenant");
  const [user] = await database.db.insert(users).values({ email, passwordHash: hashPassword(password), displayName: process.env.ADMIN_NAME ?? "Administrador" }).onConflictDoUpdate({ target: users.email, set: { passwordHash: hashPassword(password), displayName: process.env.ADMIN_NAME ?? "Administrador" } }).returning({ id: users.id });
  await database.db.insert(memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" }).onConflictDoNothing();
  const [service] = await database.db.insert(services).values({ tenantId: tenant.id, name: process.env.DEFAULT_SERVICE_NAME ?? "Atendimento", description: "Serviço inicial", durationMinutes: 60, priceCents: 0 }).onConflictDoNothing().returning({ id: services.id });
  const currentService = service ?? (await database.db.select({ id: services.id }).from(services).where(and(eq(services.tenantId, tenant.id), eq(services.name, process.env.DEFAULT_SERVICE_NAME ?? "Atendimento"))).limit(1))[0];
  const staffName = process.env.DEFAULT_STAFF_NAME ?? "Profissional";
  const [createdProfessional] = await database.db.insert(staff).values({ tenantId: tenant.id, name: staffName, role: "professional" }).onConflictDoNothing().returning({ id: staff.id });
  const professional = createdProfessional ?? (await database.db.select({ id: staff.id }).from(staff).where(and(eq(staff.tenantId, tenant.id), eq(staff.name, staffName))).limit(1))[0];
  if (!professional) throw new Error("Could not create professional");
  await database.db.insert(staffServices).values({ staffId: professional.id, serviceId: currentService.id }).onConflictDoNothing();
  for (const [weekday, startsAt, endsAt] of [[1, "09:00", "17:00"], [2, "09:00", "17:00"], [3, "09:00", "17:00"], [4, "09:00", "17:00"], [5, "09:00", "17:00"]] as const) await database.db.insert(workingHours).values({ tenantId: tenant.id, staffId: professional.id, weekday, startsAt, endsAt }).onConflictDoNothing();
  console.log(`Bootstrapped tenant ${slug} with ${email}`);
  await database.client.end();
}

main().catch(async (error) => { console.error(error); if (database) await database.client.end(); process.exitCode = 1; });

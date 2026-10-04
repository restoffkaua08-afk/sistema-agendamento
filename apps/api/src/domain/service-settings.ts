export type ServiceSettingsInput = {
  name: string;
  description: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number | null;
  active: boolean;
  staffIds: string[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const databaseIntegerMax = 2_147_483_647;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function parseServiceSettings(value: unknown): ServiceSettingsInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ServiceSettingsInput>;
  if (typeof input.name !== "string" || typeof input.description !== "string") return null;
  if (typeof input.durationMinutes !== "number" || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 720) return null;
  if (typeof input.bufferMinutes !== "number" || !Number.isInteger(input.bufferMinutes) || input.bufferMinutes < 0 || input.bufferMinutes > 240) return null;
  if (input.priceCents !== null && (typeof input.priceCents !== "number" || !Number.isInteger(input.priceCents) || input.priceCents < 0 || input.priceCents > databaseIntegerMax)) return null;
  if (typeof input.active !== "boolean" || !Array.isArray(input.staffIds)) return null;

  const name = input.name.trim();
  const description = input.description.trim();
  const staffIds = input.staffIds;
  if (!name || name.length > 100 || description.length > 1000) return null;
  if ((input.active && staffIds.length === 0) || staffIds.length > 50 || !staffIds.every((id) => typeof id === "string" && isUuid(id))) return null;
  if (new Set(staffIds).size !== staffIds.length) return null;

  return { name, description, durationMinutes: input.durationMinutes, bufferMinutes: input.bufferMinutes, priceCents: input.priceCents, active: input.active, staffIds: [...staffIds] };
}

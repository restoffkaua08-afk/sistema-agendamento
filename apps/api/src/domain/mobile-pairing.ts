import { createHash, randomBytes } from "node:crypto";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const codeLength = 12;
export const MOBILE_PAIRING_TTL_MS = 10 * 60_000;

export function createMobilePairingCode(): string {
  return Array.from(randomBytes(codeLength), (byte) => alphabet[byte & 31]).join("");
}

export function normalizeMobilePairingCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return new RegExp(`^[${alphabet}]{${codeLength}}$`).test(code) ? code : null;
}

export function hashMobilePairingCode(value: unknown): string | null {
  const code = normalizeMobilePairingCode(value);
  return code ? createHash("sha256").update(code).digest("hex") : null;
}

export function formatMobilePairingCode(value: string): string {
  return value.match(/.{1,4}/g)?.join("-") ?? value;
}

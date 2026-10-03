import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export type Session = { userId: string; tenantId: string; role: string; exp: number };

export const canManageTenant = (role: string) => role === "owner" || role === "manager";

const encode = (value: string) => Buffer.from(value).toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, digest] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function signSession(session: Session, secret = process.env.SESSION_SECRET): string {
  if (!secret) throw new Error("SESSION_SECRET is required");
  const payload = encode(JSON.stringify(session));
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifySession(token: string | undefined, secret = process.env.SESSION_SECRET): Session | null {
  if (!secret || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(decode(payload)) as Session;
    return session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch { return null; }
}


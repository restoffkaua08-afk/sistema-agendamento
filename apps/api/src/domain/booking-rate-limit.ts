import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const BOOKING_RATE_WINDOW_MS = 10 * 60_000;

type HeaderValue = string | string[] | undefined;

function headerValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
}

function validAddress(value: string | undefined): string | null {
  const address = value?.trim();
  return address && isIP(address) ? address.toLowerCase() : null;
}

export function bookingClientAddress(
  requestIp: string | undefined,
  realIpHeader: HeaderValue,
  forwardedForHeader: HeaderValue,
  isVercel: boolean
): string | null {
  if (!isVercel) return validAddress(requestIp);
  const realIp = validAddress(headerValue(realIpHeader));
  if (realIp) return realIp;
  const forwardedFor = Array.isArray(forwardedForHeader) ? forwardedForHeader.join(",") : forwardedForHeader;
  const chain = forwardedFor?.split(",");
  return validAddress(chain?.[chain.length - 1]);
}

export function scopedClientIpHash(scope: "booking" | "login" | "mobile-pair", address: string, sessionSecret: string | undefined): string | null {
  if (!sessionSecret?.trim()) return null;
  return createHmac("sha256", sessionSecret).update(`${scope}\0${address}`).digest("hex");
}

export function bookingClientIpHash(address: string, sessionSecret: string | undefined): string | null {
  return scopedClientIpHash("booking", address, sessionSecret);
}

export function loginClientIpHash(address: string, sessionSecret: string | undefined): string | null {
  return scopedClientIpHash("login", address, sessionSecret);
}

export function mobilePairClientIpHash(address: string, sessionSecret: string | undefined): string | null {
  return scopedClientIpHash("mobile-pair", address, sessionSecret);
}

export function bookingRateWindow(nowMs: number): { startedAtMs: number; retryAfterSeconds: number } {
  const startedAtMs = Math.floor(nowMs / BOOKING_RATE_WINDOW_MS) * BOOKING_RATE_WINDOW_MS;
  return {
    startedAtMs,
    retryAfterSeconds: Math.max(1, Math.ceil((startedAtMs + BOOKING_RATE_WINDOW_MS - nowMs) / 1000))
  };
}

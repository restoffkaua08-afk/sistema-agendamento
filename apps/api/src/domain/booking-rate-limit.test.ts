import assert from "node:assert/strict";
import test from "node:test";
import { bookingClientAddress, bookingClientIpHash, loginClientIpHash, bookingRateWindow, RATE_LIMIT_MAX_ATTEMPTS, BOOKING_RATE_WINDOW_MS } from "./booking-rate-limit.js";

test("uses Fastify's validated request IP outside Vercel, not forwarded headers", () => {
  assert.equal(bookingClientAddress("203.0.113.7", "198.51.100.2", undefined, false), "203.0.113.7");
  assert.equal(bookingClientAddress(undefined, "198.51.100.2", undefined, false), null);
});

test("on Vercel prefers x-real-ip and otherwise uses the rightmost forwarded address", () => {
  assert.equal(bookingClientAddress("192.0.2.1", "198.51.100.4", "203.0.113.1", true), "198.51.100.4");
  assert.equal(bookingClientAddress("192.0.2.1", undefined, "203.0.113.9, 198.51.100.8", true), "198.51.100.8");
  assert.equal(bookingClientAddress("192.0.2.1", undefined, "203.0.113.9, invalid", true), null);
});

test("requires valid client IP and a configured secret, and persists only a keyed pseudonym", () => {
  assert.equal(bookingClientAddress("not-an-ip", undefined, undefined, false), null);
  assert.equal(bookingClientIpHash("203.0.113.7", undefined), null);
  const hash = bookingClientIpHash("203.0.113.7", "test-session-secret");
  assert.match(hash ?? "", /^[a-f0-9]{64}$/);
  assert.notEqual(hash, "203.0.113.7");
  assert.notEqual(hash, bookingClientIpHash("203.0.113.7", "another-secret"));
});

test("keeps login and booking rate-limit keys separate for the same client IP", () => {
  const address = "203.0.113.7";
  const secret = "test-session-secret";
  const loginHash = loginClientIpHash(address, secret);
  assert.match(loginHash ?? "", /^[a-f0-9]{64}$/);
  assert.notEqual(loginHash, address);
  assert.notEqual(loginHash, bookingClientIpHash(address, secret));
  assert.notEqual(loginHash, loginClientIpHash(address, "another-secret"));
});

test("uses fixed ten-minute UTC windows and calculates Retry-After to the boundary", () => {
  const first = bookingRateWindow(723_456);
  assert.equal(first.startedAtMs, 600_000);
  assert.equal(first.retryAfterSeconds, 477);
  assert.equal(bookingRateWindow(BOOKING_RATE_WINDOW_MS - 1).startedAtMs, 0);
  assert.equal(bookingRateWindow(BOOKING_RATE_WINDOW_MS).startedAtMs, BOOKING_RATE_WINDOW_MS);
  assert.equal(bookingRateWindow(BOOKING_RATE_WINDOW_MS).retryAfterSeconds, 600);
  assert.equal(RATE_LIMIT_MAX_ATTEMPTS, 5);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMobilePairingCode,
  formatMobilePairingCode,
  hashMobilePairingCode,
  normalizeMobilePairingCode,
} from "./mobile-pairing.js";
import { loginClientIpHash, mobilePairClientIpHash } from "./booking-rate-limit.js";

test("creates a 12-character code from an unambiguous alphabet", () => {
  assert.match(createMobilePairingCode(), /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/);
});

test("normalizes formatting and case before hashing", () => {
  const code = "2345ABCDEFGH";
  assert.equal(normalizeMobilePairingCode(formatMobilePairingCode(code).toLowerCase()), code);
  assert.equal(hashMobilePairingCode(formatMobilePairingCode(code)), hashMobilePairingCode(code));
});

test("rejects malformed and ambiguous codes", () => {
  assert.equal(normalizeMobilePairingCode("1234-ABCD-EFGH"), null);
  assert.equal(normalizeMobilePairingCode("2345-ABCD-EFG"), null);
});

test("isolates pairing rate-limit hashes from login hashes", () => {
  assert.notEqual(mobilePairClientIpHash("192.0.2.1", "secret"), loginClientIpHash("192.0.2.1", "secret"));
  assert.equal(mobilePairClientIpHash("192.0.2.1", undefined), null);
});

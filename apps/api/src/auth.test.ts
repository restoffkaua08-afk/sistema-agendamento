import assert from "node:assert/strict";
import test from "node:test";
import { canManageTenant, hashPassword, signSession, verifyPassword, verifySession } from "./auth.js";

test("hashes passwords and signs expiring sessions", () => {
  const hash = hashPassword("senha-segura");
  assert.equal(verifyPassword("senha-segura", hash), true);
  assert.equal(verifyPassword("senha-errada", hash), false);
  const exp = Math.floor(Date.now() / 1000) + 60;
  const token = signSession({ userId: "u1", tenantId: "t1", role: "owner", exp }, "test-secret");
  assert.deepEqual(verifySession(token, "test-secret"), { userId: "u1", tenantId: "t1", role: "owner", exp });
  assert.equal(verifySession(token, "wrong-secret"), null);
});

test("only owner and manager memberships can administer a tenant", () => {
  assert.equal(canManageTenant("owner"), true);
  assert.equal(canManageTenant("manager"), true);
  assert.equal(canManageTenant("reception"), false);
});

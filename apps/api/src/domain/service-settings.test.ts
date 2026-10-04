import assert from "node:assert/strict";
import test from "node:test";
import { parseServiceSettings } from "./service-settings.js";

const staffId = "00000000-0000-4000-8000-000000000001";
const validService = {
  name: " Corte clássico ",
  description: " Atendimento com hora marcada ",
  durationMinutes: 45,
  bufferMinutes: 10,
  priceCents: 6500,
  active: true,
  staffIds: [staffId]
};

test("normalizes valid service settings without changing exact cents or staff assignment", () => {
  assert.deepEqual(parseServiceSettings(validService), {
    ...validService,
    name: "Corte clássico",
    description: "Atendimento com hora marcada"
  });
});

test("accepts a free service without a buffer", () => {
  assert.equal(parseServiceSettings({ ...validService, priceCents: null, bufferMinutes: 0 })?.priceCents, null);
});

test("allows an inactive service to retain no professional assignment", () => {
  assert.deepEqual(parseServiceSettings({ ...validService, active: false, staffIds: [] })?.staffIds, []);
});

test("rejects invalid names, durations, amounts, and staff assignments", () => {
  for (const invalid of [
    { ...validService, name: "  " },
    { ...validService, durationMinutes: 4 },
    { ...validService, durationMinutes: 721 },
    { ...validService, priceCents: -1 },
    { ...validService, priceCents: 1.5 },
    { ...validService, staffIds: [] },
    { ...validService, staffIds: ["not-a-uuid"] },
    { ...validService, staffIds: [staffId, staffId] }
  ]) assert.equal(parseServiceSettings(invalid), null);
});

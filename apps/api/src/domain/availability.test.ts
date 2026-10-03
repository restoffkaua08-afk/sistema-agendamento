import assert from "node:assert/strict";
import test from "node:test";
import { calculateAvailability, localDateTimeToInstant } from "@agenda/contracts";

test("removes occupied intervals and keeps cancelled appointments available", () => {
  const date = new Date(2026, 9, 5);
  const available = calculateAvailability({
    date,
    weekday: 1,
    durationMinutes: 60,
    bufferMinutes: 0,
    intervalMinutes: 30,
    schedules: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }],
    blocks: [],
    appointments: [
      { startsAt: new Date(2026, 9, 5, 10), endsAt: new Date(2026, 9, 5, 11), status: "confirmed" },
      { startsAt: new Date(2026, 9, 5, 9, 30), endsAt: new Date(2026, 9, 5, 10, 30), status: "cancelled" }
    ]
  });

  assert.deepEqual(available.map((item) => item.toTimeString().slice(0, 5)), ["09:00", "11:00"]);
});

test("interprets the selected wall time in the tenant timezone", () => {
  assert.equal(localDateTimeToInstant("2026-10-03", "09:00", "America/Sao_Paulo")?.toISOString(), "2026-10-03T12:00:00.000Z");
  assert.equal(localDateTimeToInstant("2026-03-08", "02:30", "America/New_York"), null);
  assert.equal(localDateTimeToInstant("2026-11-01", "01:30", "America/New_York")?.toISOString(), "2026-11-01T05:30:00.000Z");
});

test("availability returns tenant-local slots as real instants and skips daylight-saving gaps", () => {
  const available = calculateAvailability({
    date: new Date(2026, 2, 8),
    weekday: 0,
    timeZone: "America/New_York",
    durationMinutes: 30,
    bufferMinutes: 0,
    intervalMinutes: 30,
    schedules: [{ weekday: 0, startsAt: "01:30", endsAt: "03:30" }],
    blocks: [],
    appointments: []
  });

  assert.deepEqual(available.map((item) => item.toISOString()), ["2026-03-08T06:30:00.000Z", "2026-03-08T07:00:00.000Z"]);
});

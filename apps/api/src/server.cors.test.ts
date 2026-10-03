import assert from "node:assert/strict";
import test from "node:test";

process.env.VERCEL = "1";
process.env.ALLOWED_ORIGINS = "https://agenda.example";
const { app, localDateBounds } = await import("./server.js");

test("owner agenda date bounds follow the tenant timezone across DST", () => {
  const bounds = localDateBounds("2026-03-08", "America/New_York");
  assert.equal(bounds?.startsAt.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(bounds?.endsAt.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(localDateBounds("2026-02-30", "America/New_York"), null);
});

test("owner panel preflight permits bearer auth and status updates", async () => {
  const response = await app.inject({
    method: "OPTIONS",
    url: "/v1/owner/trindade/appointments",
    headers: {
      origin: "https://agenda.example",
      "access-control-request-method": "PATCH",
      "access-control-request-headers": "authorization,content-type"
    }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "https://agenda.example");
  assert.match(String(response.headers["access-control-allow-headers"]), /authorization/i);
  assert.match(String(response.headers["access-control-allow-methods"]), /patch/i);
  await app.close();
});

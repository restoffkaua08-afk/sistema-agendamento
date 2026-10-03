import assert from "node:assert/strict";
import { test } from "node:test";
import { IncomingMessage } from "node:http";

process.env.VERCEL = "1";
const { restoreApiPath } = await import("./index.js");

test("restores the original API path and preserves caller query parameters", () => {
  const request = { url: "/api/index?__agenda_path=%2Fv1%2Fowner%2Ftrindade&date=2026-10-03" } as IncomingMessage;
  restoreApiPath(request);
  assert.equal(request.url, "/v1/owner/trindade?date=2026-10-03");
});

test("does not rewrite a missing or unexpected internal path", () => {
  const request = { url: "/api/index?__agenda_path=%2Fother%2Fpath" } as IncomingMessage;
  restoreApiPath(request);
  assert.equal(request.url, "/api/index?__agenda_path=%2Fother%2Fpath");
});

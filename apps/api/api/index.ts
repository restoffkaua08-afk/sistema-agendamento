import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../src/server.js";

export function restoreApiPath(request: IncomingMessage) {
  if (!request.url) return;
  const url = new URL(request.url, "http://vercel.local");
  const path = url.searchParams.get("__agenda_path");
  if (!path?.startsWith("/v1/")) return;
  url.searchParams.delete("__agenda_path");
  request.url = `${path}${url.search}`;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  restoreApiPath(request);
  await app.ready();
  app.server.emit("request", request, response);
}

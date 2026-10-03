import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export function createDatabase(url = process.env.DATABASE_URL) {
  if (!url) return null;
  const client = postgres(url, { max: 5, prepare: false, ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined });
  return { client, db: drizzle(client, { schema }) };
}

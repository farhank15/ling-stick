import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "../env.server";
import { runMigrations } from "./migrations";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/no-explicit-any
  var __lingstickDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  // eslint-disable-next-line no-var
  var __lingstickMigratePromise: Promise<void> | undefined;
}

function createClient2(): Client {
  const url = env.DATABASE_URL;
  return createClient({
    url,
    // Turso remote butuh token; file lokal tidak.
    authToken: env.DATABASE_AUTH_TOKEN || undefined,
  });
}

let rawClient: Client | undefined;
export function getRawClient(): Client {
  rawClient ??= createClient2();
  return rawClient;
}

/**
 * Migrasi dijalankan sekali per proses (async, jalan sebelum query pertama).
 * Semua akses DB lewat `db` — drizzle menunggu promise migrasi di dev; di
 * production cold start satu request bisa kalah cepat, jadi route penting
 * memanggil `await ensureDbReady()` lebih dulu.
 */
export function ensureDbReady(): Promise<void> {
  globalThis.__lingstickMigratePromise ??= runMigrations(getRawClient());
  return globalThis.__lingstickMigratePromise;
}

// Reuse DB di dev supaya hot-reload tidak membuka koneksi baru terus-menerus.
function createDb() {
  return drizzle(getRawClient(), { schema });
}

const db = globalThis.__lingstickDb ?? createDb();
if (process.env.NODE_ENV === "development") {
  globalThis.__lingstickDb = db;
  void ensureDbReady();
}

export { db, schema };

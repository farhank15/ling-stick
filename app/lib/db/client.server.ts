import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { resolveDbPath, env } from "../env.server";
import { runMigrations } from "./migrations";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/no-explicit-any
  var __englishExplorerDb: BetterSQLite3Database<typeof schema> | undefined;
}

function createDb() {
  const file = resolveDbPath(env.DATABASE_URL);
  const sqlite = new Database(file);
  runMigrations(sqlite);
  return drizzle(sqlite, { schema });
}

// Reuse DB di dev supaya hot-reload tidak membuka koneksi baru terus-menerus.
const db = globalThis.__englishExplorerDb ?? createDb();
if (process.env.NODE_ENV === "development") {
  globalThis.__englishExplorerDb = db;
}

export { db, schema };

import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { runMigrations } from "~/lib/db/migrations";
import * as schema from "~/lib/db/schema";
import { claimLegacyData, DATA_OWNER_KEY } from "~/lib/claim.server";
import { eq } from "drizzle-orm";

type DbLike = ReturnType<typeof drizzle<typeof schema>>;

let db: DbLike;
let ownerId = 0;

/** Buat DB dengan SKEMA LAMA (pra multi-user) + data legacy, lalu migrasi. */
async function legacyDb(): Promise<DbLike> {
  const client = createClient({ url: "file::memory:" });
  await client.executeMultiple(`
    CREATE TABLE items (
      id INTEGER PRIMARY KEY,
      text TEXT NOT NULL,
      text_norm TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      register TEXT NOT NULL DEFAULT 'neutral',
      meaning_id TEXT,
      notes_id TEXT,
      source TEXT,
      confidence TEXT DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'learning',
      hide_meaning INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE quiz_sets (
      id INTEGER PRIMARY KEY,
      day TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'daily',
      title TEXT NOT NULL,
      questions TEXT NOT NULL,
      order_json TEXT NOT NULL,
      total INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(day, mode)
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO items (id, text, text_norm, type, status, created_at) VALUES
      (1, 'hello', 'hello', 'word', 'learning', 1),
      (2, 'murah', 'murah', 'word', 'learning', 2);
    INSERT INTO quiz_sets (id, day, mode, title, questions, order_json, total, created_at) VALUES
      (10, '2026-01-01', 'daily', 'A', '[]', '[]', 5, 1);
    INSERT INTO settings (key, value) VALUES ('newCardsPerDay', '8');
  `);
  await runMigrations(client);
  return drizzle(client, { schema });
}

describe("AUDIT isolasi & keamanan data lama", () => {
  beforeAll(async () => {
    db = await legacyDb();
  });

  it("data legacy selamat lewat migrasi (jumlah & isi tidak berubah)", async () => {
    const items = await db.select().from(schema.items);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.text)).toEqual(expect.arrayContaining(["hello", "murah"]));
    const sets = await db.select().from(schema.quizSets);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.day).toBe("2026-01-01");
    // Kolom baru ada tapi null (belum diklaim).
    expect(items.every((i) => i.userId === null)).toBe(true);
    expect(sets[0]!.userId).toBeNull();
  });

  it("user PERTAMA (owner) mengklaim semua data legacy", async () => {
    const now = Date.now();
    const [{ id }] = await db
      .insert(schema.users)
      .values({ username: "owner", displayName: "owner", provider: "local", createdAt: now })
      .returning({ id: schema.users.id });
    ownerId = id;

    const claimed = await claimLegacyData(ownerId, db);
    expect(claimed).toBe(true);

    const items = await db.select().from(schema.items);
    expect(items.every((i) => i.userId === ownerId)).toBe(true);
    const sets = await db.select().from(schema.quizSets);
    expect(sets.every((s) => s.userId === ownerId)).toBe(true);
    const [ownerRow] = await db.select().from(schema.settings).where(eq(schema.settings.key, DATA_OWNER_KEY));
    expect(Number(ownerRow!.value)).toBe(ownerId);
  });

  it("user kedua TIDAK mewarisi data owner (isolasi data)", async () => {
    const now = Date.now();
    const [{ id: memberId }] = await db
      .insert(schema.users)
      .values({ username: "temen", displayName: "temen", provider: "local", createdAt: now })
      .returning({ id: schema.users.id });
    const claimed = await claimLegacyData(memberId, db);
    expect(claimed).toBe(false); // owner sudah ada → tidak mengklaim

    // Data baru milik member tetap terpisah (user_id sendiri).
    await db.insert(schema.items).values({
      text: "temen punya",
      textNorm: "temen punya",
      type: "word",
      register: "neutral",
      status: "learning",
      lang: "en",
      createdAt: now,
      userId: memberId,
    });
    const memberItems = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.userId, memberId));
    expect(memberItems).toHaveLength(1);
    const ownerItems = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.userId, ownerId));
    expect(ownerItems).toHaveLength(2);
  });

  it("claim idempotent — dipanggil ulang tidak mengubah apa pun", async () => {
    const [ownerRow] = await db.select().from(schema.settings).where(eq(schema.settings.key, DATA_OWNER_KEY));
    const again = await claimLegacyData(Number(ownerRow!.value), db);
    expect(again).toBe(false);
  });
});

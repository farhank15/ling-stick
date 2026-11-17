import { describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { runMigrations } from "~/lib/db/migrations";
import * as schema from "~/lib/db/schema";
import { claimLegacyData, DATA_OWNER_KEY } from "~/lib/claim.server";
import { eq } from "drizzle-orm";

type DbLike = ReturnType<typeof drizzle<typeof schema>>;

async function memDb(): Promise<DbLike> {
  const client = createClient({ url: "file::memory:" });
  await runMigrations(client);
  return drizzle(client, { schema });
}

describe("multi-user F1 — migrasi & klaim", () => {
  it("migrasi idempotent (dijalankan 2x tanpa error)", async () => {
    const client = createClient({ url: "file::memory:" });
    await runMigrations(client);
    await expect(runMigrations(client)).resolves.toBeUndefined();
    const u = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    expect(u.rows).toHaveLength(1);
    await client.close();
  });

  it("klaim backfill user_id ke semua baris legacy + kunci data_owner", async () => {
    const db = await memDb();
    // Buat data legacy (tanpa user_id) + user pemilik.
    const now = Date.now();
    const [{ id: userId }] = await db
      .insert(schema.users)
      .values({ provider: "password", displayName: "Pemilik", createdAt: now })
      .returning({ id: schema.users.id });
    await db.insert(schema.items).values({
      text: "hello",
      textNorm: "hello",
      type: "word",
      register: "neutral",
      status: "learning",
      lang: "en",
      createdAt: now,
    });
    await db.insert(schema.settings).values({ key: "newCardsPerDay", value: "8" });
    await db.insert(schema.quizSets).values({
      day: "2026-11-17",
      mode: "daily",
      lang: "en",
      title: "Latihan",
      questions: "[]",
      order: "[]",
      total: 1,
      done: 0,
      correct: 0,
      completed: 0,
      createdAt: now,
    });

    const claimed = await claimLegacyData(userId, db);
    expect(claimed).toBe(true);

    const [item] = await db.select().from(schema.items);
    expect(item!.userId).toBe(userId);
    const [set] = await db.select().from(schema.quizSets);
    expect(set!.userId).toBe(userId);

    const [ownerRow] = await db.select().from(schema.settings).where(eq(schema.settings.key, DATA_OWNER_KEY));
    expect(Number(ownerRow!.value)).toBe(userId);

    // Idempotent: panggil kedua kalinya tidak mengubah apa pun.
    const claimedAgain = await claimLegacyData(userId, db);
    expect(claimedAgain).toBe(false);
  });
});

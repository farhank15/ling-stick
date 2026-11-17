import { eq, isNull, sql } from "drizzle-orm";
import { db as defaultDb } from "~/lib/db/client.server";
import {
  cards,
  chatSessions,
  decks,
  items,
  kanjiCards,
  kanjiKnown,
  quizAnswers,
  quizSets,
  reviewLogs,
  routeNotes,
  settings,
  users,
} from "~/lib/db/schema";

export const DATA_OWNER_KEY = "data_owner";

/**
 * Klaim data lama (era single-user) ke pemilik.
 *
 * Atomik: marker `settings.data_owner` dipasang via `INSERT OR IGNORE` —
 * hanya pemenang yang mendapat perubahan (changes=1) yang meneruskan backfill.
 * Panggilan konkuren lain langsung keluar (changes=0), jadi tidak ada race
 * yang membagi data antar dua user. Semua di dalam satu transaksi.
 */
export async function claimLegacyData(
  userId: number,
  dbImpl: typeof defaultDb = defaultDb,
): Promise<boolean> {
  // Quick exit: sudah ada pemilik → tidak ada yang diklaim/diklaim ulang.
  const [existing] = await dbImpl
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, DATA_OWNER_KEY))
    .limit(1);
  if (existing) return false;

  return dbImpl.transaction(async (tx) => {
    // Atomik: hanya satu user yang bisa memenangkan marker (INSERT OR IGNORE).
    // Pemenang = nilai marker cocok dengan userId; kalau bukan, orang lain sudah
    // lebih dulu (atau menang race) → jangan klaim.
    await tx.run(sql`INSERT OR IGNORE INTO settings (key, value) VALUES (${DATA_OWNER_KEY}, ${String(userId)})`);
    const [marker] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, DATA_OWNER_KEY))
      .limit(1);
    if (!marker || marker.value !== String(userId)) return false;

    // Backfill user_id untuk semua tabel user-owned.
    await Promise.all([
      tx.update(items).set({ userId }).where(isNull(items.userId)),
      tx.update(decks).set({ userId }).where(isNull(decks.userId)),
      tx.update(cards).set({ userId }).where(isNull(cards.userId)),
      tx.update(reviewLogs).set({ userId }).where(isNull(reviewLogs.userId)),
      tx.update(settings).set({ userId }).where(isNull(settings.userId)),
      tx.update(quizSets).set({ userId }).where(isNull(quizSets.userId)),
      tx.update(quizAnswers).set({ userId }).where(isNull(quizAnswers.userId)),
      tx.update(kanjiCards).set({ userId }).where(isNull(kanjiCards.userId)),
      tx.update(kanjiKnown).set({ userId }).where(isNull(kanjiKnown.userId)),
      tx.update(chatSessions).set({ userId }).where(isNull(chatSessions.userId)),
      tx.update(routeNotes).set({ userId }).where(isNull(routeNotes.userId)),
    ]);

    await tx.update(users).set({ isOwner: 1 }).where(eq(users.id, userId));
    return true;
  });
}

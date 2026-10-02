import { db } from "~/lib/db/client.server";
import { settings } from "~/lib/db/schema";
import { env } from "~/lib/env.server";
import { eq } from "drizzle-orm";

/**
 * Preferensi user yang bisa diubah dari UI (tabel settings).
 * Kartu baru/hari: default dari env NEW_CARDS_PER_DAY, dioverride per user di DB.
 */
const NEW_CARDS_KEY = "newCardsPerDay";
export const NEW_CARDS_MIN = 1;
export const NEW_CARDS_MAX = 50;

export async function getNewCardsPerDay(): Promise<number> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, NEW_CARDS_KEY))
    .limit(1);
  const n = Number(row?.value);
  if (!Number.isFinite(n)) return env.NEW_CARDS_PER_DAY;
  return Math.min(NEW_CARDS_MAX, Math.max(NEW_CARDS_MIN, Math.round(n)));
}

export async function setNewCardsPerDay(n: number): Promise<number> {
  const clean = Math.min(NEW_CARDS_MAX, Math.max(NEW_CARDS_MIN, Math.round(Number(n) || 0)));
  await db
    .insert(settings)
    .values({ key: NEW_CARDS_KEY, value: String(clean) })
    .onConflictDoUpdate({ target: settings.key, set: { value: String(clean) } });
  return clean;
}

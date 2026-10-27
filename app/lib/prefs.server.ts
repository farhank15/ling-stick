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

/**
 * Target retensi FSRS. Makin tinggi = makin sering diulang (lebih banyak
 * review, retensi lebih kuat); makin rendah = interval lebih panjang.
 * Rentang dijaga 0.80–0.95: di bawahnya lupa jadi terlalu sering, di atasnya
 * interval meledak jadi sesi harian yang tak realistis.
 */
const RETENTION_KEY = "fsrsRetention";
const MAX_INTERVAL_KEY = "fsrsMaxInterval";
export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.95;
export const RETENTION_DEFAULT = 0.9;
export const MAX_INTERVAL_MIN = 30;
export const MAX_INTERVAL_MAX = 3650; // 10 tahun — praktis tak terbatas
export const MAX_INTERVAL_DEFAULT = 3650;

export type FsrsSettings = { retention: number; maxInterval: number };

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

async function readNumber(key: string): Promise<number | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  const n = Number(row?.value);
  return Number.isFinite(n) ? n : null;
}

async function writeSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getFsrsSettings(): Promise<FsrsSettings> {
  const [retention, maxInterval] = await Promise.all([readNumber(RETENTION_KEY), readNumber(MAX_INTERVAL_KEY)]);
  return {
    retention: clamp(retention ?? RETENTION_DEFAULT, RETENTION_MIN, RETENTION_MAX),
    maxInterval: clamp(maxInterval ?? MAX_INTERVAL_DEFAULT, MAX_INTERVAL_MIN, MAX_INTERVAL_MAX),
  };
}

export async function setFsrsSettings(input: Partial<FsrsSettings>): Promise<FsrsSettings> {
  const current = await getFsrsSettings();
  const next: FsrsSettings = {
    retention:
      input.retention === undefined
        ? current.retention
        : Math.round(clamp(input.retention, RETENTION_MIN, RETENTION_MAX) * 100) / 100,
    maxInterval:
      input.maxInterval === undefined
        ? current.maxInterval
        : Math.round(clamp(input.maxInterval, MAX_INTERVAL_MIN, MAX_INTERVAL_MAX)),
  };
  await Promise.all([
    writeSetting(RETENTION_KEY, String(next.retention)),
    writeSetting(MAX_INTERVAL_KEY, String(next.maxInterval)),
  ]);
  return next;
}

const KANJI_WIDGET_LEVEL_KEY = 'kanjiWidgetLevel';
export const KANJI_WIDGET_LEVEL_DEFAULT = 5;

export async function getKanjiWidgetLevel(): Promise<number> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, KANJI_WIDGET_LEVEL_KEY))
    .limit(1);
  const n = Number(row?.value);
  if (!Number.isFinite(n)) return KANJI_WIDGET_LEVEL_DEFAULT;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export async function setKanjiWidgetLevel(n: number): Promise<number> { const num = Number(n); let v = Math.round(num); if (!Number.isFinite(v)) v = 0; const clean = Math.min(5, Math.max(1, v)); await writeSetting(KANJI_WIDGET_LEVEL_KEY, String(clean)); return clean; }
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

import { eq } from "drizzle-orm";
import { db } from "./db/client.server";
import { settings } from "./db/schema";

/**
 * Bahasa target aktif (satu global, ganti di Settings):
 * - "en" → English (default, semua data existing)
 * - "ja" → 日本語 (mode Jepang)
 * Bahasa ibu selalu Indonesia — semua arti/penjelasan tetap ditulis dalam ID.
 * Nilai disimpan di tabel settings (key "targetLang"), di-cache per proses.
 */

export type TargetLang = "en" | "ja";
export const LANGS: TargetLang[] = ["en", "ja"];

const KEY = "targetLang";
let cached: TargetLang | null = null;

export function isTargetLang(v: string | null | undefined): v is TargetLang {
  return v === "en" || v === "ja";
}

export async function getTargetLang(): Promise<TargetLang> {
  if (cached) return cached;
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    cached = isTargetLang(row?.value) ? row.value : "en";
  } catch {
    cached = "en";
  }
  return cached;
}

/** Simpan pilihan bahasa. Dipanggil dari action Settings; cache ikut diperbarui. */
export async function setTargetLang(lang: TargetLang): Promise<void> {
  await db
    .insert(settings)
    .values({ key: KEY, value: lang })
    .onConflictDoUpdate({ target: settings.key, set: { value: lang } });
  cached = lang;
}

/**
 * Deteksi script buat item baru: ada kana/kanji → pasti "ja" (dari bahasa aktif apa pun).
 * Teks Latin → ikut bahasa aktif (di mode JA, input romaji masuk keranjang JA biar kelihatan).
 */
export function detectLang(text: string, active: TargetLang): TargetLang {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text) ? "ja" : active;
}

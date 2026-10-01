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
/**
 * Cache TTL pendek (2 detik) — bukan per-proses permanen. Dulu cache gak pernah
 * basi: di produksi (Vercel, banyak instansi serverless) instansi lain yang udah
 * sempat baca "en" bakal balikin "en" terus walau DB udah berganti — makanya
 * tiap halaman harus di-reload manual. TTL 2 detik tetep nahan query ganda
 * dalam satu render (beberapa loader paralel) tapi cepet ngikut perubahan.
 */
const TTL_MS = 2_000;
let cached: { value: TargetLang; at: number } | null = null;

export function isTargetLang(v: string | null | undefined): v is TargetLang {
  return v === "en" || v === "ja";
}

export async function getTargetLang(): Promise<TargetLang> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
    cached = { value: isTargetLang(row?.value) ? row.value : "en", at: Date.now() };
  } catch {
    cached = { value: cached?.value ?? "en", at: Date.now() };
  }
  return cached.value;
}

/** Simpan pilihan bahasa. Dipanggil dari action Settings; cache ikut diperbarui. */
export async function setTargetLang(lang: TargetLang): Promise<void> {
  await db
    .insert(settings)
    .values({ key: KEY, value: lang })
    .onConflictDoUpdate({ target: settings.key, set: { value: lang } });
  cached = { value: lang, at: Date.now() };
}

/**
 * Deteksi script buat item baru: ada kana/kanji → pasti "ja" (dari bahasa aktif apa pun).
 * Teks Latin → ikut bahasa aktif (di mode JA, input romaji masuk keranjang JA biar kelihatan).
 */
export function detectLang(text: string, active: TargetLang): TargetLang {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text) ? "ja" : active;
}

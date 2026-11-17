import { and, eq } from "drizzle-orm";
import { db } from "./db/client.server";
import { settings } from "./db/schema";
import { currentUserId, requireUserId } from "./user-context";

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
// Cache per-user (dulu global — di multi-user, user A bisa kebawa targetLang user B).
const cache = new Map<number, { value: TargetLang; at: number }>();

export function isTargetLang(v: string | null | undefined): v is TargetLang {
  return v === "en" || v === "ja";
}

export async function getTargetLang(): Promise<TargetLang> {
  const uid = currentUserId();
  if (uid == null) return "en"; // non-request (skrip/seed) → default aman
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(and(eq(settings.key, KEY), eq(settings.userId, uid)))
      .limit(1);
    cache.set(uid, { value: isTargetLang(row?.value) ? row.value : "en", at: Date.now() });
  } catch {
    cache.set(uid, { value: cached?.value ?? "en", at: Date.now() });
  }
  return cache.get(uid)!.value;
}

/** Simpan pilihan bahasa. Dipanggil dari action Settings; cache ikut diperbarui. */
export async function setTargetLang(lang: TargetLang): Promise<void> {
  const uid = requireUserId();
  await db
    .insert(settings)
    .values({ key: KEY, value: lang, userId: uid })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value: lang },
    });
  cache.set(uid, { value: lang, at: Date.now() });
}

/**
 * Deteksi script buat item baru: ada kana/kanji → pasti "ja" (dari bahasa aktif apa pun).
 * Teks Latin → ikut bahasa aktif (di mode JA, input romaji masuk keranjang JA biar kelihatan).
 */
export function detectLang(text: string, active: TargetLang): TargetLang {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text) ? "ja" : active;
}

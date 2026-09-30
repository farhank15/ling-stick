import crypto from "node:crypto";

/** Normalisasi teks untuk deteksi duplikat: lowercase, trim, rapikan spasi. */
export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Key cache deterministik untuk llm_cache. */
export function hashKey(...parts: string[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.join("\u0000"))
    .digest("hex");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Tanggal lokal (YYYY-MM-DD) untuk penghitung harian. */
export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Bulan lokal (YYYY-MM) untuk kuota Lara. */
export function monthStr(d: Date = new Date()): string {
  return todayStr(d).slice(0, 7);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

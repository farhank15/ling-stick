import crypto from "node:crypto";
import { createCookie, redirect } from "react-router";
import { ensureDbReady } from "./db/client.server";
import { env } from "./env.server";

/**
 * Sesi = cookie bertanda tangan (HMAC-SHA256, stateless).
 * Verifikasi murni crypto lokal → requireUser TANPA round-trip ke Turso
 * (dulu tiap pindah halaman bayar 1 RTT cuma buat SELECT sesi).
 * App personal single-user: tak ada daftar sesi yang perlu dicabut per perangkat;
 * logout = hapus cookie, ganti APP_PASSWORD = semua sesi lama otomatis batal.
 */
const COOKIE_NAME = "ee_session";

const cookie = createCookie(COOKIE_NAME, {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // App personal; sering diakses via http LAN/localhost → secure dimatikan.
  secure: false,
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
});

function sessionSecret(): string {
  return env.SESSION_SECRET || `lingstick-session:${env.APP_PASSWORD}`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function makeSessionValue(now: number): string {
  const expiresAt = now + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function verifySessionValue(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2] ?? "");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  const expiresAt = Number(parts[1]);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

export async function requireUser(request: Request): Promise<string> {
  // Cold start (Vercel): mulai migrasi tanpa nunggu (memoized per proses).
  void ensureDbReady();
  const sid = await cookie.parse(request.headers.get("Cookie"));
  if (typeof sid !== "string" || !verifySessionValue(sid)) {
    throw redirect("/login", 303);
  }
  return sid;
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  try {
    await requireUser(request);
    return true;
  } catch {
    return false;
  }
}

export async function login(password: string): Promise<string | null> {
  // Pastikan migrasi (+ seed Bank Kata) selesai sebelum request pertama dipakai.
  await ensureDbReady();
  if (!env.APP_PASSWORD) {
    return "APP_PASSWORD belum diset di .env";
  }
  if (password !== env.APP_PASSWORD) return null;
  return makeSessionValue(Date.now());
}

/** Stateless — tidak ada state sesi di server; cookie dihapus di client. */
export async function logout(): Promise<void> {}

export async function sessionCookieHeader(sid: string): Promise<string> {
  return cookie.serialize(sid);
}

export async function clearCookieHeader(): Promise<string> {
  return cookie.serialize("", { maxAge: 0 });
}

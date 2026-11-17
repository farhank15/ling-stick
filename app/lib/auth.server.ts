import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { createCookie, redirect } from "react-router";
import { claimLegacyData, DATA_OWNER_KEY } from "~/lib/claim.server";
import { db, ensureDbReady } from "~/lib/db/client.server";
import { sessions, settings, users } from "~/lib/db/schema";
import { env } from "~/lib/env.server";
import { setCurrentUser } from "~/lib/user-context";

/**
 * Autentikasi multi-user — sesi DB-backed (opaque token di cookie httpOnly),
 * sliding expiry 30 hari. Akun lokal username+password (scrypt) + bootstrap
 * password lama (owner).
 *
 * Cookie `ee_session` berisi id sesi (bukan payload ter-sign). Setiap request
 * diverifikasi ke tabel sessions; bila sisa umur < 50% TTL, diperpanjang
 * otomatis → user tidak perlu login berulang selama aktif.
 */
const COOKIE_NAME = "ee_session";
const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const SLIDE_THRESHOLD_MS = SESSION_TTL_MS / 2;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // maks 1x/jam write last_seen_at

const cookie = createCookie(COOKIE_NAME, {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // App personal; sering diakses via http LAN/localhost → secure dimatikan.
  secure: false,
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Ambil sesi + user; null kalau tidak ada / kedaluwarsa. */
async function lookupSession(sid: string): Promise<{ session: SessionRow; user: UserRow } | null> {
  // Cold start (Vercel): query pertama bisa kalah cepat dari migrasi —
  // tunggu dulu supaya "no such column" tidak muncul di request awal.
  await ensureDbReady();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sid))
    .limit(1);
  if (!row || Date.now() >= row.session.expiresAt) return null;
  return row;
}

/** Sliding expiry + batasi write last_seen_at. */
async function touchSession(sid: string, session: SessionRow, now: number): Promise<void> {
  const remaining = session.expiresAt - now;
  const expiresAt = remaining < SLIDE_THRESHOLD_MS ? now + SESSION_TTL_MS : session.expiresAt;
  const needsExtend = expiresAt !== session.expiresAt;
  const needsTouch = !session.lastSeenAt || now - session.lastSeenAt > TOUCH_INTERVAL_MS;
  if (needsExtend || needsTouch) {
    await db.update(sessions).set({ expiresAt, lastSeenAt: now }).where(eq(sessions.id, sid));
  }
}

/** Wajib login — kembalikan user; kalau tidak, redirect ke /login. */
export async function requireUser(request: Request): Promise<UserRow> {
  // Cold start (Vercel): mulai migrasi tanpa nunggu (memoized per proses).
  void ensureDbReady();
  const sid = await cookie.parse(request.headers.get("Cookie"));
  if (typeof sid !== "string" || !sid) throw redirect("/login", 303);
  const found = await lookupSession(sid);
  if (!found) throw redirect("/login", 303);
  await touchSession(sid, found.session, Date.now());
  // Suntik user ke konteks request → service layer memfilter per-user.
  setCurrentUser(found.user.id);
  return found.user;
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  try {
    await requireUser(request);
    return true;
  } catch {
    return false;
  }
}

/** Buat sesi baru untuk user; kembalikan token (id sesi). */
export async function createSession(userId: number): Promise<string> {
  const now = Date.now();
  const sid = randomToken();
  await db.insert(sessions).values({
    id: sid,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now,
  });
  return sid;
}

export async function sessionCookieHeader(sid: string): Promise<string> {
  return cookie.serialize(sid);
}

/** Hapus sesi dari DB (logout) berdasarkan cookie request. */
export async function destroySession(request: Request): Promise<void> {
  const sid = await cookie.parse(request.headers.get("Cookie"));
  if (typeof sid === "string" && sid) {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
}

export async function clearCookieHeader(): Promise<string> {
  return cookie.serialize("", { maxAge: 0 });
}

/* ── Akun lokal: username + password (scrypt) ── */

export const USERNAME_RE = /^[a-z0-9_-]{3,24}$/;
export const PASSWORD_MIN = 8;

export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return USERNAME_RE.test(u) ? u : null;
}

function hashPassword(password: string, saltHex: string): string {
  return crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64).toString("hex");
}

/** Sudah ada pemilik (owner) yang mengklaim data lama? */
export async function ownerEstablished(): Promise<boolean> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, DATA_OWNER_KEY)).limit(1);
  return Boolean(row);
}

/**
 * Registrasi akun baru.
 *
 * Keamanan: registrasi DIKUNCI sampai ada pemilik (owner) — hanya login
 * bootstrap APP_PASSWORD yang bisa jadi owner & mengklaim data lama. Ini
 * mencegah orang lain "mencuri" kepemilikan data legacy dengan daftar duluan.
 */
export async function registerAccount(
  usernameRaw: string,
  password: string,
): Promise<{ ok: true; user: UserRow } | { ok: false; error: string }> {
  if (!(await ownerEstablished())) {
    return {
      ok: false,
      error: "Setup belum selesai — pemilik harus login dulu dengan APP_PASSWORD untuk mengklaim data.",
    };
  }
  const username = normalizeUsername(usernameRaw);
  if (!username) return { ok: false, error: "Username 3–24 karakter (huruf/angka/-/_)" };
  if (password.length < PASSWORD_MIN) {
    return { ok: false, error: `Password minimal ${PASSWORD_MIN} karakter` };
  }
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (dup) return { ok: false, error: "Username sudah dipakai" };

  const now = Date.now();
  const salt = crypto.randomBytes(16).toString("hex");
  const [{ id }] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      provider: "local",
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: now,
      lastLoginAt: now,
    })
    .returning({ id: users.id });
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return { ok: true, user: user! };
}

/** Login username+password → token sesi (atau null). */
export async function loginUsername(usernameRaw: string, password: string): Promise<string | null> {
  const username = normalizeUsername(usernameRaw);
  if (!username) return null;
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || !user.passwordHash || !user.passwordSalt) return null;
  const expected = Buffer.from(user.passwordHash, "hex");
  const given = Buffer.from(hashPassword(password, user.passwordSalt), "hex");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id));
  return createSession(user.id);
}

/* ── Bootstrap password lama (owner / transisi) ── */

/**
 * Login password lama (APP_PASSWORD). Mengautentikasi / membuat user owner
 * "bootstrap", lalu mengklaim data legacy. Kembalikan token sesi.
 */
export async function login(password: string): Promise<string | null> {
  await ensureDbReady();
  if (!env.APP_PASSWORD || password !== env.APP_PASSWORD) return null;
  const now = Date.now();
  const [existing] = await db.select().from(users).where(eq(users.provider, "bootstrap")).limit(1);
  let ownerId: number;
  if (existing) {
    ownerId = existing.id;
    await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, ownerId));
  } else {
    const [{ id }] = await db
      .insert(users)
      .values({ provider: "bootstrap", displayName: "Pemilik", createdAt: now, lastLoginAt: now })
      .returning({ id: users.id });
    ownerId = id;
    await claimLegacyData(ownerId);
  }
  return createSession(ownerId);
}

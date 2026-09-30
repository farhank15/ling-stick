import { eq, lt } from "drizzle-orm";
import { createCookie, redirect } from "react-router";
import { db } from "./db/client.server";
import { sessions } from "./db/schema";
import { env } from "./env.server";
import { randomToken } from "./utils.shared";

const COOKIE_NAME = "ee_session";

const cookie = createCookie(COOKIE_NAME, {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  // App personal; sering diakses via http LAN/localhost → secure dimatikan.
  secure: false,
  maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
});

export async function requireUser(request: Request): Promise<string> {
  const sid = await cookie.parse(request.headers.get("Cookie"));
  if (typeof sid !== "string" || !sid) {
    throw redirect("/login", 303);
  }
  const now = Date.now();
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sid))
    .limit(1);
  if (!row || row.expiresAt < now) {
    if (row) await db.delete(sessions).where(eq(sessions.id, sid));
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
  if (!env.APP_PASSWORD) {
    return "APP_PASSWORD belum diset di .env";
  }
  if (password !== env.APP_PASSWORD) return null;
  const now = Date.now();
  const ttl = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  const id = randomToken();
  await db.insert(sessions).values({
    id,
    createdAt: now,
    expiresAt: now + ttl,
  });
  // Bersihkan sesi kedaluwarsa.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  return id;
}

export async function logout(sid: string) {
  await db.delete(sessions).where(eq(sessions.id, sid));
}

export async function sessionCookieHeader(sid: string): Promise<string> {
  return cookie.serialize(sid);
}

export async function clearCookieHeader(): Promise<string> {
  return cookie.serialize("", { maxAge: 0 });
}

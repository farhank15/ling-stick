import { beforeAll, describe, expect, it } from "vitest";

let db: any;
let registerAccount: any;
let loginUsername: any;
let login: any;
let normalizeUsername: any;
let ownerEstablished: any;

beforeAll(async () => {
  // Arahkan DB ke in-memory SEBELUM modul dimuat (env dibaca saat import).
  process.env.DATABASE_URL = "file::memory:";
  process.env.DATABASE_AUTH_TOKEN = "";
  process.env.APP_PASSWORD = "secret-bootstrap";
  const clientMod = await import("~/lib/db/client.server");
  await clientMod.ensureDbReady();
  db = clientMod.db;
  const auth = await import("~/lib/auth.server");
  registerAccount = auth.registerAccount;
  loginUsername = auth.loginUsername;
  login = auth.login;
  normalizeUsername = auth.normalizeUsername;
  ownerEstablished = auth.ownerEstablished;
});

describe("akun lokal — gate owner & registrasi/login", () => {
  it("registrasi DITOLAK sebelum owner (bootstrap) ada", async () => {
    expect(await ownerEstablished()).toBe(false);
    const res = await registerAccount("budi", "rahasia123");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Setup belum selesai");
  });

  it("bootstrap login(password) -> owner + klaim data", async () => {
    const sid = await login("secret-bootstrap");
    expect(typeof sid).toBe("string");
    expect(await ownerEstablished()).toBe(true);
  });

  it("setelah owner ada, registrasi berhasil — user BUKAN owner", async () => {
    const res = await registerAccount("budi", "rahasia123");
    expect(res.ok).toBe(true);
    const u = res.user;
    expect(u.username).toBe("budi");
    expect(u.passwordHash).toBeTruthy();
    expect(u.passwordHash).not.toBe("rahasia123");
    expect(u.passwordSalt).toBeTruthy();
    expect(u.isOwner).toBe(0);
  });

  it("username duplikat (case-insensitive) ditolak", async () => {
    const res = await registerAccount("BUDI", "rahasia456");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("sudah dipakai");
  });

  it("password terlalu pendek ditolak", async () => {
    const res = await registerAccount("citra", "pendek");
    expect(res.ok).toBe(false);
  });

  it("login benar → sesi; password salah → null", async () => {
    const sid = await loginUsername("budi", "rahasia123");
    expect(typeof sid).toBe("string");
    expect(sid!.length).toBeGreaterThan(0);
    expect(await loginUsername("budi", "salah")).toBeNull();
    expect(await loginUsername("tidakada", "rahasia123")).toBeNull();
  });
});

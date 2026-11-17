import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Konteks user per-request (AsyncLocalStorage). Disuntik oleh `requireUser`
 * di auth.server — sehingga semua service layer bisa membaca userId aktif tanpa
 * harus mengubah signature fungsi di puluhan call-site.
 */
const storage = new AsyncLocalStorage<{ id: number | null }>();

export function setCurrentUser(userId: number): void {
  storage.enterWith({ id: userId });
}

/**
 * Suntik user ke store request yang SUDAH dibuka `inUserContext` (mutasi objek
 * store yang sama). `enterWith` di frame async yang lebih dalam TIDAK merambat
 * ke caller — makanya harus mutasi, bukan enter. Fallback enterWith untuk
 * pemanggilan langsung (test / skrip).
 */
export function injectCurrentUser(userId: number): void {
  const store = storage.getStore();
  if (store) {
    store.id = userId;
    return;
  }
  setCurrentUser(userId);
}

/** Buka konteks user untuk satu handler request (loader/action). */
export function inUserContext<T>(fn: () => T): T {
  return storage.run({ id: null }, fn);
}

export function currentUserId(): number | null {
  return storage.getStore()?.id ?? null;
}

/** Wajib ada user di konteks — lempar kalau tidak (anti bocor lintas-user). */
export function requireUserId(): number {
  const id = storage.getStore()?.id;
  if (id == null) {
    throw new Error("requireUserId: tidak ada user aktif di konteks request");
  }
  return id;
}

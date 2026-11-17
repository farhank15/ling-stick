import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Konteks user per-request (AsyncLocalStorage). Disuntik oleh `requireUser`
 * di auth.server — sehingga semua service layer bisa membaca userId aktif tanpa
 * harus mengubah signature fungsi di puluhan call-site.
 */
const storage = new AsyncLocalStorage<{ id: number }>();

export function setCurrentUser(userId: number): void {
  storage.enterWith({ id: userId });
}

export function currentUserId(): number | null {
  return storage.getStore()?.id ?? null;
}

/** Wajib ada user di konteks — lempar kalau tidak (anti bocor lintas-user). */
export function requireUserId(): number {
  const id = currentUserId();
  if (id === null) {
    throw new Error("requireUserId: tidak ada user aktif di konteks request");
  }
  return id;
}

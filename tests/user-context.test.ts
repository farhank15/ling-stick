import { describe, expect, it } from "vitest";
import {
  currentUserId,
  inUserContext,
  injectCurrentUser,
  requireUserId,
} from "~/lib/user-context";

/**
 * Regresi mekanisme konteks: `enterWith` di frame async lebih dalam TIDAK
 * merambat ke caller (sudah terbukti gagal di produksi). Pola benar:
 * `inUserContext` membuka store SEBELUM handler jalan, lalu `injectCurrentUser`
 * memutasi objek store yang sama — terlihat oleh semua service setelahnya.
 */
describe("user-context — propagasi konteks per-request", () => {
  it("inUserContext: user tersuntik lewat requireUser-pola di frame dalam, terbaca setelah await", async () => {
    await inUserContext(async () => {
      // Simulasi requireUser: lookup DB dulu (async gap), baru suntik.
      await new Promise((r) => setTimeout(r, 1));
      injectCurrentUser(7);
      // Simulasi service: dipanggil caller setelah requireUser selesai.
      await new Promise((r) => setTimeout(r, 1));
      expect(requireUserId()).toBe(7);
      expect(currentUserId()).toBe(7);
    });
  });

  it("tanpa inUserContext: injectCurrentUser tetap terbaca (pemanggilan langsung)", async () => {
    injectCurrentUser(9);
    await new Promise((r) => setTimeout(r, 1));
    expect(requireUserId()).toBe(9);
  });

  it("tanpa user: requireUserId melempar", () => {
    expect(() => inUserContext(() => requireUserId())).toThrow(
      "tidak ada user aktif di konteks request",
    );
  });

  it("konteks tidak bocor antar handler (dua request paralel)", async () => {
    const read = async (delay: number) => {
      await new Promise((r) => setTimeout(r, delay));
      return currentUserId();
    };
    const [a, b] = await Promise.all([
      inUserContext(async () => {
        injectCurrentUser(1);
        return read(20);
      }),
      inUserContext(async () => {
        injectCurrentUser(2);
        return read(5);
      }),
    ]);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });
});

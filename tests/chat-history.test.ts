import { describe, expect, it } from "vitest";
import { historyWindow } from "~/lib/chat.server";

const m = (content: string, role: "user" | "assistant" = "user") => ({ role, content });

describe("historyWindow", () => {
  it("kosong → kosong", () => {
    expect(historyWindow([])).toEqual([]);
  });

  it("percakapan pendek → semua pesan", () => {
    const rows = [m("halo"), m("hai", "assistant")];
    expect(historyWindow(rows)).toEqual(rows);
  });

  it("percakapan panjang → pesan pertama + ekor yang muat budget", () => {
    const rows = [m("TOPIK AWAL")];
    for (let i = 0; i < 40; i++) rows.push(m(`pesan ${i} ${"x".repeat(300)}`));
    const win = historyWindow(rows);
    expect(win[0]!.content).toBe("TOPIK AWAL");
    expect(win[win.length - 1]!.content).toContain("pesan 39");
    expect(win.length).toBeLessThan(rows.length);
    const chars = win.reduce((n, r) => n + r.content.length, 0);
    expect(chars).toBeLessThanOrEqual(8000 + 400);
  });

  it("tidak pernah menghapus pesan pertama", () => {
    const rows = [m("awal"), m("y".repeat(9000)), m("akhir")];
    expect(historyWindow(rows)[0]!.content).toBe("awal");
  });
});

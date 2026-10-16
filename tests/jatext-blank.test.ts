import { describe, expect, it } from "vitest";
import { buildRuby } from "~/components/JaText";

describe("buildRuby dengan blank ___", () => {
  it("kanji dapat ruby walau ada ___ di kalimat", () => {
    const segs = buildRuby("わたし ___ 学生です。", "わたし ___ がくせいです。");
    const ruby = segs.filter((s) => s.ruby);
    // 学生→がくせい: ruby menempel di run kanji
    expect(ruby.length).toBeGreaterThan(0);
    expect(ruby.map((s) => s.ruby).join("")).toContain("がくせい");
  });

  it("alignment gagal → polos tanpa ruby (tak ada gumpalan)", () => {
    const segs = buildRuby("田中さん ___ 日本人です。", "salah total");
    expect(segs.every((s) => !s.ruby)).toBe(true);
  });

  it("kalimat kana murni → tanpa ruby", () => {
    const segs = buildRuby("ねこ ___ すきです。", "ねこ ___ すきです。");
    expect(segs.every((s) => !s.ruby)).toBe(true);
  });
});

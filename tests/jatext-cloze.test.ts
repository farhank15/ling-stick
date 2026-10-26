import { describe, expect, it } from "vitest";
import { buildRuby } from "~/components/JaText";

describe("buildRuby — blank hasil cloze", () => {
  it("kana kata yang dirumpang dibuang → sisa kalimat tetap dapat furigana", () => {
    // Prompt cloze: 私は_____です。 reading sudah tanpa kana 学生 (がくせい).
    const segs = buildRuby("私は_____です。", "わたしはです。");
    const ruby = segs.filter((s) => s.ruby);
    expect(ruby.map((s) => s.ruby)).toEqual(["わたし"]);
  });

  it("blank tidak diberi ruby walau kana jawaban masih ada di reading", () => {
    const segs = buildRuby("私は_____です。", "わたしはがくせいです。");
    expect(segs.find((s) => s.base.includes("_"))?.ruby).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { guessMap, parseTable } from "~/lib/deck-parse";

describe("parseTable", () => {
  it("parse TSV JP 3 kolom", () => {
    const rows = parseTable("猫\tねこ\tkucing\n水\tみず\tair\n");
    expect(rows).toEqual([
      ["猫", "ねこ", "kucing"],
      ["水", "みず", "air"],
    ]);
  });

  it("fallback koma + buang baris kosong", () => {
    const rows = parseTable("cat, kucing\n\ndog, anjing\r\n");
    expect(rows).toEqual([
      ["cat", "kucing"],
      ["dog", "anjing"],
    ]);
  });

  it("kosong → []", () => {
    expect(parseTable("  \n ")).toEqual([]);
  });
});

describe("guessMap", () => {
  it("kanji,kana,latin → text,reading,meaningId", () => {
    expect(guessMap([["猫", "ねこ", "kucing"]])).toEqual(["text", "reading", "meaningId"]);
  });

  it("kolom ke-4+ → extra", () => {
    expect(guessMap([["猫", "ねこ", "kucing", "N5"]])).toEqual(["text", "reading", "meaningId", "extra"]);
  });
});

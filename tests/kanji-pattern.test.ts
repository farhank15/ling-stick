import { describe, expect, it } from "vitest";
import krad from "../data/kanji-krad.json";
import levels from "../data/kanji-levels.json";
import { groupByRadical } from "~/lib/kanji-study";

const KRAD = krad as Record<string, string[]>;

const n5 = levels.levels.n5.map((x) => ({
  char: x.char,
  strokes: x.strokes,
  components: KRAD[x.char] ?? [],
}));

describe("groupByRadical — pola berbasis komponen penuh (KRad)", () => {
  it("keluarga 女 memuat 女 dan 安 (kasus user)", () => {
    const groups = groupByRadical(n5);
    const fam = groups.find((g) => g.key === "女");
    expect(fam).toBeDefined();
    expect(fam!.rows.map((r) => r.char)).toContain("女");
    expect(fam!.rows.map((r) => r.char)).toContain("安");
  });

  it("setiap kanji muncul minimal satu kali", () => {
    const groups = groupByRadical(n5);
    const seen = new Set(groups.flatMap((g) => g.rows.map((r) => r.char)));
    expect(seen.size).toBe(n5.length);
  });

  it("keluarga diurutkan menurun berdasarkan jumlah anggota", () => {
    const groups = groupByRadical(n5).filter((g) => g.key !== "__single");
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1]!.rows.length).toBeGreaterThanOrEqual(groups[i]!.rows.length);
    }
  });

  it("anggota primer (char itu sendiri) diletakkan paling depan", () => {
    const groups = groupByRadical(n5);
    const fam = groups.find((g) => g.key === "女")!;
    expect(fam.rows[0]!.char).toBe("女");
  });
});

import { describe, expect, it } from "vitest";
import n4 from "../data/kanji-n4.json";
import n5 from "../data/kanji-n5.json";
import studyN4 from "../data/kanji-study-n4.json";
import study from "../data/kanji-study-n5.json";
import {
  groupByRadical,
  groupByTheme,
  parseReading,
  radicalLabel,
  STUDY_THEMES,
  studyEntry,
  themeOf,
} from "../app/lib/kanji-study";

const chars = n5.kanji.map((k) => k.char);
const rows = n5.kanji.map((k) => ({ char: k.char, strokes: k.strokes }));

describe("parseReading (notasi KANJIDIC2)", () => {
  it("memisahkan okurigana setelah titik", () => {
    expect(parseReading("ひと.つ")).toEqual({
      stem: "ひと",
      okurigana: "つ",
      affix: null,
      raw: "ひと.つ",
    });
  });

  it("menandai strip kanan sebagai awalan", () => {
    expect(parseReading("ひと-")).toMatchObject({ stem: "ひと", affix: "prefix", okurigana: null });
  });

  it("menandai strip kiri sebagai akhiran", () => {
    expect(parseReading("-び")).toMatchObject({ stem: "び", affix: "suffix", okurigana: null });
  });

  it("mendukung akhiran + okurigana sekaligus", () => {
    expect(parseReading("-が.ち")).toMatchObject({
      stem: "が",
      okurigana: "ち",
      affix: "suffix",
    });
  });

  it("bacaan on tanpa penanda tetap utuh", () => {
    expect(parseReading("ニチ")).toEqual({
      stem: "ニチ",
      okurigana: null,
      affix: null,
      raw: "ニチ",
    });
  });
});

describe("data/kanji-study-n5.json", () => {
  it("mencakup semua kanji N5 tanpa duplikat", () => {
    expect(chars).toHaveLength(111);
    expect(new Set(chars).size).toBe(chars.length);
    for (const char of chars) {
      expect(studyEntry(char), `tema hilang: ${char}`).not.toBeNull();
    }
  });

  it("tidak menyimpan kanji di luar dataset N5", () => {
    for (const char of Object.keys(study.kanji)) {
      expect(chars, `kanji asing: ${char}`).toContain(char);
    }
  });

  it("setiap tema yang dipakai ada di daftar tema", () => {
    const ids = new Set(STUDY_THEMES.map((t) => t.id));
    for (const [char, entry] of Object.entries(study.kanji)) {
      expect(ids, `tema tak dikenal untuk ${char}: ${entry.theme}`).toContain(entry.theme);
      expect(entry.radical, `radikal kosong: ${char}`).not.toBe("");
    }
  });

  it("urutan tema unik dan berurutan", () => {
    const orders = STUDY_THEMES.map((t) => t.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe("data/kanji-study-n4.json", () => {
  it("mencakup semua kanji N4 tanpa duplikat", () => {
    expect(n4.kanji).toHaveLength(142);
    expect(Object.keys(studyN4.kanji)).toHaveLength(142);
    for (const k of n4.kanji) {
      expect(studyEntry(k.char), `tema hilang: ${k.char}`).not.toBeNull();
    }
  });

  it("setiap tema & radikal N4 valid", () => {
    const ids = new Set(STUDY_THEMES.map((t) => t.id));
    for (const [char, entry] of Object.entries(studyN4.kanji)) {
      expect(ids, `tema tak dikenal untuk ${char}: ${entry.theme}`).toContain(entry.theme);
      expect(entry.radical, `radikal kosong: ${char}`).not.toBe("");
    }
  });

  it("kanji N4 dapat tema yang benar", () => {
    expect(themeOf("体")?.label).toBe("Tubuh & kesehatan");
    expect(themeOf("春")?.label).toBe("Waktu & kalender");
    expect(themeOf("教")?.label).toBe("Sekolah & bahasa");
  });

  it("groupByTheme N4 tidak kehilangan baris", () => {
    const rowsN4 = n4.kanji.map((k) => ({ char: k.char, strokes: k.strokes }));
    const groups = groupByTheme(rowsN4);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(142);
    expect(groups.some((g) => g.key === "lain")).toBe(false);
  });
});

describe("groupByTheme", () => {
  it("membagi semua baris tanpa kehilangan data", () => {
    const groups = groupByTheme(rows);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
    expect(groups.map((g) => g.key)).toEqual(
      STUDY_THEMES.filter((t) => groups.some((g) => g.key === t.id)).map((t) => t.id),
    );
  });

  it("mengurutkan isi tema sesuai kurasi", () => {
    const groups = groupByTheme(rows);
    const angka = groups.find((g) => g.key === "angka");
    expect(angka?.rows.map((r) => r.char).slice(0, 4)).toEqual(["一", "二", "三", "四"]);
  });

  it("kanji tanpa tema masuk grup Belum bertema", () => {
    const groups = groupByTheme([...rows, { char: "鬱", strokes: 29 }]);
    const rest = groups.find((g) => g.key === "lain");
    expect(rest?.rows.map((r) => r.char)).toEqual(["鬱"]);
  });
});

describe("groupByRadical", () => {
  it("membagi semua baris tanpa duplikat", () => {
    const groups = groupByRadical(rows);
    const seen = groups.flatMap((g) => g.rows.map((r) => r.char));
    expect(seen).toHaveLength(rows.length);
    expect(new Set(seen).size).toBe(rows.length);
  });

  it("menampilkan keluarga >=2 lebih dulu, single terakhir", () => {
    const groups = groupByRadical(rows);
    const sizes = groups.map((g) => g.rows.length);
    const last = groups[groups.length - 1];
    expect(last.key).toBe("__single");
    expect(sizes.slice(0, -1)).toEqual([...sizes.slice(0, -1)].sort((a, b) => b - a));
    expect(sizes.every((n) => n >= 2)).toBe(true);
  });

  it("radikal 日 mengumpulkan kanji berkomponen sama", () => {
    const groups = groupByRadical(rows);
    const hi = groups.find((g) => g.key === "日");
    expect(hi?.rows.map((r) => r.char)).toEqual(expect.arrayContaining(["日", "時", "曜", "明"]));
  });

  it("kanji tanpa radikal terpetakan tidak jadi grup 'Radikal ?'", () => {
    const groups = groupByRadical([...rows, { char: "鬱", strokes: 29 }]);
    expect(groups.some((g) => g.key === "?")).toBe(false);
    expect(groups[groups.length - 1]?.rows.map((r) => r.char)).toContain("鬱");
  });

  it("label radikal klasik dipetakan ke bentuk umum", () => {
    expect(radicalLabel("辵")).toBe("辶");
    expect(radicalLabel("日")).toBe("日");
  });
});

describe("themeOf", () => {
  it("mengembalikan tema lengkap", () => {
    expect(themeOf("牛")?.label).toBe("Makanan & hewan");
    expect(themeOf("鬱")).toBeNull();
  });
});

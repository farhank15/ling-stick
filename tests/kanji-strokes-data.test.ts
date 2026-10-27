import { describe, expect, it } from "vitest";
import kanjiStrokes from "../data/kanji-strokes.json";
import textbook from "../data/textbook-strokes.json";
import levels from "../data/kanji-levels.json";
import { extractStrokePaths, parseStrokes } from "../scripts/lib/kanjivg";

type Pt = [number, number];

const official = new Map<string, number>();
for (const list of Object.values(levels.levels)) {
  for (const entry of list as ({ char: string; strokes: number } | string)[]) {
    if (typeof entry !== "string") official.set(entry.char, entry.strokes);
  }
}

function span(stroke: Pt[]): number {
  return Math.max(...stroke.map(([x, y]) => Math.hypot(x - stroke[0]![0], y - stroke[0]![1])));
}

function accuracy(data: Record<string, Pt[][]>): { checked: number; match: number; wrong: string[] } {
  const wrong: string[] = [];
  let checked = 0;
  for (const [ch, strokes] of Object.entries(data)) {
    const expected = official.get(ch);
    if (expected === undefined) continue;
    checked++;
    if (strokes.length !== expected) wrong.push(`${ch} ${strokes.length}/${expected}`);
  }
  return { checked, match: checked - wrong.length, wrong };
}

describe("data goresan KanjiVG", () => {
  it("kanji-strokes cocok dengan jumlah goresan resmi ≥95%", () => {
    const r = accuracy(kanjiStrokes as unknown as Record<string, Pt[][]>);
    expect(r.checked).toBeGreaterThanOrEqual(600);
    expect(r.match / r.checked).toBeGreaterThanOrEqual(0.95);
  });

  it("textbook-strokes cocok dengan jumlah goresan resmi ≥95%", () => {
    const r = accuracy((textbook as unknown as { strokes: Record<string, Pt[][]> }).strokes);
    expect(r.checked).toBeGreaterThanOrEqual(600);
    expect(r.match / r.checked).toBeGreaterThanOrEqual(0.95);
  });

  it("tidak ada goresan kosong atau degenerat", () => {
    for (const data of [kanjiStrokes as unknown as Record<string, Pt[][]>, (textbook as unknown as { strokes: Record<string, Pt[][]> }).strokes]) {
      for (const [ch, strokes] of Object.entries(data)) {
        expect(strokes.length, ch).toBeGreaterThan(0);
        for (const s of strokes) {
          expect(s.length, ch).toBeGreaterThan(1);
          expect(span(s), ch).toBeGreaterThan(1);
        }
      }
    }
  });

  it("kanji yang dulu rusak kini lengkap", () => {
    // matcha:explain regex grup non-greedy lama hanya menangkap subgrup pertama,
    // jadi kanji bersarang (時 間 学 年 前 国 帰) kehilangan sebagian besar goresan.
    const data = kanjiStrokes as unknown as Record<string, Pt[][]>;
    for (const [ch, expected] of [["二", 2], ["学", 8], ["時", 10], ["間", 12], ["年", 6], ["前", 9], ["国", 8], ["帰", 10]] as const) {
      expect(data[ch]?.length, ch).toBe(expected);
    }
  });
});

describe("extractStrokePaths", () => {
  const nested = `<svg><g id="kvg:StrokePaths_04e8c">
    <path id="kvg:04e8c-s1" d="M10,10c0,10,0,20,0,30"/>
    <g><path id="kvg:04e8c-s2" d="M40,10c0,10,0,20,0,30"/></g>
    <g><g><path id="kvg:04e8c-s3" d="M70,10c0,10,0,20,0,30"/></g></g>
  </g></svg>`;

  it("mengambil goresan dari subgrup bersarang", () => {
    expect(extractStrokePaths(nested).map((s) => s.num)).toEqual([1, 2, 3]);
  });

  it("mengurutkan menurut nomor goresan, bukan urutan dokumen", () => {
    const shuffled = `<svg><path id="kvg:1-s2" d="M0,0L10,10"/><path id="kvg:1-s1" d="M0,0L20,20"/></svg>`;
    expect(extractStrokePaths(shuffled).map((s) => s.num)).toEqual([1, 2]);
  });

  it("mendukung perintah smooth cubic (S/s) tanpa memotong ekor", () => {
    const svg = `<svg><path id="kvg:1-s1" d="M10,10c5,0,10,5,10,10s5,10,10,10"/></svg>`;
    const strokes = parseStrokes(svg, 16);
    expect(strokes).toHaveLength(1);
    // Titik terakhir = ujung path (30,30), bukan titik sebelum segmen S.
    expect(strokes[0]!.at(-1)).toEqual([30, 30]);
  });
});

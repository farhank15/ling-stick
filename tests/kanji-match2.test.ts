import { describe, expect, it } from "vitest";
import templates from "../data/kanji-strokes.json";
import { buildRefPatterns, recognize, extractFeatures, momentNormalize, type KanjiPattern, type Stroke } from "~/lib/kanji-match2";

const T = templates as unknown as Record<string, Stroke[]>;
const REFS = buildRefPatterns(T);

describe("kanji-match2 (Kanji Canvas port)", () => {
  it("buildRefPatterns creates patterns for all 638 kanji", () => {
    expect(REFS.length).toBe(638);
    const day = REFS.find(r => r.char === "日")!;
    expect(day.strokes).toBe(4);
    expect(day.pattern.length).toBe(4);
  });

  it("momentNormalize preserves stroke count", () => {
    const raw: Stroke[] = [[[10, 10], [50, 10]], [[30, 10], [30, 50]]];
    const norm = momentNormalize(raw);
    expect(norm.length).toBe(2);
  });

  it("extractFeatures reduces points but keeps endpoints", () => {
    const longStroke: [number, number][] = [];
    for (let i = 0; i < 100; i++) longStroke.push([i * 2, 100]);
    const feat = extractFeatures([longStroke], 20);
    expect(feat[0].length).toBeLessThan(100);
    expect(feat[0][0]).toEqual(longStroke[0]);
    expect(feat[0][feat[0].length - 1]).toEqual(longStroke[longStroke.length - 1]);
  });

  it("recognize: returns candidates for valid input", () => {
    // Use a simple synthetic kanji-like drawing (cross shape = 十)
    const drawn = [
      [{ x: 50, y: 10 }, { x: 50, y: 90 }], // vertical
      [{ x: 10, y: 50 }, { x: 90, y: 50 }], // horizontal
    ];
    const res = recognize(drawn, REFS, 8);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toHaveProperty("char");
    expect(res[0]).toHaveProperty("score");
  });

  it("recognize: returns candidates for complex kanji-like input", () => {
    // Draw something resembling 私 (7 strokes approximated)
    const drawn = [
      [{ x: 30, y: 20 }, { x: 70, y: 20 }], // top horizontal
      [{ x: 50, y: 20 }, { x: 50, y: 80 }], // vertical center
      [{ x: 30, y: 50 }, { x: 70, y: 50 }], // middle horizontal
      [{ x: 40, y: 65 }, { x: 60, y: 65 }], // lower horizontal
      [{ x: 45, y: 50 }, { x: 45, y: 80 }], // left leg
      [{ x: 55, y: 50 }, { x: 55, y: 80 }], // right leg
      [{ x: 35, y: 35 }, { x: 65, y: 35 }], // extra stroke
    ];
    const res = recognize(drawn, REFS, 16);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toHaveProperty("char");
    expect(res[0]).toHaveProperty("score");
  });

  it("recognize: empty input returns empty", () => {
    const res = recognize([], REFS, 8);
    expect(res).toEqual([]);
  });
});
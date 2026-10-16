import { describe, expect, it } from "vitest";
import templates from "../data/kanji-strokes.json";
import { matchScore, normalizeStrokes, rankCandidates, type Stroke } from "~/lib/kanji-match";

const T = templates as unknown as Record<string, Stroke[]>;

const jitter = (s: Stroke[], amt: number): Stroke[] =>
  s.map((st) =>
    st.map(([x, y], i) => [x + ((i * 37) % 7) * amt * 0.3, y - ((i * 53) % 5) * amt * 0.3] as [number, number]),
  );

describe("kanji-match", () => {
  it("template cocok dirinya sendiri (skor ~0, top-1)", () => {
    expect(matchScore(T["日"]!, T["日"]!)).toBeLessThan(0.001);
    expect(rankCandidates(T, T["日"]!, 8)[0]!.char).toBe("日");
  });

  it("日 bergeser/noise tetap top-3", () => {
    const noisy = jitter(T["日"]!, 6);
    const top3 = rankCandidates(T, noisy, 8).slice(0, 3).map((c) => c.char);
    expect(top3).toContain("日");
  });

  it("水 berurutan-salah (dibalik) tetap top-5", () => {
    const reversed = [...T["水"]!].reverse().map((st) => [...st].reverse() as Stroke);
    const top5 = rankCandidates(T, reversed, 8).slice(0, 5).map((c) => c.char);
    expect(top5).toContain("水");
  });

  it("beda jumlah gores jauh terfilter (一 vs 曜)", () => {
    const res = rankCandidates(T, T["一"]!, 8).map((c) => c.char);
    expect(res).not.toContain("曜");
  });

  it("normalizeStrokes skala piksel → 0..100", () => {
    const raw = [
      [{ x: 10, y: 20 }, { x: 110, y: 20 }],
      [{ x: 60, y: 10 }, { x: 60, y: 120 }],
    ];
    const n = normalizeStrokes(raw);
    expect(n).toHaveLength(2);
    const flat = n.flat();
    expect(Math.min(...flat.map((p) => p[0]))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...flat.map((p) => p[1]))).toBeLessThanOrEqual(100);
  });

  it("kosong → Infinity / []", () => {
    expect(matchScore(T["日"]!, [])).toBe(Infinity);
    expect(rankCandidates(T, [], 8)).toEqual([]);
  });
});

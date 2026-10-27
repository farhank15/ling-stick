import { describe, expect, it } from "vitest";
import textbook from "../data/textbook-strokes.json";
import levels from "../data/kanji-levels.json";
import { buildRefPatternsAll, recognize, type KanjiPattern } from "../app/lib/kanji-match2";

type Pt = [number, number];

const data = (textbook as unknown as { strokes: Record<string, Pt[][]> }).strokes;
const chars: string[] = (["n5", "n4", "n3"] as const).flatMap((key) =>
  (levels.levels[key] as ({ char: string } | string)[]).map((e) => (typeof e === "string" ? e : e.char)),
);

/** LCG deterministik — jitter sama tiap run supaya test tidak flaky. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("akurasi matcher vs template resmi", () => {
  it("coretan mengikuti template dikenali sebagai kanji yang benar", async () => {
    const refs: KanjiPattern[] = await buildRefPatternsAll();
    const rnd = seeded(20261026);
    const step = Math.max(1, Math.floor(chars.length / 60));
    const sample = chars.filter((_, i) => i % step === 0).slice(0, 60);

    let top1 = 0;
    const misses: string[] = [];
    for (const ch of sample) {
      const tpl = data[ch];
      if (!tpl) continue;
      // Simulasi tangan: skala ke kanvas ~300px, geser, goyang ±2px.
      const drawn = tpl.map((s) =>
        s.map(([x, y]) => ({ x: x * 2.7 + 20 + (rnd() - 0.5) * 4, y: y * 2.7 + 20 + (rnd() - 0.5) * 4 })),
      );
      const res = recognize(drawn, refs, 20);
      if (res[0]?.char === ch) top1++;
      else misses.push(`${ch}→${res[0]?.char ?? "?"}`);
    }

    const rate = top1 / sample.length;
    expect(rate, `meleset: ${misses.join(" ")}`).toBeGreaterThanOrEqual(0.95);
  });
});

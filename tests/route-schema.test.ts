import { describe, expect, it } from "vitest";
import { routeStepSchema } from "~/lib/route.schema";

const base = {
  step_id: "ja-n5-001",
  level: "N5",
  segment: 1,
  order: 1,
  title_id: "Judul",
  pattern: "X",
  objectives: ["Tujuan"],
  explanation_id: "Penjelasan yang cukup panjang melebihi dua puluh karakter.",
  examples: [
    { jp: "A。", kana: "あ。", arti_id: "A." },
    { jp: "B。", kana: "び。", arti_id: "B." },
    { jp: "C。", kana: "し。", arti_id: "C." },
  ],
  cloze_items: [
    { front: "___ A", answer: "A", distractors: ["B", "C"] },
    { front: "___ B", answer: "B", distractors: ["A", "C"] },
    { front: "___ C", answer: "C", distractors: ["A", "B"] },
    { front: "___ D", answer: "D", distractors: ["A", "B"] },
    { front: "___ E", answer: "E", distractors: ["A", "B"] },
  ],
};

describe("routeStepSchema", () => {
  it("menerima step valid + default register formal & passing 80", () => {
    const s = routeStepSchema.parse(base);
    expect(s.passing.grade_pct).toBe(80);
    expect(s.examples[0]!.register).toBe("formal");
  });

  it("menolak examples < 3 dan cloze < 5", () => {
    expect(() =>
      routeStepSchema.parse({ ...base, examples: base.examples.slice(0, 2) }),
    ).toThrow();
    expect(() =>
      routeStepSchema.parse({ ...base, cloze_items: base.cloze_items.slice(0, 4) }),
    ).toThrow();
  });

  it("menolak step_id / level / register tak valid", () => {
    expect(() => routeStepSchema.parse({ ...base, step_id: "n5-1" })).toThrow();
    expect(() => routeStepSchema.parse({ ...base, level: "N2" })).toThrow();
    expect(() =>
      routeStepSchema.parse({
        ...base,
        examples: [{ ...base.examples[0], register: "ngasal" }],
      }),
    ).toThrow();
  });
});

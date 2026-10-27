/**
 * Audit data goresan kanji vs jumlah goresan resmi (data/kanji-levels.json).
 * Deteksi regresi parser: jumlah goresan salah, goresan kosong, goresan degenerat.
 * Usage: npm run kanji:strokes-audit
 */
import { readFileSync } from "node:fs";

type Pt = [number, number];
type StrokeSet = Record<string, Pt[][]>;

const LEVELS_FILE = "data/kanji-levels.json";
const TARGETS: { label: string; file: string; field: "plain" | "wrapped" }[] = [
  { label: "kanji-strokes", file: "data/kanji-strokes.json", field: "plain" },
  { label: "textbook-strokes", file: "data/textbook-strokes.json", field: "wrapped" },
];

function load(file: string, field: "plain" | "wrapped"): StrokeSet {
  const raw = JSON.parse(readFileSync(file, "utf8")) as StrokeSet | { strokes: StrokeSet };
  return field === "wrapped" ? (raw as { strokes: StrokeSet }).strokes : (raw as StrokeSet);
}

function span(stroke: Pt[]): number {
  let max = 0;
  for (const [x, y] of stroke) max = Math.max(max, Math.hypot(x - stroke[0]![0], y - stroke[0]![1]));
  return max;
}

export function audit(file: string, field: "plain" | "wrapped"): {
  checked: number;
  wrongCount: string[];
  empty: string[];
  degenerate: string[];
} {
  const levels = JSON.parse(readFileSync(LEVELS_FILE, "utf8")).levels as Record<
    string,
    ({ char: string; strokes: number } | string)[]
  >;
  const official = new Map<string, number>();
  for (const list of Object.values(levels)) {
    for (const entry of list) {
      if (typeof entry !== "string" && typeof entry.strokes === "number") official.set(entry.char, entry.strokes);
    }
  }

  const data = load(file, field);
  const wrongCount: string[] = [];
  const empty: string[] = [];
  const degenerate: string[] = [];
  let checked = 0;

  for (const [ch, strokes] of Object.entries(data)) {
    const expected = official.get(ch);
    if (expected === undefined) continue;
    checked++;
    if (strokes.length === 0) {
      empty.push(ch);
      continue;
    }
    if (strokes.length !== expected) wrongCount.push(`${ch} ${strokes.length}/${expected}`);
    if (strokes.some((s) => s.length === 0 || span(s) < 1)) degenerate.push(ch);
  }

  return { checked, wrongCount, empty, degenerate };
}

function main() {
  let bad = false;
  for (const target of TARGETS) {
    const r = audit(target.file, target.field);
    const match = r.checked - r.wrongCount.length - r.empty.length;
    const pct = r.checked === 0 ? 0 : (match / r.checked) * 100;
    console.log(`\n${target.label}: ${match}/${r.checked} cocok (${pct.toFixed(1)}%)`);
    if (r.wrongCount.length > 0) {
      console.log(`  jumlah goresan salah (${r.wrongCount.length}): ${r.wrongCount.slice(0, 15).join(", ")}${r.wrongCount.length > 15 ? " …" : ""}`);
    }
    if (r.empty.length > 0) console.log(`  tanpa goresan (${r.empty.length}): ${r.empty.join(" ")}`);
    if (r.degenerate.length > 0) console.log(`  goresan degenerat (${r.degenerate.length}): ${r.degenerate.slice(0, 15).join(" ")}`);
    if (pct < 95 || r.empty.length > 0 || r.degenerate.length > 0) bad = true;
  }
  if (bad) {
    console.log("\nAUDIT GAGAL — target ≥95% cocok, tanpa goresan kosong/degenerat.");
    process.exit(1);
  }
  console.log("\nAUDIT LULUS.");
}

main();

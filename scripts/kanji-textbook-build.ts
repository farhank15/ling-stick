/**
 * Parse KanjiVG SVGs → extract textbook stroke order (kvg:number) → generate textbook-strokes.json.
 * KanjiVG © Ulrich Apel, CC BY-SA 3.0.
 * Usage: npm run kanji:textbook
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadSvg, normalizeCentered, parseStrokes, type Pt } from "./lib/kanjivg";

const OUTPUT_FILE = "data/textbook-strokes.json";
const LEVELS_FILE = "data/kanji-levels.json";

type Stroke = Pt;

async function main() {
  const levels = JSON.parse(readFileSync(LEVELS_FILE, "utf8")).levels;
  const allChars: string[] = (["n5", "n4", "n3", "n2", "n1"] as const).flatMap((key) =>
    (levels[key] as ({ char: string } | string)[]).map((e) => (typeof e === "string" ? e : e.char)),
  );
  const uniqueChars = [...new Set(allChars)];
  console.log(`Processing ${uniqueChars.length} kanji...`);

  const out: Record<string, Stroke[][]> = {};
  const failed: string[] = [];

  for (const ch of uniqueChars) {
    try {
      const strokes = parseStrokes(await loadSvg(ch));
      if (strokes.length === 0) failed.push(ch);
      else out[ch] = normalizeCentered(strokes);
    } catch (e) {
      failed.push(ch);
      console.log(`  gagal: ${ch}`, e instanceof Error ? e.message : e);
    }
    const done = Object.keys(out).length + failed.length;
    if (done % 200 === 0) console.log(`  ${done}/${uniqueChars.length} (ok:${Object.keys(out).length} fail:${failed.length})`);
  }

  const output = {
    version: "textbook-stroke-order-from-kanjivg",
    source: "KanjiVG (CC BY-SA 3.0) - stroke order from kvg:number attribute",
    generated: new Date().toISOString(),
    count: Object.keys(out).length,
    strokes: out,
  };

  // matcha:explain JSON kompak — berkas ini di-lazy-load di klien; indentasi menambah ~3x ukuran.
  writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  console.log(`\nDone! ${output.count} kanji written to ${OUTPUT_FILE}, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log(`  tanpa goresan: ${failed.join(" ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

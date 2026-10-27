/**
 * Build template goresan KanjiVG (N5–N3, 638 kanji) untuk matcher draw-mode.
 * Output: data/kanji-strokes.json { char: [[x,y]...] } ternormalisasi 0..100, 16 titik/gores.
 * KanjiVG © Ulrich Apel, CC BY-SA 3.0 — atribusi di UI.
 * Usage: npm run kanji:strokes
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadSvg, normalizeStretch, parseStrokes, type Pt } from "./lib/kanjivg";

const OUT_FILE = "data/kanji-strokes.json";
const LEVELS_FILE = "data/kanji-levels.json";

async function main() {
  const levels = JSON.parse(readFileSync(LEVELS_FILE, "utf8")).levels;
  const chars: string[] = [...levels.n5, ...levels.n4, ...levels.n3].map((e: { char: string } | string) =>
    typeof e === "string" ? e : e.char,
  );
  console.log(`kanji: ${chars.length}`);

  const out: Record<string, Pt[][]> = {};
  const failed: string[] = [];
  for (const ch of chars) {
    try {
      const strokes = parseStrokes(await loadSvg(ch));
      if (strokes.length === 0) {
        failed.push(ch);
        continue;
      }
      out[ch] = normalizeStretch(strokes);
    } catch (e) {
      failed.push(ch);
      console.log(`  gagal: ${ch}`, e instanceof Error ? e.message : e);
    }
    if (Object.keys(out).length % 100 === 0 && out[ch]) {
      console.log(`  ${Object.keys(out).length}/${chars.length}`);
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(out) + "\n");
  console.log(`kanji:strokes OK — ${Object.keys(out).length}/${chars.length}`);
  if (failed.length > 0) {
    console.log(`  tanpa goresan (${failed.length}): ${failed.join(" ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

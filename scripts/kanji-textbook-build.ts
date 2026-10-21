/**
 * Parse KanjiVG SVGs → extract textbook stroke order (kvg:number) → generate textbook-strokes.json.
 * KanjiVG © Ulrich Apel, CC BY-SA 3.0.
 * Usage: npm run kanji:textbook
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Stroke = [number, number][];
type KanjiStrokes = Record<string, Stroke[]>;

const KANJIVG_DIR = "data/kanjivg"; // akan di-download kalau belum ada
const OUTPUT_FILE = "data/textbook-strokes.json";
const KANJI_LEVELS_FILE = "data/kanji-levels.json";

// ──────────────────────────────────────────────────────────────
// Download KanjiVG jika belum ada
// ──────────────────────────────────────────────────────────────

async function ensureKanjiVG(): Promise<void> {
  // No download needed - we fetch SVGs directly from GitHub raw
  console.log("Using KanjiVG from GitHub raw...");
}

// ──────────────────────────────────────────────────────────────
// Parse SVG: extract paths grouped by kvg:number
// ──────────────────────────────────────────────────────────────

function hex5(ch: string): string {
  return ch.codePointAt(0)!.toString(16).padStart(5, "0");
}

function parsePath(d: string): Stroke {
  const toks = d.match(/[MmLlCcQqZz]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const pts: Stroke = [];
  let i = 0;
  let cmd = "";
  const num = () => parseFloat(toks[i++]!);
  
  while (i < toks.length) {
    const t = toks[i]!;
    if (/[MmLlCcQqZz]/.test(t)) { cmd = t; i++; }
    if (cmd === "Z" || cmd === "z") { cx = sx; cy = sy; continue; }
    const rel = cmd === cmd.toLowerCase();
    const X = (v: number) => rel ? cx + v : v;
    const Y = (v: number) => rel ? cy + v : v;
    
    if (cmd === "M" || cmd === "m" || cmd === "L" || cmd === "l") {
      cx = X(num()); cy = Y(num());
      if (cmd === "M" || cmd === "m") { sx = cx; sy = cy; }
      pts.push([cx, cy]);
      cmd = cmd === "M" || cmd === "m" ? (rel ? "l" : "L") : cmd;
    } else if (cmd === "C" || cmd === "c") {
      const x1 = X(num()), y1 = Y(num()), x2 = X(num()), y2 = Y(num());
      const x = X(num()), y = Y(num());
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, v = 1 - u;
        pts.push([
          v*v*v*cx + 3*v*v*u*x1 + 3*v*u*u*x2 + u*u*u*x,
          v*v*v*cy + 3*v*v*u*y1 + 3*v*u*u*y2 + u*u*u*y,
        ]);
      }
      cx = x; cy = y;
    } else if (cmd === "Q" || cmd === "q") {
      const x1 = X(num()), y1 = Y(num()), x = X(num()), y = Y(num());
      for (let k = 1; k <= 6; k++) {
        const u = k / 6, v = 1 - u;
        pts.push([v*v*cx + 2*v*u*x1 + u*u*x, v*v*cy + 2*v*u*y1 + u*u*y]);
      }
      cx = x; cy = y;
    } else { i++; }
  }
  return pts;
}

function resample(pts: Stroke, n: number): Stroke {
  if (pts.length === 0) return [];
  const total = pts.reduce((a, p, k) => k === 0 ? 0 : a + Math.hypot(p[0]-pts[k-1]![0], p[1]-pts[k-1]![1]), 0);
  if (total === 0) return Array.from({ length: n }, () => [pts[0]![0], pts[0]![1]]);
  const out: Stroke = [[pts[0]![0], pts[0]![1]]];
  let acc = 0;
  const step = total / (n - 1);
  for (let k = 1; k < pts.length && out.length < n; k++) {
    const a = pts[k-1]!, b = pts[k]!;
    const d = Math.hypot(b[0]-a[0], b[1]-a[1]);
    while (acc + d >= out.length * step && out.length < n) {
      const need = out.length * step - acc;
      const u = d === 0 ? 0 : need / d;
      out.push([a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u]);
    }
    acc += d;
  }
  while (out.length < n) out.push([pts[pts.length-1]![0], pts[pts.length-1]![1]]);
  return out;
}

async function parseKanjiVGSVG(char: string): Promise<Stroke[]> {
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex5(char)}.svg`;
  try {
    const svg = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    
    // Cari StrokePaths group
    const strokePathsMatch = svg.match(/<g[^>]*id="kvg:StrokePaths_[^"]*"[^>]*>([\s\S]*?)<\/g>/);
    const targetGroup = strokePathsMatch?.[1] ?? svg;
    
    // Extract paths dengan stroke number dari id="kvg:xxxx-s{N}"
    const pathRegex = /<path[^>]*id="kvg:[^"]*-s(\d+)"[^>]*d="([^"]+)"/g;
    const strokesByNum: Map<number, Stroke> = new Map();
    
    let match;
    while ((match = pathRegex.exec(targetGroup)) !== null) {
      const num = parseInt(match[1]!, 10);
      const d = match[2]!;
      const pts = parsePath(d);
      if (pts.length > 1) {
        const resampled = resample(pts, 16);
        strokesByNum.set(num, resampled);
      }
    }
    
    // Fallback: if no id-based numbers, try StrokeNumbers group text positions
    if (strokesByNum.size === 0) {
      const numRegex = /<text[^>]*transform="[^"]*"[^>]*>(\d+)<\/text>/g;
      const nums: number[] = [];
      let m;
      while ((m = numRegex.exec(svg)) !== null) {
        nums.push(parseInt(m[1]!, 10));
      }
      if (nums.length > 0) {
        // Extract all paths in document order
        const pathRegex2 = /<path[^>]*d="([^"]+)"/g;
        const paths: Stroke[] = [];
        while ((m = pathRegex2.exec(targetGroup)) !== null) {
          const pts = parsePath(m[1]!);
          if (pts.length > 1) paths.push(resample(pts, 16));
        }
        // Assign by order (assumes paths are in stroke order)
        nums.sort((a,b)=>a-b).forEach((n, i) => {
          if (paths[i]) strokesByNum.set(n, paths[i]);
        });
      }
    }
    
    // Sort by stroke number (textbook stroke order)
    const sortedNums = [...strokesByNum.keys()].sort((a, b) => a - b);
    return sortedNums.map(n => strokesByNum.get(n)!).filter(s => s.length > 0);
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  await ensureKanjiVG();
  
  // Load kanji levels (N5-N1)
  const levels = JSON.parse(readFileSync(KANJI_LEVELS_FILE, "utf8")).levels;
  const allChars: string[] = [
    ...levels.n5.map((e: any) => typeof e === "string" ? e : e.char),
    ...levels.n4.map((e: any) => typeof e === "string" ? e : e.char),
    ...levels.n3.map((e: any) => typeof e === "string" ? e : e.char),
    ...levels.n2.map((e: any) => typeof e === "string" ? e : e.char),
    ...levels.n1.map((e: any) => typeof e === "string" ? e : e.char),
  ];
  const uniqueChars = [...new Set(allChars)];
  console.log(`Processing ${uniqueChars.length} kanji...`);
  
  const out: KanjiStrokes = {};
  let ok = 0, fail = 0;
  
  // Process in batches of 5 concurrent with delay to avoid rate limiting
  const BATCH = 5;
  for (let i = 0; i < uniqueChars.length; i += BATCH) {
    const batch = uniqueChars.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (ch) => {
        try {
          const strokes = await parseKanjiVGSVG(ch);
          if (strokes.length > 0) {
            const xs = strokes.flat().map(p => p[0]);
            const ys = strokes.flat().map(p => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
            
            return { ch, strokes: strokes.map(s =>
              s.map(([x, y]) => [
                Math.round(((x - cx) / Math.max(w, h)) * 100 + 50),
                Math.round(((y - cy) / Math.max(w, h)) * 100 + 50)
              ]) as Stroke
            )};
          }
        } catch {}
        return { ch, strokes: [] as Stroke[] };
      })
    );
    
    for (const r of results) {
      if (r.strokes.length > 0) { out[r.ch] = r.strokes; ok++; }
      else { fail++; }
    }
    
    // Small delay between batches
    await new Promise(r => setTimeout(r, 500));
    
    if ((i + BATCH) % 100 === 0 || i + BATCH >= uniqueChars.length) {
      console.log(`  ${Math.min(i + BATCH, uniqueChars.length)}/${uniqueChars.length} (ok:${ok} fail:${fail})`);
    }
  }
  
  // Add header
  const output = {
    version: "textbook-stroke-order-from-kanjivg",
    source: "KanjiVG (CC BY-SA 3.0) - stroke order from kvg:number attribute",
    generated: new Date().toISOString(),
    count: Object.keys(out).length,
    strokes: out
  };
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 1));
  console.log(`\nDone! ${ok} kanji written to ${OUTPUT_FILE}, ${fail} failed`);
  
  // Quick verification
  for (const ch of ["一","二","三","十","日","月","木","火","水","金","土","私","人","入","八","九","七","五","六"]) {
    const s = out[ch]?.length ?? 0;
    console.log(`  ${ch}: ${s} strokes`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
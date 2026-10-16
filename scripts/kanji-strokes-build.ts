/**
 * Build template goresan KanjiVG (N5–N3, 638 kanji) untuk matcher draw-mode.
 * Output: data/kanji-strokes.json { char: [[x,y]...] } ternormalisasi 0..100, 16 titik/gores.
 * KanjiVG © Ulrich Apel, CC BY-SA 3.0 — atribusi di UI.
 * Usage: npm run kanji:strokes
 */
import { readFileSync, writeFileSync } from "node:fs";

type Pt = [number, number];

function hex5(ch: string): string {
  return ch.codePointAt(0)!.toString(16).padStart(5, "0");
}

/** Parser path SVG minimal (M L C Q Z absolut+relatif) → polyline. */
function parsePath(d: string): Pt[] {
  const toks = d.match(/[MmLlCcQqZz]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const pts: Pt[] = [];
  let i = 0;
  let cmd = "";
  const num = () => parseFloat(toks[i++]!);
  while (i < toks.length) {
    const t = toks[i]!;
    if (/[MmLlCcQqZz]/.test(t)) {
      cmd = t;
      i++;
    }
    if (cmd === "Z" || cmd === "z") {
      cx = sx;
      cy = sy;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const X = (v: number) => (rel ? cx + v : v);
    const Y = (v: number) => (rel ? cy + v : v);
    if (cmd === "M" || cmd === "m" || cmd === "L" || cmd === "l") {
      cx = X(num());
      cy = Y(num());
      if (cmd === "M" || cmd === "m") {
        sx = cx;
        sy = cy;
      }
      pts.push([cx, cy]);
      cmd = cmd === "M" || cmd === "m" ? (rel ? "l" : "L") : cmd;
    } else if (cmd === "C" || cmd === "c") {
      const x1 = X(num()), y1 = Y(num()), x2 = X(num()), y2 = Y(num());
      const x = X(num()), y = Y(num());
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, v = 1 - u;
        pts.push([
          v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
          v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
        ]);
      }
      cx = x;
      cy = y;
    } else if (cmd === "Q" || cmd === "q") {
      const x1 = X(num()), y1 = Y(num());
      const x = X(num()), y = Y(num());
      for (let k = 1; k <= 6; k++) {
        const u = k / 6, v = 1 - u;
        pts.push([
          v * v * cx + 2 * v * u * x1 + u * u * x,
          v * v * cy + 2 * v * u * y1 + u * u * y,
        ]);
      }
      cx = x;
      cy = y;
    } else {
      i++;
    }
  }
  return pts;
}

/** Resample polyline → n titik merata. */
function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  const total = pts.reduce((a, p, k) => (k === 0 ? 0 : a + Math.hypot(p[0] - pts[k - 1]![0], p[1] - pts[k - 1]![1])), 0);
  if (total === 0) return Array.from({ length: n }, () => [pts[0]![0], pts[0]![1]] as Pt);
  const out: Pt[] = [[pts[0]![0], pts[0]![1]]];
  let acc = 0;
  const step = total / (n - 1);
  for (let k = 1; k < pts.length && out.length < n; k++) {
    const a = pts[k - 1]!, b = pts[k]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + d >= (out.length) * step && out.length < n) {
      const need = out.length * step - acc;
      const u = d === 0 ? 0 : need / d;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    acc += d;
  }
  while (out.length < n) out.push([pts[pts.length - 1]![0], pts[pts.length - 1]![1]]);
  return out;
}

async function main() {
  const levels = JSON.parse(readFileSync("data/kanji-levels.json", "utf8")).levels;
  const chars: string[] = [...levels.n5, ...levels.n4, ...levels.n3].map((e: { char: string } | string) =>
    typeof e === "string" ? e : e.char,
  );
  console.log(`kanji: ${chars.length}`);
  const out: Record<string, Pt[][]> = {};
  let ok = 0;
  for (const ch of chars) {
    const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex5(ch)}.svg`;
    try {
      const svg = await (await fetch(url)).text();
      // Goresan = path di grup StrokePaths, urutan dokumen = urutan gores.
      const group = svg.match(/<g[^>]*StrokePaths[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? svg;
      const ds = [...group.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]!);
      const strokes = ds.map((d) => resample(parsePath(d), 16)).filter((s) => s.length > 0);
      if (strokes.length === 0) {
        console.log(`  kosong: ${ch}`);
        continue;
      }
      // Normalisasi global 0..100 (bentuk utuh, bukan per gores).
      const xs = strokes.flat().map((p) => p[0]);
      const ys = strokes.flat().map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
      out[ch] = strokes.map((s) =>
        s.map(([x, y]) => [Math.round(((x - minX) / w) * 100), Math.round(((y - minY) / h) * 100)] as Pt),
      );
      ok++;
      if (ok % 100 === 0) console.log(`  ${ok}/${chars.length}`);
    } catch (e) {
      console.log(`  gagal: ${ch}`, e instanceof Error ? e.message : e);
    }
  }
  writeFileSync("data/kanji-strokes.json", JSON.stringify(out) + "\n");
  console.log(`kanji:strokes OK — ${ok}/${chars.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Parser KanjiVG bersama untuk skrip build goresan.
 * KanjiVG © Ulrich Apel, CC BY-SA 3.0 — https://kanjivg.tagaini.net
 *
 * Satu sumber kebenaran: semua `<path id="kvg:…-sN">` di seluruh SVG,
 * diurutkan menurut nomor goresan. Jangan pakai regex grup `<g>…</g>` —
 * KanjiVG menyusun subgrup bersarang sehingga tangkapan non-greedy
 * kehilangan sebagian besar goresan.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Pt = [number, number];

const CACHE_DIR = "data/kanjivg";
const RAW_BASE = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji";

/** Titik kode → nama berkas KanjiVG 5 digit heksadesimal. */
export function hex5(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp === undefined) throw new Error(`karakter kosong: "${ch}"`);
  return cp.toString(16).padStart(5, "0");
}

/** SVG KanjiVG dari cache lokal, unduh sekali lalu simpan. */
export async function loadSvg(ch: string): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `${hex5(ch)}.svg`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const res = await fetch(`${RAW_BASE}/${hex5(ch)}.svg`);
  if (!res.ok) throw new Error(`KanjiVG ${ch}: HTTP ${res.status}`);
  const svg = await res.text();
  writeFileSync(file, svg);
  return svg;
}

const CMD_ARGS: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

const CURVE_SAMPLES = 8;
const QUAD_SAMPLES = 6;
const ARC_SAMPLES = 12;

/**
 * Path SVG → polyline. Mendukung M L H V C S Q T A Z (absolut + relatif).
 * KanjiVG hanya memakai M C S, tapi cabang lain dijaga supaya parser tidak
 * diam-diam membuang segmen kalau format sumber berubah.
 */
export function parsePath(d: string): Pt[] {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  /** Titik kontrol cubic/quad sebelumnya — untuk pantulan S/T. */
  let px = 0;
  let py = 0;
  let prev = "";
  let i = 0;
  let cmd = "";

  const num = (): number => {
    const t = toks[i++];
    if (t === undefined) throw new Error(`path terpotong: "${d}"`);
    return Number(t);
  };

  while (i < toks.length) {
    const t = toks[i]!;
    if (/^[A-Za-z]$/.test(t)) {
      cmd = t;
      i++;
    } else if (cmd === "") {
      throw new Error(`path tanpa perintah: "${d}"`);
    } else if (cmd === "M") {
      cmd = "L";
    } else if (cmd === "m") {
      cmd = "l";
    }

    const up = cmd.toUpperCase();
    if (up === "Z") {
      cx = sx;
      cy = sy;
      if (pts.length > 0 && (cx !== pts[pts.length - 1]![0] || cy !== pts[pts.length - 1]![1])) {
        pts.push([cx, cy]);
      }
      prev = "Z";
      continue;
    }

    const argCount = CMD_ARGS[up];
    if (argCount === undefined) throw new Error(`perintah path tak didukung "${cmd}" di "${d}"`);
    const rel = cmd !== up;
    const X = (v: number) => (rel ? cx + v : v);
    const Y = (v: number) => (rel ? cy + v : v);

    if (up === "M" || up === "L") {
      cx = X(num());
      cy = Y(num());
      if (up === "M") {
        sx = cx;
        sy = cy;
      }
      pts.push([cx, cy]);
    } else if (up === "H") {
      cx = rel ? cx + num() : num();
      pts.push([cx, cy]);
    } else if (up === "V") {
      cy = rel ? cy + num() : num();
      pts.push([cx, cy]);
    } else if (up === "C" || up === "S") {
      let x1: number;
      let y1: number;
      if (up === "C") {
        x1 = X(num());
        y1 = Y(num());
      } else {
        const mirror = prev === "C" || prev === "S";
        x1 = mirror ? 2 * cx - px : cx;
        y1 = mirror ? 2 * cy - py : cy;
      }
      const x2 = X(num());
      const y2 = Y(num());
      const x = X(num());
      const y = Y(num());
      for (let k = 1; k <= CURVE_SAMPLES; k++) {
        const u = k / CURVE_SAMPLES;
        const v = 1 - u;
        pts.push([
          v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
          v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
        ]);
      }
      px = x2;
      py = y2;
      cx = x;
      cy = y;
    } else if (up === "Q" || up === "T") {
      let x1: number;
      let y1: number;
      if (up === "Q") {
        x1 = X(num());
        y1 = Y(num());
      } else {
        const mirror = prev === "Q" || prev === "T";
        x1 = mirror ? 2 * cx - px : cx;
        y1 = mirror ? 2 * cy - py : cy;
      }
      const x = X(num());
      const y = Y(num());
      for (let k = 1; k <= QUAD_SAMPLES; k++) {
        const u = k / QUAD_SAMPLES;
        const v = 1 - u;
        pts.push([v * v * cx + 2 * v * u * x1 + u * u * x, v * v * cy + 2 * v * u * y1 + u * u * y]);
      }
      px = x1;
      py = y1;
      cx = x;
      cy = y;
    } else {
      // Busur (A): sampel elips supaya bentuk tetap utuh.
      const rx = Math.abs(num());
      const ry = Math.abs(num());
      const rot = (num() * Math.PI) / 180;
      const large = num() !== 0;
      const sweep = num() !== 0;
      const x = X(num());
      const y = Y(num());
      pts.push(...sampleArc(cx, cy, rx, ry, rot, large, sweep, x, y));
      cx = x;
      cy = y;
    }
    prev = up;
  }
  return pts;
}

/** Endpoint → center parameterization (SVG spec F.6.5) lalu sampel. */
function sampleArc(
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  rot: number,
  large: boolean,
  sweep: boolean,
  x1: number,
  y1: number,
): Pt[] {
  if (rx === 0 || ry === 0) return [[x1, y1]];
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  const scale = lambda > 1 ? Math.sqrt(lambda) : 1;
  const arx = rx * scale;
  const ary = ry * scale;
  const sign = large === sweep ? -1 : 1;
  const num = Math.max(0, arx * arx * ary * ary - arx * arx * y1p * y1p - ary * ary * x1p * x1p);
  const den = arx * arx * y1p * y1p + ary * ary * x1p * x1p;
  const coef = den === 0 ? 0 : sign * Math.sqrt(num / den);
  const cxp = (coef * arx * y1p) / ary;
  const cyp = (-coef * ary * x1p) / arx;
  const cx = cos * cxp - sin * cyp + (x0 + x1) / 2;
  const cy = sin * cxp + cos * cyp + (y0 + y1) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 0 : dot / len)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const theta0 = angle(1, 0, (x1p - cxp) / arx, (y1p - cyp) / ary);
  const delta = angle((x1p - cxp) / arx, (y1p - cyp) / ary, (-x1p - cxp) / arx, (-y1p - cyp) / ary);
  const sweepAngle = sweep && delta < 0 ? delta + 2 * Math.PI : !sweep && delta > 0 ? delta - 2 * Math.PI : delta;
  const out: Pt[] = [];
  for (let k = 1; k <= ARC_SAMPLES; k++) {
    const th = theta0 + (sweepAngle * k) / ARC_SAMPLES;
    const ex = arx * Math.cos(th);
    const ey = ary * Math.sin(th);
    out.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return out;
}

/** Polyline → n titik berjarak sama (termasuk titik terakhir persis). */
export function resample(pts: Pt[], n: number): Pt[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => [pts[0]![0], pts[0]![1]] as Pt);
  const segs: number[] = [];
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
    segs.push(d);
    total += d;
  }
  if (total === 0) return Array.from({ length: n }, () => [pts[0]![0], pts[0]![1]] as Pt);
  const step = total / (n - 1);
  const out: Pt[] = [[pts[0]![0], pts[0]![1]]];
  let seg = 0;
  let acc = 0;
  for (let k = 1; k < n; k++) {
    const target = k * step;
    while (seg < segs.length - 1 && acc + segs[seg]! < target) {
      acc += segs[seg]!;
      seg++;
    }
    const d = segs[seg]!;
    const u = d === 0 ? 0 : Math.min(1, (target - acc) / d);
    const a = pts[seg]!;
    const b = pts[seg + 1]!;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  // Titik terakhir dijamin tepat di ujung polyline (bukan duplikat titik sebelumnya).
  out[n - 1] = [pts[pts.length - 1]![0], pts[pts.length - 1]![1]];
  return out;
}

export type StrokePath = { num: number; d: string };

/**
 * Semua goresan dari satu SVG KanjiVG, urut nomor goresan.
 * Nomor `sN` adalah urutan goresan resmi (bukan urutan dokumen).
 */
export function extractStrokePaths(svg: string): StrokePath[] {
  const found: StrokePath[] = [];
  const seen = new Set<number>();
  for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = m[0];
    const id = tag.match(/\bid="kvg:[^"]*?-s(\d+)"/);
    if (!id) continue;
    const d = tag.match(/\sd="([^"]*)"/);
    if (!d || d[1]!.trim() === "") continue;
    const num = Number(id[1]);
    if (seen.has(num)) continue;
    seen.add(num);
    found.push({ num, d: d[1]! });
  }
  found.sort((a, b) => a.num - b.num);
  return found;
}

/** Goresan → polyline 16 titik, siap dipakai matcher. */
export function parseStrokes(svg: string, pointsPerStroke = 16): Pt[][] {
  return extractStrokePaths(svg)
    .map((s) => resample(parsePath(s.d), pointsPerStroke))
    .filter((s) => s.length > 0);
}

/** Normalisasi global 0..100 — regangkan tiap sumbu (bentuk utuh). */
export function normalizeStretch(strokes: Pt[][]): Pt[][] {
  const xs = strokes.flat().map((p) => p[0]);
  const ys = strokes.flat().map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return strokes.map((s) =>
    s.map(([x, y]) => [Math.round(((x - minX) / w) * 100), Math.round(((y - minY) / h) * 100)] as Pt),
  );
}

/** Normalisasi 0..100 dengan rasio aspek dijaga, di tengah kotak. */
export function normalizeCentered(strokes: Pt[][]): Pt[][] {
  const xs = strokes.flat().map((p) => p[0]);
  const ys = strokes.flat().map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(1, maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return strokes.map((s) =>
    s.map(([x, y]) => [Math.round(((x - cx) / span) * 100 + 50), Math.round(((y - cy) / span) * 100 + 50)] as Pt),
  );
}

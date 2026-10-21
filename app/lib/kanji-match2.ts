/**
 * Kanji Canvas matcher port (MIT licensed, asdfjkl/kanjicanvas).
 * Algorithm: Wakahara et al. + Klein 2019 improvements.
 * - Moment normalization (preserves spatial layout)
 * - Feature extraction (interval-based resampling)
 * - 4 distance metrics: endpoint, initial, whole-whole, directional
 * - Greedy init + L=3 iterative improvement stroke mapping
 * - completeMap with concatenation (n-m correspondence)
 * - Two-stage: coarse (endpoint) → fine (weighted whole-whole)
 */

export type Stroke = [number, number][]; // points in 256x256 moment-normalized space
export type KanjiPattern = { char: string; strokes: number; pattern: Stroke[] };

// ──────────────────────────────────────────────────────────────
// Moment normalization (preserves relative geometry)
// ──────────────────────────────────────────────────────────────

function m00(pattern: Stroke[]): number {
  let sum = 0;
  for (const s of pattern) sum += s.length;
  return sum;
}

function m10(pattern: Stroke[]): number {
  let sum = 0;
  for (const s of pattern) for (const p of s) sum += p[0];
  return sum;
}

function m01(pattern: Stroke[]): number {
  let sum = 0;
  for (const s of pattern) for (const p of s) sum += p[1];
  return sum;
}

function mu20(pattern: Stroke[], xc: number): number {
  let sum = 0;
  for (const s of pattern) for (const p of s) { const d = p[0] - xc; sum += d * d; }
  return sum;
}

function mu02(pattern: Stroke[], yc: number): number {
  let sum = 0;
  for (const s of pattern) for (const p of s) { const d = p[1] - yc; sum += d * d; }
  return sum;
}

function aran(width: number, height: number): number {
  const r1 = height > width ? width / height : height / width;
  return Math.sqrt(Math.sin((Math.PI / 2) * r1));
}

/** Moment-normalize strokes to 256x256 canvas centered on centroid, scaled by central moments. */
export function momentNormalize(raw: Stroke[]): Stroke[] {
  let xMin = 256, xMax = 0, yMin = 256, yMax = 0;
  for (const s of raw) for (const p of s) {
    if (p[0] < xMin) xMin = p[0];
    if (p[0] > xMax) xMax = p[0];
    if (p[1] < yMin) yMin = p[1];
    if (p[1] > yMax) yMax = p[1];
  }
  const oldW = Math.max(1, xMax - xMin);
  const oldH = Math.max(1, yMax - yMin);

  const newW = 256, newH = 256;
  const r2 = aran(oldW, oldH);
  const aranW = oldH > oldW ? r2 * newW : newW;
  const aranH = oldH > oldW ? newH : r2 * newH;
  const xOff = (newW - aranW) / 2;
  const yOff = (newH - aranH) / 2;

  const m00_ = m00(raw);
  if (m00_ === 0) return raw;
  const xc = m10(raw) / m00_;
  const yc = m01(raw) / m00_;

  const alpha = aranW / (4 * Math.sqrt(Math.max(1e-6, mu20(raw, xc) / m00_))) || 0;
  const beta  = aranH / (4 * Math.sqrt(Math.max(1e-6, mu02(raw, yc) / m00_))) || 0;
  const xcH = aranW / 2;
  const ycH = aranH / 2;

  const out: Stroke[] = [];
  for (const s of raw) {
    const ns: Stroke = [];
    for (const p of s) {
      const nx = alpha * (p[0] - xc) + xcH + xOff;
      const ny = beta  * (p[1] - yc) + ycH + yOff;
      ns.push([Math.max(0, Math.min(255, nx)), Math.max(0, Math.min(255, ny))]);
    }
    out.push(ns);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Feature extraction: resample at regular intervals
// ──────────────────────────────────────────────────────────────

function euclid(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

/** Extract feature points at ~20px intervals along each stroke. */
export function extractFeatures(pattern: Stroke[], interval = 20): Stroke[] {
  const out: Stroke[] = [];
  for (const s of pattern) {
    if (s.length === 0) { out.push([]); continue; }
    const feat: Stroke = [s[0]];
    let dist = 0;
    for (let j = 1; j < s.length; j++) {
      dist += euclid(s[j - 1], s[j]);
      if (dist >= interval && j > 1) {
        dist -= interval;
        feat.push(s[j]);
      }
    }
    if (feat.length === 1) feat.push(s[s.length - 1]);
    else if (dist > 0.75 * interval) feat.push(s[s.length - 1]);
    out.push(feat);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Distance metrics (Manhattan-ish)
// ──────────────────────────────────────────────────────────────

function endpointDist(a: Stroke, b: Stroke): number {
  if (!a.length || !b.length) return 0;
  return Math.abs(a[0][0] - b[0][0]) + Math.abs(a[0][1] - b[0][1]) +
         Math.abs(a[a.length - 1][0] - b[b.length - 1][0]) + Math.abs(a[a.length - 1][1] - b[b.length - 1][1]);
}

function initialDist(a: Stroke, b: Stroke): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]);
  const m = Math.max(a.length, b.length);
  return sum * (m / n);
}

function wholeWholeDist(a: Stroke, b: Stroke): number {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0) return 0;
  let sum = 0;
  for (let i = 0; i < Math.min(n, m); i++) {
    const j = Math.floor((n / Math.max(n, m)) * i);
    sum += Math.abs(a[j][0] - b[i][0]) + Math.abs(a[j][1] - b[i][1]);
  }
  return Math.floor(sum / Math.min(n, m));
}

function getLargerAndSize(a: Stroke[], b: Stroke[]): [Stroke[], Stroke[], number, number] {
  if (a.length >= b.length) return [a, b, a.length, b.length];
  return [b, a, b.length, a.length];
}

// ──────────────────────────────────────────────────────────────
// Stroke mapping: greedy init → iterative improvement → completeMap
// ──────────────────────────────────────────────────────────────

type DistFn = (a: Stroke, b: Stroke) => number;

function initStrokeMap(a: Stroke[], b: Stroke[], distFn: DistFn): number[] {
  const [k1, k2, n, m] = getLargerAndSize(a, b);
  const map = new Array(n).fill(-1);
  const free = new Array(n).fill(true);
  for (let i = 0; i < m; i++) {
    let bestD = Infinity, bestJ = -1;
    for (let j = 0; j < n; j++) if (free[j]) {
      const d = distFn(k1[j], k2[i]);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ >= 0) { free[bestJ] = false; map[bestJ] = i; }
  }
  return map;
}

function getMap(a: Stroke[], b: Stroke[], distFn: DistFn): number[] {
  const [k1, k2, n, m] = getLargerAndSize(a, b);
  let map = initStrokeMap(a, b, distFn);
  const L = 3;
  for (let iter = 0; iter < L; iter++) {
    for (let i = 0; i < n; i++) {
      if (map[i] === -1) continue;
      const dii = distFn(k1[i], k2[map[i]]);
      for (let j = 0; j < n; j++) {
        if (map[i] === -1) break;
        if (map[j] === -1) {
          const dij = distFn(k1[j], k2[map[i]]);
          if (dij < dii) { map[j] = map[i]; map[i] = -1; break; }
        } else {
          const djj = distFn(k1[j], k2[map[j]]);
          const dij = distFn(k1[j], k2[map[i]]);
          const dji = distFn(k1[i], k2[map[j]]);
          if (dji + dij < dii + djj) {
            const tmp = map[j]; map[j] = map[i]; map[i] = tmp;
          }
        }
      }
    }
  }
  return map;
}

function completeMap(a: Stroke[], b: Stroke[], distFn: DistFn, map: number[]): number[] {
  const [k1, k2, n, m] = getLargerAndSize(a, b);
  if (!map.includes(-1)) return map;

  let lastIdx = -1;
  for (let i = n - 1; i >= 0; i--) if (map[i] !== -1) { lastIdx = map[i]; break; }
  for (let i = n - 1; i >= 0; i--) if (map[i] === -1) map[i] = lastIdx;

  let firstIdx = -1;
  for (let i = 0; i < n; i++) if (map[i] !== -1) { firstIdx = map[i]; break; }
  for (let i = 0; i <= firstIdx; i++) if (map[i] === -1) map[i] = firstIdx;

  for (let i = 0; i < n - 1; i++) {
    if (map[i + 1] !== -1) continue;
    let start = i;
    let stop = i + 1;
    while (stop < n && map[stop] === -1) stop++;
    if (stop >= n) continue;
    let bestDiv = start, bestCost = Infinity;
    for (let div = start; div < stop; div++) {
      let ab: Stroke = [...k1[start]];
      for (let t = start + 1; t <= div; t++) ab = ab.concat(k1[t]);
      let bc: Stroke = [...k1[div + 1]];
      for (let t = div + 2; t <= stop; t++) bc = bc.concat(k1[t]);
      const dAb = distFn(ab, k2[map[start]]);
      const dBc = distFn(bc, k2[map[stop]]);
      if (dAb + dBc < bestCost) { bestCost = dAb + dBc; bestDiv = div; }
    }
    for (let j = start; j <= bestDiv; j++) map[j] = map[start];
    for (let j = bestDiv + 1; j < stop; j++) map[j] = map[stop];
  }
  return map;
}

function computeDistance(a: Stroke[], b: Stroke[], distFn: DistFn, map: number[]): number {
  const [k1, k2, n, m] = getLargerAndSize(a, b);
  let dist = 0, idx = 0;
  while (idx < n) {
    const targetIdx = map[idx];
    let start = idx, stop = start + 1;
    while (stop < n && map[stop] === targetIdx) stop++;
    let concat: Stroke = [...k1[start]];
    for (let t = start + 1; t < stop; t++) concat = concat.concat(k1[t]);
    dist += distFn(k2[targetIdx], concat);
    idx = stop;
  }
  return dist;
}

function computeWeightedWholeDistance(a: Stroke[], b: Stroke[], map: number[]): number {
  const [k1, k2, n, m] = getLargerAndSize(a, b);
  let dist = 0, idx = 0;
  while (idx < n) {
    const targetIdx = map[idx];
    let start = idx, stop = start + 1;
    while (stop < n && map[stop] === targetIdx) stop++;
    let concat: Stroke = [...k1[start]];
    for (let t = start + 1; t < stop; t++) concat = concat.concat(k1[t]);
    let d = wholeWholeDist(k2[targetIdx], concat);
    if (stop > start + 1) {
      const mm = k2[targetIdx].length, nn = concat.length;
      d *= Math.max(nn, mm) / Math.min(nn, mm);
    }
    dist += d;
    idx = stop;
  }
  return dist;
}

// ──────────────────────────────────────────────────────────────
// Two-stage classification
// ──────────────────────────────────────────────────────────────

/** Coarse: endpoint distance on all ref patterns within stroke-count window. */
export function coarseClassify(input: Stroke[], refs: KanjiPattern[]): { idx: number; score: number }[] {
  const inLen = input.length;
  const out: { idx: number; score: number }[] = [];
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    if (inLen < r.strokes - 2 || inLen > r.strokes + 3) continue;
    const map = getMap(r.pattern, input, endpointDist);
    const map2 = completeMap(r.pattern, input, endpointDist, map);
    const dist = computeDistance(r.pattern, input, endpointDist, map2);
    const n = Math.max(r.strokes, inLen), m = Math.min(r.strokes, inLen);
    out.push({ idx: i, score: dist * (m / n) });
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}

/** Fine: weighted whole-whole distance on top coarse candidates. */
export function fineClassify(input: Stroke[], refs: KanjiPattern[], coarse: { idx: number; score: number }[], topN = 16): { char: string; score: number }[] {
  const inLen = input.length;
  const out: { char: string; score: number }[] = [];
  const limit = Math.min(coarse.length, 100);
  for (let i = 0; i < limit; i++) {
    const ci = coarse[i].idx;
    const r = refs[ci];
    if (inLen < r.strokes - 2 || inLen > r.strokes + 3) continue;
    const map = getMap(r.pattern, input, initialDist);
    const map2 = completeMap(r.pattern, input, wholeWholeDist, map);
    const dist = computeWeightedWholeDistance(r.pattern, input, map2);
    const m = Math.min(inLen, r.strokes);
    out.push({ char: r.char, score: dist / Math.max(1, m) });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, topN);
}

// ──────────────────────────────────────────────────────────────
// Preprocess: KanjiVG calligraphic → textbook strokes (split at corners)
// ──────────────────────────────────────────────────────────────

/** Split a stroke at sharp direction changes (corners) → textbook strokes. */
function splitStrokeAtCorners(stroke: Stroke, angleThreshold = 0.7): Stroke[] {
  if (stroke.length < 4) return [stroke];
  const out: Stroke[] = [];
  let current: Stroke = [stroke[0]];
  for (let i = 1; i < stroke.length - 1; i++) {
    const prev = stroke[i - 1];
    const curr = stroke[i];
    const next = stroke[i + 1];
    const v1 = [curr[0] - prev[0], curr[1] - prev[1]];
    const v2 = [next[0] - curr[0], next[1] - curr[1]];
    const len1 = Math.hypot(v1[0], v1[1]);
    const len2 = Math.hypot(v2[0], v2[1]);
    if (len1 > 1 && len2 > 1) {
      const dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (len1 * len2);
      if (dot < angleThreshold) {
        current.push(curr);
        out.push(current);
        current = [curr];
        continue;
      }
    }
    current.push(curr);
  }
  current.push(stroke[stroke.length - 1]);
  if (current.length >= 2) out.push(current);
  return out.length > 0 ? out : [stroke];
}

/** Preprocess KanjiVG calligraphic strokes → textbook strokes (split at corners). */
function preprocessTextbookStrokes(strokes: Stroke[]): Stroke[] {
  const out: Stroke[] = [];
  for (const s of strokes) {
    out.push(...splitStrokeAtCorners(s, 0.7));
  }
  return out.filter(s => s.length >= 3);
}

// ──────────────────────────────────────────────────────────────
// High-level API
// ──────────────────────────────────────────────────────────────

type TextbookStrokes = Record<string, [number, number][][]>;
let textbookAuto: TextbookStrokes | null = null;
let textbookOverride: TextbookStrokes | null = null;

/** Load auto-generated textbook strokes from KanjiVG (2380 kanji). */
async function loadTextbookAuto(): Promise<TextbookStrokes> {
  if (textbookAuto) return textbookAuto;
  try {
    const mod = await import("../../data/textbook-strokes.json");
    textbookAuto = (mod.default?.strokes ?? {}) as unknown as TextbookStrokes;
  } catch {
    textbookAuto = {};
  }
  return textbookAuto;
}

/** Load manual textbook stroke overrides (for simple kanji where KanjiVG is calligraphic). */
async function loadTextbookOverrides(): Promise<TextbookStrokes> {
  if (textbookOverride) return textbookOverride;
  try {
    const mod = await import("../../data/textbook-overrides.json");
    textbookOverride = (mod.default?.strokes ?? {}) as unknown as TextbookStrokes;
  } catch {
    textbookOverride = {};
  }
  return textbookOverride;
}

/** Load merged textbook strokes (auto + manual overrides). */
async function loadMergedTextbook(): Promise<TextbookStrokes> {
  const [auto, overrides] = await Promise.all([loadTextbookAuto(), loadTextbookOverrides()]);
  return { ...auto, ...overrides }; // overrides take precedence
}

/** Build reference patterns from KanjiVG template data + textbook stroke overrides. */
export async function buildRefPatterns(templateData: Record<string, Stroke[]>): Promise<KanjiPattern[]> {
  const mergedTextbook = await loadMergedTextbook();
  const out: KanjiPattern[] = [];
  for (const [char, strokes] of Object.entries(templateData)) {
    // Use merged textbook strokes if available, else KanjiVG with corner-split
    let raw: Stroke[];
    if (mergedTextbook[char]) {
      raw = mergedTextbook[char].map(s => s.map(([x, y]) => [x * 2.56, y * 2.56] as [number, number]));
    } else {
      raw = strokes.map(s =>
        s.map(([x, y]) => [x * 2.56, y * 2.56] as [number, number])
      );
      raw = preprocessTextbookStrokes(raw);
    }
    const norm = momentNormalize(raw);
    const feat = extractFeatures(norm, 20);
    out.push({ char, strokes: raw.length, pattern: feat });
  }
  return out;
}

/** Synchronous version for tests (uses corner-split only). */
export function buildRefPatternsSync(templateData: Record<string, Stroke[]>): KanjiPattern[] {
  const out: KanjiPattern[] = [];
  for (const [char, strokes] of Object.entries(templateData)) {
    const raw: Stroke[] = strokes.map(s =>
      s.map(([x, y]) => [x * 2.56, y * 2.56] as [number, number])
    );
    const textbookStrokes = preprocessTextbookStrokes(raw);
    const norm = momentNormalize(textbookStrokes);
    const feat = extractFeatures(norm, 20);
    out.push({ char, strokes: textbookStrokes.length, pattern: feat });
  }
  return out;
}

/** Recognize drawn strokes → top-N candidates. */
export function recognize(drawn: { x: number; y: number }[][], refs: KanjiPattern[], topN = 16): { char: string; score: number }[] {
  if (!drawn.length) return [];
  const norm = momentNormalize(drawn.map(s => s.map(p => [p.x, p.y] as [number, number])));
  const feat = extractFeatures(norm, 20);
  if (!feat.some(s => s.length)) return [];
  const coarse = coarseClassify(feat, refs);
  return fineClassify(feat, refs, coarse, topN);
}
/**
 * Matcher coretan kanji vs template KanjiVG — murni, tanpa dep.
 * Skor = jarak gores terdekat (abaikan urutan + arah) + penalti selisih jumlah gores.
 * matcha: top-1 jari-HP tak andal → UI wajib kandidat top-N, bukan jawaban tunggal.
 * Improvements: Hungarian-like assignment (greedy), larger prefilter, more candidates.
 */

export type Stroke = [number, number][]; // 16 titik ternormalisasi 0..100

function strokeDist(a: Stroke, b: Stroke): number {
  let fwd = 0;
  let rev = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    const r = b[b.length - 1 - i]!;
    fwd += Math.hypot(p[0] - q[0], p[1] - q[1]);
    rev += Math.hypot(p[0] - r[0], p[1] - r[1]);
  }
  return Math.min(fwd, rev) / a.length;
}

/** Jarak coretan pengguna ke satu template (kecil = mirip). */
export function matchScore(template: Stroke[], drawn: Stroke[]): number {
  if (drawn.length === 0 || template.length === 0) return Infinity;

  // Greedy assignment: setiap gores template dipakai max 1x.
  // Urutkan drawn strokes berdasarkan panjang (panjang dulu = lebih informatif).
  const drawnIdx = [...drawn.keys()].sort((i, j) => drawn[j]!.length - drawn[i]!.length);
  const usedTemplate = new Set<number>();
  let sum = 0;

  for (const di of drawnIdx) {
    const d = drawn[di]!;
    let best = Infinity;
    let bestTi = -1;
    for (let ti = 0; ti < template.length; ti++) {
      if (usedTemplate.has(ti)) continue;
      const t = template[ti]!;
      const n = Math.min(d.length, t.length);
      const dd = strokeDist(d.slice(0, n) as Stroke, t.slice(0, n) as Stroke);
      if (dd < best) {
        best = dd;
        bestTi = ti;
      }
    }
    if (bestTi >= 0) usedTemplate.add(bestTi);
    sum += best === Infinity ? 100 : best; // penalty besar kalau tak ada template tersisa
  }

  const mean = sum / drawn.length;
  // Penalti selisih jumlah gores — filter terkuat, tapi lebih lunak (5 bukan 8).
  return mean + 5 * Math.abs(template.length - drawn.length);
}

/** Ranking kandidat {char, score} terbaik dulu, maks n. */
export function rankCandidates(
  templates: Record<string, Stroke[]>,
  drawn: Stroke[],
  n = 16,
): { char: string; score: number }[] {
  const out: { char: string; score: number }[] = [];
  for (const [char, t] of Object.entries(templates)) {
    // Prefilter murah: selisih gores >5 tak mungkin menang (lebih longgar dari 3).
    if (Math.abs(t.length - drawn.length) > 5) continue;
    const score = matchScore(t, drawn);
    if (!Number.isFinite(score)) continue;
    out.push({ char, score });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, n);
}

/** Normalisasi coretan mentah (piksel) → format template: resample 16 + skala 0..100 + center. */
export function normalizeStrokes(raw: { x: number; y: number }[][], n = 16): Stroke[] {
  const resampled = raw
    .map((s) => resample(s.map((p) => [p.x, p.y] as [number, number]), n))
    .filter((s) => s.length > 0);
  if (resampled.length === 0) return [];

  // Center + scale (bukan cuma scale) — konsisten dengan template.
  const xs = resampled.flat().map((p) => p[0]);
  const ys = resampled.flat().map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  return resampled.map((s) =>
    s.map(([x, y]) => [
      ((x - cx) / Math.max(w, h)) * 100 + 50,
      ((y - cy) / Math.max(w, h)) * 100 + 50,
    ] as [number, number]),
  );
}

function resample(pts: [number, number][], n: number): [number, number][] {
  if (pts.length === 0) return [];
  const total = pts.reduce((a, p, k) => (k === 0 ? 0 : a + Math.hypot(p[0] - pts[k - 1]![0], p[1] - pts[k - 1]![1])), 0);
  if (total === 0) return Array.from({ length: n }, () => [pts[0]![0], pts[0]![1]] as [number, number]);
  const out: [number, number][] = [[pts[0]![0], pts[0]![1]]];
  let acc = 0;
  const step = total / (n - 1);
  for (let k = 1; k < pts.length && out.length < n; k++) {
    const a = pts[k - 1]!, b = pts[k]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + d >= out.length * step && out.length < n) {
      const need = out.length * step - acc;
      const u = d === 0 ? 0 : need / d;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    acc += d;
  }
  while (out.length < n) out.push([pts[pts.length - 1]![0], pts[pts.length - 1]![1]]);
  return out;
}
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "~/lib/db/client.server";
import {
  kanji,
  kanjiCards,
  kanjiComponents,
  kanjiKnown,
  kanjiReadings,
  kanjiVocab,
} from "~/lib/db/schema";
import { applyRating, type CardRow } from "~/lib/fsrs.server";

/**
 * Kanji N5 — referensi kanonis (seed dataset) + kartu FSRS 3 mode.
 * Mode kartu: recognition (kanji→arti+bacaan) | recall (arti→kanji) |
 * reading (kata rumpang furigana→bacaan). Scheduler reuse fsrs.server
 * (fungsi murni CardRow) — tanpa engine SRS kedua.
 */

export type KanjiMode = "recognition" | "recall" | "reading" | "production";
export const KANJI_MODES: KanjiMode[] = ["recognition", "recall", "reading", "production"];

export type KanjiDetail = {
  char: string;
  meaningId: string;
  strokes: number;
  grade: number | null;
  freq: number | null;
  jlpt: number | null;
  svg: string | null;
  on: { text: string; primary: boolean }[];
  kun: { text: string; primary: boolean }[];
  components: string[];
  vocab: { word: string; reading: string; gloss: string }[];
  // Radikal eksplisit (hasil AI) — untuk kanji di luar data N5/N4.
  radical?: string | null;
};

export async function listKanji(opts: { jlpt?: number; component?: string; limit?: number } = {}) {
  const conds = [];
  if (opts.jlpt) conds.push(eq(kanji.jlpt, opts.jlpt));
  if (opts.component) {
    const rows = await db
      .select({ kanji: kanjiComponents.kanji })
      .from(kanjiComponents)
      .where(eq(kanjiComponents.component, opts.component));
    const chars = rows.map((r) => r.kanji);
    if (chars.length === 0) return [];
    conds.push(inArray(kanji.char, chars));
  }
  const rows = await db
    .select({
      char: kanji.char,
      meaningId: kanji.meaningId,
      strokes: kanji.strokes,
      jlpt: kanji.jlpt,
      freq: kanji.freq,
    })
    .from(kanji)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`CASE WHEN ${kanji.freq} IS NULL THEN 1 ELSE 0 END`, kanji.freq, kanji.strokes)
    .limit(opts.limit ?? 200);
  // Komponen + bacaan per kanji — 2 query batch (bukan N+1) buat filter
  // "mengandung X" dan pencarian kana/romaji di klien.
  const chars = rows.map((r) => r.char);
  const [compRows, readRows] = chars.length
    ? await Promise.all([
        db
          .select({ kanji: kanjiComponents.kanji, component: kanjiComponents.component })
          .from(kanjiComponents)
          .where(inArray(kanjiComponents.kanji, chars)),
        db
          .select({ kanji: kanjiReadings.kanji, reading: kanjiReadings.reading })
          .from(kanjiReadings)
          .where(inArray(kanjiReadings.kanji, chars)),
      ])
    : [[], []];
  const compMap = new Map<string, string[]>();
  for (const c of compRows) {
    const arr = compMap.get(c.kanji) ?? [];
    arr.push(c.component);
    compMap.set(c.kanji, arr);
  }
  const readMap = new Map<string, string[]>();
  for (const r of readRows) {
    const arr = readMap.get(r.kanji) ?? [];
    arr.push(r.reading);
    readMap.set(r.kanji, arr);
  }
  return rows.map((r) => ({
    ...r,
    components: compMap.get(r.char) ?? [],
    readings: readMap.get(r.char) ?? [],
  }));
}

/** Komponen yang muncul di kanji level ini — buat filter "mengandung X". */
export async function listComponents(jlpt = 5) {
  const rows = await db
    .select({ component: kanjiComponents.component })
    .from(kanjiComponents)
    .innerJoin(kanji, eq(kanji.char, kanjiComponents.kanji))
    .where(eq(kanji.jlpt, jlpt));
  const freq = new Map<string, number>();
  for (const r of rows) freq.set(r.component, (freq.get(r.component) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([component, count]) => ({ component, count }));
}

// Level JLPT yang punya data kanji di DB; level kosong dinonaktifkan di widget.
export async function getKanjiLevelsAvailable(): Promise<number[]> {
  const rows = await db
    .select({ jlpt: kanji.jlpt, c: sql<number>`count(*)` })
    .from(kanji)
    .groupBy(kanji.jlpt);
  return rows
    .filter((r) => r.jlpt !== null && Number(r.c) > 0)
    .map((r) => r.jlpt as number)
    .sort((a, b) => a - b);
}

export async function getKanjiDetail(char: string): Promise<KanjiDetail | null> {
  const [k] = await db.select().from(kanji).where(eq(kanji.char, char)).limit(1);
  if (!k) return null;
  const [readings, comps, vocab] = await Promise.all([
    db.select().from(kanjiReadings).where(eq(kanjiReadings.kanji, char)),
    db.select().from(kanjiComponents).where(eq(kanjiComponents.kanji, char)),
    db.select().from(kanjiVocab).where(eq(kanjiVocab.kanji, char)).limit(5),
  ]);
  return {
    char: k.char,
    meaningId: k.meaningId,
    strokes: k.strokes,
    grade: k.grade,
    freq: k.freq,
    jlpt: k.jlpt,
    svg: cleanSvg(k.svg),
    on: readings.filter((r) => r.type === "on").map((r) => ({ text: r.reading, primary: r.primaryPick === 1 })),
    kun: readings.filter((r) => r.type === "kun").map((r) => ({ text: r.reading, primary: r.primaryPick === 1 })),
    components: comps.map((c) => c.component),
    vocab: vocab.map((v) => ({ word: v.word, reading: v.reading, gloss: v.gloss })),
  };
}

/**
 * Buang prolog XML + komentar + DOCTYPE KanjiVG (termasuk internal subset
 * [...]) — parser HTML innerHTML memenggal DOCTYPE di `>` pertama sehingga
 * sisa `]>` bocor jadi teks di atas diagram.
 * matcha: artefak "]>" di sheet cara penulisan.
 */
export function cleanSvg(svg: string | null): string | null {
  if (!svg) return null;
  return svg
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?\]>/g, "")
    .trim();
}

/** Antrean flashcard kanji: due dulu + baru (reps=0), per mode. */
export async function getKanjiQueue(mode: KanjiMode, limit = 20, jlpt = 5) {
  const now = Date.now();
  const rows = await db
    .select({
      kanji: kanji.char,
      meaningId: kanji.meaningId,
      strokes: kanji.strokes,
      due: kanjiCards.due,
      reps: kanjiCards.reps,
    })
    .from(kanji)
    .leftJoin(kanjiCards, and(eq(kanjiCards.kanji, kanji.char), eq(kanjiCards.mode, mode)))
    // Kanji yang ditandai "dikenal" dari sheet detail tidak masuk antrean lagi —
    // kalau tetap muncul, tombol tandai terasa tidak berpengaruh.
    .where(
      and(
        eq(kanji.jlpt, jlpt),
        notInArray(kanji.char, db.select({ char: kanjiKnown.kanji }).from(kanjiKnown)),
      ),
    )
    .limit(200);
  const due = rows
    .filter((r) => r.reps !== null && (r.due ?? 0) <= now)
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0));
  const fresh = rows.filter((r) => r.reps === null);
  // Campur: due dulu lalu selingan baru (active recall, bukan urut hafal).
  const queue: typeof rows = [];
  let fi = 0;
  for (const d of due) {
    queue.push(d);
    if (fi < fresh.length && queue.length % 3 === 0) queue.push(fresh[fi++]!);
  }
  while (fi < fresh.length && queue.length < limit) queue.push(fresh[fi++]!);
  const picked = queue.slice(0, limit);
  return withReadings(picked);
}

/** Bacaan on/kun untuk satu batch kartu — 1 query, bukan N+1. */
async function withReadings<T extends { kanji: string }>(rows: T[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, readings: [] as string[] }));
  const readRows = await db
    .select({ kanji: kanjiReadings.kanji, reading: kanjiReadings.reading })
    .from(kanjiReadings)
    .where(inArray(kanjiReadings.kanji, rows.map((r) => r.kanji)));
  const map = new Map<string, string[]>();
  for (const r of readRows) {
    const arr = map.get(r.kanji) ?? [];
    arr.push(r.reading);
    map.set(r.kanji, arr);
  }
  return rows.map((r) => ({ ...r, readings: map.get(r.kanji) ?? [] }));
}

/** Detail penuh untuk kartu (bacaan + 1 vocab). */
export async function getKanjiCardDetail(char: string) {
  const d = await getKanjiDetail(char);
  if (!d) return null;
  return {
    char: d.char,
    meaningId: d.meaningId,
    strokes: d.strokes,
    on: d.on.slice(0, 2).map((r) => r.text),
    kun: d.kun.slice(0, 2).map((r) => r.text),
    vocab: d.vocab.slice(0, 1),
  };
}

function toRow(kanjiChar: string, mode: KanjiMode, r: typeof kanjiCards.$inferSelect | undefined): CardRow {
  if (!r) {
    return {
      itemId: 0, due: Date.now(), stability: null, difficulty: null,
      elapsedDays: null, scheduledDays: null, reps: 0, lapses: 0,
      state: 0, lastReview: null, learningSteps: 0,
    };
  }
  return {
    itemId: 0, due: r.due, stability: r.stability, difficulty: r.difficulty,
    elapsedDays: r.elapsedDays, scheduledDays: r.scheduledDays, reps: r.reps,
    lapses: r.lapses, state: r.state, lastReview: r.lastReview, learningSteps: r.learningSteps,
  };
}

/** Nilai kartu kanji 1-4 → jadwal baru tersimpan. */
export async function rateKanjiCard(kanjiChar: string, mode: KanjiMode, rating: 1 | 2 | 3 | 4) {
  const [existing] = await db
    .select()
    .from(kanjiCards)
    .where(and(eq(kanjiCards.kanji, kanjiChar), eq(kanjiCards.mode, mode)))
    .limit(1);
  const next = await applyRating(toRow(kanjiChar, mode, existing), rating);
  await db
    .insert(kanjiCards)
    .values({
      kanji: kanjiChar, mode, due: next.due, stability: next.stability,
      difficulty: next.difficulty, elapsedDays: next.elapsedDays,
      scheduledDays: next.scheduledDays, reps: next.reps, lapses: next.lapses,
      state: next.state, learningSteps: next.learningSteps, lastReview: next.lastReview,
    })
    .onConflictDoUpdate({
      target: [kanjiCards.kanji, kanjiCards.mode],
      set: {
        due: next.due, stability: next.stability, difficulty: next.difficulty,
        elapsedDays: next.elapsedDays, scheduledDays: next.scheduledDays, reps: next.reps,
        lapses: next.lapses, state: next.state, learningSteps: next.learningSteps,
        lastReview: next.lastReview,
      },
    });
  return { ok: true as const, due: next.due };
}

/**
 * Progres "dikenali" satu level = kanji yang pernah dinilai di drill Kenali
 * ATAU ditandai manual dari sheet detail. Dua sumber digabung supaya angka
 * tidak mundur kalau user menandai manual lebih dulu.
 */
export async function getKanjiProgress(jlpt = 5) {
  const [total, drilled, marked] = await Promise.all([
    db.select({ char: kanji.char }).from(kanji).where(eq(kanji.jlpt, jlpt)),
    db.select({ kanji: kanjiCards.kanji }).from(kanjiCards).where(eq(kanjiCards.mode, "recognition")),
    db.select({ kanji: kanjiKnown.kanji }).from(kanjiKnown),
  ]);
  const knownSet = new Set([
    ...drilled.map((d) => d.kanji),
    ...marked.map((m) => m.kanji),
  ]);
  const known = total.filter((t) => knownSet.has(t.char)).map((t) => t.char);
  return { total: total.length, done: known.length, known };
}

/** Tandai / batalkan tanda "sudah dikenal" (manual, dari sheet detail). */
export async function setKanjiKnown(char: string, known: boolean) {
  if (known) {
    await db
      .insert(kanjiKnown)
      .values({ kanji: char, markedAt: Date.now() })
      .onConflictDoUpdate({ target: kanjiKnown.kanji, set: { markedAt: Date.now() } });
  } else {
    await db.delete(kanjiKnown).where(eq(kanjiKnown.kanji, char));
  }
  return { ok: true as const, known };
}

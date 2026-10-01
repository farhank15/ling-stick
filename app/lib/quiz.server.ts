import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "~/lib/db/client.server";
import { cards, items, quizSets, quizAnswers, wordbank } from "~/lib/db/schema";
import { env } from "~/lib/env.server";

/**
 * Latihan harian & multi-metode — BLUEPRINT §3 F3 (diupgrade):
 * - SATU SET per hari per mode ("daily" = kuis rutin; "extra"/"typing"/"intens" = tambahan)
 * - Progres kesimpen: keluar di tengah → lanjut lagi dari posisi terakhir
 * - Soal yang salah diselipkan lagi ±5 posisi dari posisi sekarang
 * - Sumber soal: item Library sendiri + kata dari Bank Kata (CEFR level bisa dipilih)
 */

export type QuizMode = "daily" | "extra" | "typing" | "intens";
export const QUIZ_MODES: QuizMode[] = ["daily", "extra", "typing", "intens"];

export type QuizQuestion = {
  itemId: number;
  bankId?: number;
  type: "mcq_en_id" | "mcq_id_en" | "cloze" | "listen" | "typing";
  prompt: string;
  options: string[];
  answer: string;
  meaningId: string | null;
  exampleEn: string | null;
};

type ItemRow = {
  id: number;
  text: string;
  type: string;
  register: string;
  meaningId: string | null;
  firstEn: string | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function naivePronunciation(text: string): string {
  return text.toLowerCase().split(/\s+/).join("·");
}

/** Tanggal lokal Asia/Jakarta (app personal, timezone tunggal). */
export function localDayStr(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
    .toISOString()
    .slice(0, 10);
}

type BuildOpts = { sources?: ("library" | "bank")[]; bankLevel?: string };

/** Kumpulan kandidat: dari Library, dari Bank Kata (status learning), atau keduanya. */
async function collectRows(opts: BuildOpts) {
  const sources = opts.sources ?? ["library", "bank"];
  const lib = sources.includes("library")
    ? await db
        .select({
          id: items.id,
          text: items.text,
          type: items.type,
          register: items.register,
          meaningId: items.meaningId,
          firstEn: sql<string | null>`(SELECT en FROM examples WHERE item_id = ${items.id} ORDER BY id LIMIT 1)`,
        })
        .from(items)
        .where(eq(items.status, "learning"))
        .limit(300)
    : [];

  let bank: ItemRow[] = [];
  if (sources.includes("bank")) {
    const conds = [eq(wordbank.status, "learning"), sql`${wordbank.itemId} IS NULL`];
    if (opts.bankLevel) conds.push(eq(wordbank.cefr, opts.bankLevel));
    const bankRows = await db
      .select({
        id: wordbank.id,
        text: wordbank.text,
        type: wordbank.type,
        register: wordbank.register,
        meaningId: wordbank.meaningId,
        firstEn: sql<string | null>`(SELECT json_extract(value, '$.en') FROM json_each(wordbank.examples_json) LIMIT 1)`,
      })
      .from(wordbank)
      .where(and(...conds))
      .limit(300);
    bank = bankRows;
  }
  return [...lib, ...bank];
}

/**
 * Bangun soal bervariasi — 1 item boleh dipakai beberapa tipe soal (biar genap
 * walau pool masih sedikit). `forceType` untuk mode khusus (mis. "typing").
 */
async function buildQuestions(
  limit: number,
  opts: BuildOpts & { forceType?: QuizQuestion["type"] } = {},
): Promise<QuizQuestion[]> {
  const allRows = await collectRows(opts);
  if (allRows.length === 0) return [];

  const dueIds = new Set(
    (
      await db
        .select({ itemId: cards.itemId })
        .from(cards)
        .where(sql`${cards.due} <= ${Date.now() + 86_400_000}`)
        .limit(100)
    ).map((r) => r.itemId),
  );

  const pool: ItemRow[] = [...allRows]
    .filter((r) => r.meaningId)
    .sort((a, b) => {
      const ad = dueIds.has(a.id) ? 0 : 1;
      const bd = dueIds.has(b.id) ? 0 : 1;
      return ad - bd;
    });
  if (pool.length === 0) return [];

  const types: QuizQuestion["type"][] = opts.forceType
    ? [opts.forceType]
    : ["mcq_en_id", "mcq_id_en", "cloze", "listen"];
  const questions: QuizQuestion[] = [];

  for (let i = 0; questions.length < limit; i++) {
    const item = pool[i % pool.length];
    const type = types[questions.length % types.length];
    const others = allRows.filter((o) => o.id !== item.id && o.meaningId);
    const distractors = shuffle(others).slice(0, 3);

    if (type === "typing") {
      // Ketik frasa bahasa Inggris dari arti Indonesia — dinilai di server.
      questions.push({
        itemId: item.id,
        type: "typing",
        prompt: item.meaningId!,
        options: [],
        answer: item.text.toLowerCase().trim(),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    } else if (type === "mcq_en_id") {
      const opts2 = shuffle([item.meaningId!, ...distractors.map((d) => d.meaningId!)]);
      questions.push({
        itemId: item.id,
        type,
        prompt: item.text,
        options: opts2,
        answer: String(opts2.indexOf(item.meaningId!)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    } else if (type === "mcq_id_en") {
      const opts2 = shuffle([item.text, ...distractors.map((d) => d.text)]);
      questions.push({
        itemId: item.id,
        type,
        prompt: item.meaningId!,
        options: opts2,
        answer: String(opts2.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    } else if (type === "cloze") {
      const sentence = item.firstEn ?? "";
      const re = new RegExp(item.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const blanked = sentence ? sentence.replace(re, "_____") : "";
      if (!blanked.includes("_____")) {
        const opts2 = shuffle([item.meaningId!, ...distractors.map((d) => d.meaningId!)]);
        questions.push({
          itemId: item.id,
          type: "mcq_en_id",
          prompt: item.text,
          options: opts2,
          answer: String(opts2.indexOf(item.meaningId!)),
          meaningId: item.meaningId,
          exampleEn: item.firstEn,
        });
        continue;
      }
      const opts2 = shuffle([item.text, ...distractors.map((d) => d.text)]);
      questions.push({
        itemId: item.id,
        type: "cloze",
        prompt: blanked,
        options: opts2,
        answer: String(opts2.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: sentence,
      });
    } else {
      const opts2 = shuffle([item.text, ...distractors.map((d) => d.text)]);
      questions.push({
        itemId: item.id,
        type: "listen",
        prompt: naivePronunciation(item.text),
        options: opts2,
        answer: String(opts2.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    }
    if (i > limit * 10) break; // pengaman
  }
  return questions;
}

function modeTitle(mode: QuizMode, day: string): string {
  const d = new Date(day + "T00:00:00");
  const tgl = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const names: Record<QuizMode, string> = {
    daily: "Latihan",
    extra: "Latihan Tambahan",
    typing: "Latihan Ketik",
    intens: "Latihan Intens",
  };
  return `${names[mode]} ${tgl}`;
}

export function defaultTitle(day: string): string {
  return modeTitle("daily", day);
}

/** Set bawaan harian (kuis rutin). */
export async function getTodaySet() {
  return getSetForDay("daily", localDayStr(), env.DAILY_QUIZ_SIZE);
}

/** Set harian per mode (satu per mode per hari). */
export async function getSetForDay(mode: QuizMode, day: string, limit: number, opts: BuildOpts = {}) {
  const [existing] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, mode)))
    .limit(1);
  if (existing) return existing;

  const questions = await buildQuestions(limit, opts);
  if (questions.length === 0) return null;

  const [created] = await db
    .insert(quizSets)
    .values({
      day,
      mode,
      title: modeTitle(mode, day),
      questions: JSON.stringify(questions),
      order: JSON.stringify(questions.map((_, i) => i)),
      total: questions.length,
      done: 0,
      correct: 0,
      completed: 0,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, mode)))
    .limit(1);
  return again ?? null;
}

/** Set tambahan dibuat manual (tombol "Generate") — selalu set baru, tidak pakai cache harian. */
export async function createExtraSet(
  mode: Exclude<QuizMode, "daily">,
  limit: number,
  opts: BuildOpts = {},
) {
  const questions = await buildQuestions(limit, opts);
  if (questions.length === 0) return null;
  const [created] = await db
    .insert(quizSets)
    .values({
      day: localDayStr(),
      mode,
      title: `${modeTitle(mode, localDayStr())} — ekstra`,
      questions: JSON.stringify(questions),
      order: JSON.stringify(questions.map((_, i) => i)),
      total: questions.length,
      done: 0,
      correct: 0,
      completed: 0,
      createdAt: Date.now(),
    })
    .returning();
  return created ?? null;
}

/** Ambil set by id (mode tambahan bisa dibuat kapan pun). */
export async function getSetById(id: number) {
  const [row] = await db.select().from(quizSets).where(eq(quizSets.id, id)).limit(1);
  return row ?? null;
}

/** Jawab soal by id set (semua mode). */
export async function answerQuestionById(
  setId: number,
  index: number,
  correct: boolean,
  typedText?: string,
) {
  const [set] = await db.select().from(quizSets).where(eq(quizSets.id, setId)).limit(1);
  if (!set) return { ok: false as const, error: "Set tidak ada" };

  const questions = JSON.parse(set.questions) as QuizQuestion[];

  // Mode typing dinilai dari teks yang diketik.
  let isCorrect = correct;
  if (questions[index]?.type === "typing" && typeof typedText === "string") {
    isCorrect =
      typedText.toLowerCase().replace(/[^a-z0-9' ]/g, "").trim() ===
      questions[index].answer.replace(/[^a-z0-9' ]/g, "").trim();
  }

  return applyAnswer(set, questions, index, isCorrect);
}

/** Kompatibilitas: jawab by day (mode daily). */
export async function answerQuestion(day: string, index: number, correct: boolean) {
  const [set] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, "daily")))
    .limit(1);
  if (!set) return { ok: false as const, error: "Set tidak ada" };
  const questions = JSON.parse(set.questions) as QuizQuestion[];
  return applyAnswer(set, questions, index, correct);
}

async function applyAnswer(
  set: typeof quizSets.$inferSelect,
  questions: QuizQuestion[],
  index: number,
  correct: boolean,
) {
  if (set.completed) return { ok: false as const, error: "Set sudah selesai" };
  const order = JSON.parse(set.order) as number[];

  await db.transaction(async (tx) => {
    await tx.insert(quizAnswers)
      .values({ setId: set.id, day: set.day, questionIndex: index, itemId: questions[index]?.itemId ?? 0, correct: correct ? 1 : 0, answeredAt: Date.now() })
      .onConflictDoNothing();
    await tx.update(quizSets)
      .set({
        done: set.done + 1,
        correct: set.correct + (correct ? 1 : 0),
      })
      .where(eq(quizSets.id, set.id));

    if (!correct) {
      // Selipkan ulang soal yang salah ±5 posisi dari posisi sekarang.
      const reinsertAt = Math.min(order.length, index + 1 + 4 + Math.floor(Math.random() * 3));
      const nextOrder = [...order];
      nextOrder.splice(reinsertAt, 0, index);
      await tx.update(quizSets)
        .set({ order: JSON.stringify(nextOrder) })
        .where(eq(quizSets.id, set.id));
    }
  });

  // FSRS tetap dicatat per item.
  const itemId = questions[index]?.itemId;
  if (itemId) {
    const { applyRating } = await import("~/lib/fsrs.server");
    const { getItemDetail, applyReview } = await import("~/lib/items.server");
    const detail = await getItemDetail(itemId);
    if (detail?.card) {
      const rating = correct ? 3 : 1;
      const row = {
        itemId,
        due: detail.card.due,
        stability: detail.card.stability,
        difficulty: detail.card.difficulty,
        elapsedDays: detail.card.elapsedDays,
        scheduledDays: detail.card.scheduledDays,
        reps: detail.card.reps,
        lapses: detail.card.lapses,
        state: detail.card.state,
        learningSteps: detail.card.learningSteps,
        lastReview: detail.card.lastReview,
      };
      const next = applyRating(row, rating as 1 | 2 | 3 | 4);
      await applyReview(itemId, rating as 1 | 2 | 3 | 4, "quiz", next);
    }
  }

  const [after] = await db.select().from(quizSets).where(eq(quizSets.id, set.id)).limit(1);
  const newOrder = JSON.parse(after!.order) as number[];
  const finished = after!.done >= newOrder.length;
  if (finished && !after!.completed) {
    await db.update(quizSets).set({ completed: 1 }).where(eq(quizSets.id, after!.id));
  }
  return { ok: true as const, set: after!, finished };
}

/** Tandai item sudah hafal langsung dari soal. */
export async function markItemKnownFromQuiz(itemId: number) {
  await db.update(items).set({ status: "known" }).where(eq(items.id, itemId));
}

/** Riwayat latihan (untuk halaman review). */
export async function getHistory(limit = 14) {
  return db.select().from(quizSets).orderBy(desc(quizSets.day)).limit(limit);
}

/** Bel: set harian (daily) belum selesai? */
export async function pendingToday(): Promise<{ total: number; done: number; completed: boolean } | null> {
  const set = await getTodaySet();
  if (!set) return null;
  const order = JSON.parse(set.order) as number[];
  return { total: order.length, done: set.done, completed: Boolean(set.completed) };
}

/** Antrian flashcard: kartu due + kartu baru hari ini. */
export async function getFlashQueue(limit = 30) {
  const today = localDayStr();
  const dayStart = new Date(today + "T00:00:00+07:00").getTime();
  const dayEnd = dayStart + 86_400_000;
  const firstEn = sql<string | null>`(SELECT en FROM examples WHERE item_id = ${items.id} ORDER BY id LIMIT 1)`;
  const dueRows = await db
    .select({
      itemId: items.id,
      text: items.text,
      meaningId: items.meaningId,
      firstEn,
      due: cards.due,
      reps: cards.reps,
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(eq(items.status, "learning"), sql`${cards.due} < ${Date.now()}`))
    .orderBy(cards.due)
    .limit(limit);
  const newRows = await db
    .select({
      itemId: items.id,
      text: items.text,
      meaningId: items.meaningId,
      firstEn,
      due: cards.due,
      reps: cards.reps,
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(eq(items.status, "learning"), sql`${cards.due} >= ${dayStart}`, sql`${cards.due} < ${dayEnd}`, eq(cards.reps, 0)))
    .limit(Math.max(0, limit - dueRows.length));
  return [...dueRows, ...newRows];
}

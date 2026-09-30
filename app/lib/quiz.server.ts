import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "~/lib/db/client.server";
import { cards, items, quizSets, quizAnswers } from "~/lib/db/schema";
import { env } from "~/lib/env.server";

/** Tanggal lokal Asia/Jakarta (app personal, timezone tunggal). */
function localDayStr(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
    .toISOString()
    .slice(0, 10);
}

/**
 * Latihan harian — SATU SET per hari, tersimpan di DB (BLUEPRINT §3 F3, diupgrade):
 * - Set dibangun dari library sendiri (maks env.DAILY_QUIZ_SIZE soal, default 20)
 * - Progres kesimpen: keluar di tengah → lanjut lagi dari posisi terakhir
 * - Soal yang salah diselipkan lagi ±5 posisi dari posisi sekarang
 * - Selesai → rekap + masuk riwayat
 */

export type QuizQuestion = {
  itemId: number;
  type: "mcq_en_id" | "mcq_id_en" | "cloze" | "listen";
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

/**
 * Bangun soal hingga `limit` soal BERVARIASI — 1 item boleh dipakai beberapa tipe
 * soal (biar genap 20/hari walau library masih sedikit). Prioritas: kartu due FSRS,
 * lalu item learning lain.
 */
async function buildQuestions(limit: number): Promise<QuizQuestion[]> {
  const allRows = await db
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
    .limit(300);

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

  const types: QuizQuestion["type"][] = ["mcq_en_id", "mcq_id_en", "cloze", "listen"];
  const questions: QuizQuestion[] = [];

  for (let i = 0; questions.length < limit; i++) {
    const item = pool[i % pool.length];
    const type = types[questions.length % types.length];
    const others = allRows.filter((o) => o.id !== item.id && o.meaningId);
    const distractors = shuffle(others).slice(0, 3);

    if (type === "mcq_en_id") {
      const opts = shuffle([item.meaningId!, ...distractors.map((d) => d.meaningId!)]);      questions.push({
        itemId: item.id,
        type,
        prompt: item.text,
        options: opts,
        answer: String(opts.indexOf(item.meaningId!)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });

    } else if (type === "mcq_id_en") {
      const opts = shuffle([item.text, ...distractors.map((d) => d.text)]);
      questions.push({
        itemId: item.id,
        type,
        prompt: item.meaningId!,
        options: opts,
        answer: String(opts.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    } else if (type === "cloze") {
      const sentence = item.firstEn ?? "";
      const re = new RegExp(item.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const blanked = sentence ? sentence.replace(re, "_____") : "";
      if (!blanked.includes("_____")) {
        const opts = shuffle([item.meaningId!, ...distractors.map((d) => d.meaningId!)]);
        questions.push({
          itemId: item.id,
          type: "mcq_en_id",
          prompt: item.text,
          options: opts,
          answer: String(opts.indexOf(item.meaningId!)),
          meaningId: item.meaningId,
          exampleEn: item.firstEn,
        });
        continue;
      }
      const opts = shuffle([item.text, ...distractors.map((d) => d.text)]);
      questions.push({
        itemId: item.id,
        type: "cloze",
        prompt: blanked,
        options: opts,
        answer: String(opts.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: sentence,
      });
    } else {
      const opts = shuffle([item.text, ...distractors.map((d) => d.text)]);
      questions.push({
        itemId: item.id,
        type: "listen",
        prompt: naivePronunciation(item.text),
        options: opts,
        answer: String(opts.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    }
    if (i > limit * 10) break; // pengaman
  }
  return questions;
}

/** Ambil set hari ini; generate kalau belum ada. */
export async function getTodaySet() {
  const day = localDayStr();
  const [existing] = await db.select().from(quizSets).where(eq(quizSets.day, day)).limit(1);
  if (existing) return existing;

  const size = env.DAILY_QUIZ_SIZE;
  const questions = await buildQuestions(size);
  if (questions.length === 0) return null;

  const [created] = await db
    .insert(quizSets)
    .values({
      day,
      title: defaultTitle(day),
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
  const [again] = await db.select().from(quizSets).where(eq(quizSets.day, day)).limit(1);
  return again ?? null;
}

export function defaultTitle(day: string): string {
  const d = new Date(day + "T00:00:00");
  const kinds = ["Kuis", "Latihan", "Flashcard", "Drill"];
  const kind = kinds[d.getDate() % kinds.length];
  return `${kind} ${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
}

/** Jawab soal: catat, update progres, selipkan ulang soal yang salah. */
export async function answerQuestion(day: string, index: number, correct: boolean) {
  const [set] = await db.select().from(quizSets).where(eq(quizSets.day, day)).limit(1);
  if (!set || set.completed) return { ok: false as const, error: "Set tidak aktif" };

  const questions = JSON.parse(set.questions) as QuizQuestion[];
  const order = JSON.parse(set.order) as number[];

  db.transaction((tx) => {
    tx.insert(quizAnswers)
      .values({ setId: set.id, day, questionIndex: index, itemId: questions[index]?.itemId ?? 0, correct: correct ? 1 : 0, answeredAt: Date.now() })
      .onConflictDoNothing()
      .run();
    tx.update(quizSets)
      .set({
        done: set.done + 1,
        correct: set.correct + (correct ? 1 : 0),
      })
      .where(eq(quizSets.id, set.id))
      .run();

    if (!correct) {
      // Selipkan ulang soal yang salah ±5 posisi dari posisi sekarang.
      const reinsertAt = Math.min(order.length, index + 1 + 4 + Math.floor(Math.random() * 3));
      const nextOrder = [...order];
      nextOrder.splice(reinsertAt, 0, index);
      tx.update(quizSets)
        .set({ order: JSON.stringify(nextOrder) })
        .where(eq(quizSets.id, set.id))
        .run();
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

  const [after] = await db.select().from(quizSets).where(eq(quizSets.day, day)).limit(1);
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

/** Bel: set hari ini belum selesai? */
export async function pendingToday(): Promise<{ total: number; done: number; completed: boolean } | null> {
  const set = await getTodaySet();
  if (!set) return null;
  const order = JSON.parse(set.order) as number[];
  return { total: order.length, done: set.done, completed: Boolean(set.completed) };
}

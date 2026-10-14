import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/lib/db/client.server";
import { quizSets } from "~/lib/db/schema";
import { getTargetLang } from "~/lib/lang.server";
import { loadAllSteps } from "./route.server";
import type { RouteStep } from "./route.schema";
import type { QuizQuestion } from "./quiz.server";

/**
 * Progres + unlock Rute JA di atas quiz_sets (tanpa migrasi).
 * - Lesson step: day=`route:{lang}:{stepId}`, mode="route".
 * - Checkpoint exam: day=`route:{lang}:exam-{seg}`, mode="route_exam".
 * day mencakup lang karena UNIQUE(day,mode) tidak mencakup lang.
 * State: locked → available → in_progress → passed (grade ≥ passing.grade_pct).
 */

export type StepState = "locked" | "available" | "in_progress" | "passed";

export type StepProgress = {
  step: RouteStep;
  state: StepState;
  done: number;
  total: number;
  grade: number | null;
  setId: number | null;
};

export type ExamProgress = {
  segment: number;
  state: StepState;
  setId: number | null;
  grade: number | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Soal cloze step → QuizQuestion (konvensi mcq: answer = index opsi). itemId 0 = tanpa FSRS item (materi rute, bukan library). */
export function stepToQuestions(step: RouteStep): QuizQuestion[] {
  return step.cloze_items.map((c) => {
    const opts = shuffle([c.answer, ...c.distractors]);
    return {
      itemId: 0,
      type: "cloze" as const,
      prompt: c.front,
      options: opts,
      answer: String(opts.indexOf(c.answer)),
      meaningId: c.explain_id || step.title_id,
      exampleEn: c.kana_hint ? `(${c.kana_hint})` : null,
      reading: null,
    };
  });
}

/** Ambil semua set rute bahasa aktif (filter day prefix di memori — kolom day tak ada index prefix). */
async function allRouteSets(lang: string) {
  const rows = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.lang, lang), inArray(quizSets.mode, ["route", "route_exam"])))
    .limit(500);
  return rows;
}

/** Buat/ambil set lesson step. */
export async function getOrCreateRouteSet(stepId: string) {
  const lang = await getTargetLang();
  const day = `route:${lang}:${stepId}`;
  const [existing] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, "route"), eq(quizSets.lang, lang)))
    .limit(1);
  if (existing) return existing;

  const { loadAllSteps: load } = await import("./route.server");
  const found = load().find(({ step }) => step.step_id === stepId);
  if (!found) return null;
  const questions = stepToQuestions(found.step);
  const [created] = await db
    .insert(quizSets)
    .values({
      day,
      mode: "route",
      lang,
      title: found.step.title_id,
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
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, "route"), eq(quizSets.lang, lang)))
    .limit(1);
  return again ?? null;
}

/** Buat/ambil set checkpoint exam segmen (campuran cloze segmen itu, maks 15). */
export async function getOrCreateExamSet(segment: number) {
  const lang = await getTargetLang();
  const day = `route:${lang}:exam-${segment}`;
  const [existing] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, "route_exam"), eq(quizSets.lang, lang)))
    .limit(1);
  if (existing) return existing;

  const { loadAllSteps: load } = await import("./route.server");
  const segSteps = load()
    .map(({ step }) => step)
    .filter((s) => s.segment === segment);
  if (segSteps.length === 0) return null;
  const pool = shuffle(segSteps.flatMap((s) => stepToQuestions(s))).slice(0, 15);
  if (pool.length < 5) return null;
  const [created] = await db
    .insert(quizSets)
    .values({
      day,
      mode: "route_exam",
      lang,
      title: `Ujian Segmen ${segment}`,
      questions: JSON.stringify(pool),
      order: JSON.stringify(pool.map((_, i) => i)),
      total: pool.length,
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
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, "route_exam"), eq(quizSets.lang, lang)))
    .limit(1);
  return again ?? null;
}

export type RouteMap = {
  lang: string;
  segments: number[];
  steps: StepProgress[];
  exams: ExamProgress[];
  next: StepProgress | null;
  xp: number;
  totalXp: number;
};

function gradeOf(done: number, total: number, correct: number): number | null {
  if (done < total) return null;
  return total > 0 ? Math.round((correct / total) * 100) : null;
}

/** Peta progres penuh bahasa aktif. XP = 100/pass + 25 perfect (dihitung, tanpa storage). */
const mapCache = new Map<string, { at: number; map: RouteMap }>();
const MAP_TTL = 30_000;

export async function getRouteMap(): Promise<RouteMap> {
  const lang = await getTargetLang();
  const cached = mapCache.get(lang);
  // Cache 30 dtk: peta dibuka berulang (map ↔ step ↔ review) tanpa bayar ulang.
  // Invalidasi otomatis saat jawab soal? Tidak — TTL pendek cukup; progres
  // terbaru muncul maksimal 30 dtk kemudian (atau refresh).
  if (cached && Date.now() - cached.at < MAP_TTL) return cached.map;
  const map = await buildRouteMap(lang);
  mapCache.set(lang, { at: Date.now(), map });
  return map;
}

/** Hapus cache peta (dipanggil setelah jawab soal rute biar progres langsung segar). */
export function clearRouteMapCache() {
  mapCache.clear();
}

async function buildRouteMap(lang: string): Promise<RouteMap> {
  const steps = loadAllSteps()
    .map(({ step }) => step)
    .filter((s) => (lang === "ja" ? s.step_id.startsWith("ja-") : false));
  const sets = await allRouteSets(lang);
  const byDay = new Map(sets.map((s) => [s.day, s]));

  const progresses: StepProgress[] = steps.map((step) => {
    const set = byDay.get(`route:${lang}:${step.step_id}`);
    const total = set?.total ?? step.cloze_items.length;
    const done = set?.done ?? 0;
    const grade = set ? gradeOf(set.done, set.total, set.correct) : null;
    const passed = Boolean(set?.completed) && grade !== null && grade >= step.passing.grade_pct;
    return {
      step,
      state: "locked" as StepState,
      done,
      total,
      grade,
      setId: set?.id ?? null,
      ...(passed ? { passed: true } : {}),
    } as StepProgress & { passed?: boolean };
  });

  const bySeg = new Map<number, StepProgress[]>();
  for (const p of progresses) {
    const arr = bySeg.get(p.step.segment) ?? [];
    arr.push(p);
    bySeg.set(p.step.segment, arr);
  }
  const segments = [...bySeg.keys()].sort((a, b) => a - b);

  // Unlock: segmen 1 terbuka; segmen N terbuka bila exam N-1 passed.
  const examPassed = new Map<number, boolean>();
  const exams: ExamProgress[] = [];
  for (const seg of segments) {
    const set = byDay.get(`route:${lang}:exam-${seg}`);
    const grade = set ? gradeOf(set.done, set.total, set.correct) : null;
    const passed = Boolean(set?.completed) && grade !== null && grade >= 80;
    examPassed.set(seg, passed);
    exams.push({ segment: seg, state: "locked", setId: set?.id ?? null, grade });
  }

  let next: StepProgress | null = null;
  let xp = 0;
  for (const seg of segments) {
    const segOpen = seg === segments[0] || examPassed.get(seg - 1);
    const list = bySeg.get(seg)!;
    const allPassed = list.every(
      (p) => (p as StepProgress & { passed?: boolean }).passed,
    );
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const isPassed = Boolean((p as StepProgress & { passed?: boolean }).passed);
      if (isPassed) {
        xp += 100;
        if (p.grade === 100) xp += 25;
        continue;
      }
      if (!segOpen) {
        p.state = "locked";
        continue;
      }
      if (i === 0 || (list[i - 1]! as StepProgress & { passed?: boolean }).passed) {
        p.state = p.done > 0 ? "in_progress" : "available";
        next ??= p;
      } else {
        p.state = "locked";
      }
    }
    const exam = exams.find((e) => e.segment === seg)!;
    if ((examPassed.get(seg) ?? false)) {
      exam.state = "passed";
      xp += 150;
    } else if (segOpen && allPassed) {
      exam.state = "available";
      next ??= null; // exam diambil manual dari peta
    } else {
      exam.state = "locked";
    }
  }

  const totalSteps = progresses.length;
  const totalXp = totalSteps * 100 + segments.length * 150 + totalSteps * 25;
  return { lang, segments, steps: progresses, exams, next, xp, totalXp };
}

/** Step lanjut (untuk kartu Home). */
export async function getNextStep(): Promise<StepProgress | null> {
  return (await getRouteMap()).next;
}

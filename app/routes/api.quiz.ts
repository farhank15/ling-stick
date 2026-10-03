import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import {
  answerQuestion,
  getHistory,
  getSetById,
  getSetForDay,
  getTodaySet,
  pendingToday,
  localDayStr,
  createExtraSet,
  answerQuestionById,
  getPeriodicSet,
  periodicStatus,
  type QuizMode,
  type QuizQuestion,
} from "~/lib/quiz.server";

/**
 * GET /api/quiz                → set daily hari ini
 * GET /api/quiz?mode=typing    → set harian per mode
 * GET /api/quiz?status=1       → ringkasan untuk bel notifikasi
 * GET /api/quiz?history=1      → riwayat set latihan
 * POST { setId, index, correct }        → jawab soal (semua mode)
 * POST { index, correct }               → kompat: jawab set daily hari ini
 * POST { action: "known", itemId }      → tandai sudah hafal
 * POST { action: "create", mode, count, level?, topic? } → generate set tambahan manual
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);

  if (url.searchParams.get("status")) {
    const p = await pendingToday();
    const periodic = await periodicStatus();
    return Response.json({ pending: p, periodic });
  }

  if (url.searchParams.get("history")) {
    const history = await getHistory(14);
    return Response.json({ history });
  }

  // Status tes periodik (TOEFL mingguan & Uji Bulanan) — buat badge di Review & bel.
  if (url.searchParams.get("periodic")) {
    return Response.json(await periodicStatus());
  }

  const modeParam = url.searchParams.get("mode");

  // TOEFL mingguan / Uji Bulanan — dibuat otomatis sekali per periode.
  if (modeParam === "toefl" || modeParam === "bulanan") {
    const set = await getPeriodicSet(modeParam);
    if (!set) return Response.json({ questions: [], set: null });
    return setResponse(set);
  }

  const level = url.searchParams.get("level") ?? undefined;
  const mode: QuizMode = ["daily", "extra", "typing", "intens", "audio", "scramble", "mix", "dikte", "shadow", "pola"].includes(modeParam ?? "")
    ? (modeParam as QuizMode)
    : "daily";
  const setIdParam = url.searchParams.get("setId");

  if (setIdParam) {
    const set = await getSetById(Number(setIdParam));
    if (!set) return Response.json({ questions: [], set: null });
    return setResponse(set);
  }

  const set =
    mode === "daily"
      ? await getTodaySet()
      : await getSetForDay(mode, localDayStr(), envLimit(mode), {
          bankLevel: level,
        });
  if (!set) return Response.json({ questions: [], set: null });
  return setResponse(set);
}

function envLimit(mode: QuizMode): number {
  if (mode === "intens") return 25;
  if (mode === "typing" || mode === "audio" || mode === "scramble" || mode === "dikte" || mode === "pola") return 15;
  if (mode === "shadow") return 10;
  return 20;
}

function setResponse(set: NonNullable<Awaited<ReturnType<typeof getSetById>>>) {
  return Response.json({
    set: {
      id: set.id,
      day: set.day,
      mode: set.mode,
      title: set.title,
      total: JSON.parse(set.order).length as number,
      done: set.done,
      correct: set.correct,
      completed: Boolean(set.completed),
    },
    questions: JSON.parse(set.questions) as QuizQuestion[],
    order: JSON.parse(set.order) as number[],
  });
}

/** POST /api/quiz { index, correct } atau { action: "known", itemId } */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    setId?: number;
    index?: number;
    correct?: boolean;
    action?: string;
    itemId?: number;
    mode?: string;
    count?: number;
    level?: string;
    topic?: string;
    typed?: string;
  };

  if (body.action === "known" && Number.isInteger(body.itemId)) {
    const { markItemKnownFromQuiz } = await import("~/lib/quiz.server");
    await markItemKnownFromQuiz(body.itemId!);
    return Response.json({ ok: true });
  }

  if (body.action === "create") {
    const mode = ["extra", "typing", "intens", "audio", "scramble", "mix", "dikte", "shadow", "pola"].includes(body.mode ?? "")
      ? (body.mode as Exclude<QuizMode, "daily">)
      : "extra";
    const count = Math.min(30, Math.max(5, Number(body.count) || 10));
    const level = body.level && body.level !== "all" ? body.level : undefined;
    const set = await createExtraSet(mode, count, { bankLevel: level });
    if (!set) return Response.json({ error: "Tidak ada kosakata untuk dibuat soal" }, { status: 400 });
    return Response.json({ ok: true, setId: set.id });
  }

  const day = localDayStr();
  if (!Number.isInteger(body.index) || typeof body.correct !== "boolean") {
    return Response.json({ error: "index & correct wajib" }, { status: 400 });
  }

  if (Number.isInteger(body.setId)) {
    const result = await answerQuestionById(body.setId!, body.index!, body.correct, body.typed);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({
      ok: true,
      done: result.set.done,
      correct: result.set.correct,
      order: JSON.parse(result.set.order) as number[],
      finished: result.finished,
    });
  }

  // Kompatibilitas: tanpa setId → set daily hari ini.
  const result = await answerQuestion(day, body.index!, body.correct);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({
    ok: true,
    done: result.set.done,
    correct: result.set.correct,
    order: JSON.parse(result.set.order) as number[],
    finished: result.finished,
  });
}

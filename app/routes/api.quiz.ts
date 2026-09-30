import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import {
  answerQuestion,
  getHistory,
  getTodaySet,
  pendingToday,
  type QuizQuestion,
} from "~/lib/quiz.server";

/**
 * GET /api/quiz            → set hari ini (dengan progres tersimpan)
 * GET /api/quiz?status=1   → ringkasan untuk bel notifikasi
 * GET /api/quiz?history=1  → riwayat set latihan
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);

  if (url.searchParams.get("status")) {
    const p = await pendingToday();
    return Response.json({ pending: p });
  }

  if (url.searchParams.get("history")) {
    const history = await getHistory(14);
    return Response.json({ history });
  }

  const set = await getTodaySet();
  if (!set) return Response.json({ questions: [], set: null });

  return Response.json({
    set: {
      id: set.id,
      day: set.day,
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
    index?: number;
    correct?: boolean;
    action?: string;
    itemId?: number;
  };

  if (body.action === "known" && Number.isInteger(body.itemId)) {
    const { markItemKnownFromQuiz } = await import("~/lib/quiz.server");
    await markItemKnownFromQuiz(body.itemId!);
    return Response.json({ ok: true });
  }

  const day = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  )
    .toISOString()
    .slice(0, 10);
  if (!Number.isInteger(body.index) || typeof body.correct !== "boolean") {
    return Response.json({ error: "index & correct wajib" }, { status: 400 });
  }
  const result = await answerQuestion(day, body.index!, body.correct);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({
    ok: true,
    done: result.set.done,
    correct: result.set.correct,
    finished: result.finished,
  });
}

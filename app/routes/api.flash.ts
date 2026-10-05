import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { applyRating } from "~/lib/fsrs.server";
import { applyReview, getItemDetail } from "~/lib/items.server";
import { getFlashQueue } from "~/lib/quiz.server";

/**
 * GET /api/flash → antrian flashcard (kartu due + kartu baru hari ini)
 * POST { itemId, rating } → terapkan rating FSRS (1=Again .. 4=Easy)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  // exclude=itemId,itemId — kartu yang sudah tampil sesi ini dilewati biar
  // putaran berikutnya variatif + kartu baru otomatis nyelip. Kalau hasilnya
  // kosong, server fallback ke antrean penuh (jangan dead-end).
  const url = new URL(request.url);
  const exclude = (url.searchParams.get("exclude") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
  const queue = await getFlashQueue(30, exclude);
  return Response.json({ cards: queue });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    itemId?: number;
    rating?: number;
  };
  const itemId = Number(body.itemId);
  const rating = Number(body.rating);
  if (!Number.isInteger(itemId) || ![1, 2, 3, 4].includes(rating)) {
    return Response.json({ error: "itemId & rating 1..4 wajib" }, { status: 400 });
  }
  const detail = await getItemDetail(itemId);
  if (!detail?.card) return Response.json({ error: "Kartu tidak ada" }, { status: 404 });

  // Baris kartu saat ini → FSRS → simpan.
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
  await applyReview(itemId, rating as 1 | 2 | 3 | 4, "flashcard", next);
  return Response.json({ ok: true, due: next.due });
}

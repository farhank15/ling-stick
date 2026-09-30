import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { applyRating } from "~/lib/fsrs.server";
import { applyReview, getReviewQueue, markKnown } from "~/lib/items.server";

/**
 * GET /api/review/queue tidak dipisah — loader di sini mengembalikan antrian;
 * action POST /api/review { itemId, rating, mode } → jadwal FSRS baru.
 * POST /api/review { itemId, action: "known" } → tandai sudah hafal.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const queue = await getReviewQueue();
  return Response.json(queue);
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    itemId?: number;
    rating?: number;
    mode?: string;
    action?: string;
  };
  const itemId = Number(body.itemId);
  if (!Number.isInteger(itemId)) {
    return Response.json({ error: "itemId wajib" }, { status: 400 });
  }

  if (body.action === "known") {
    await markKnown(itemId);
    return Response.json({ ok: true, known: true });
  }

  const rating = Number(body.rating);
  if (![1, 2, 3, 4].includes(rating)) {
    return Response.json({ error: "rating 1..4" }, { status: 400 });
  }
  const mode = typeof body.mode === "string" ? body.mode : "recognition";

  // Baris kartu saat ini → FSRS → simpan.
  const { getItemDetail } = await import("~/lib/items.server");
  const detail = await getItemDetail(itemId);
  if (!detail?.card) return Response.json({ error: "Kartu tidak ada" }, { status: 404 });

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
  await applyReview(itemId, rating as 1 | 2 | 3 | 4, mode, next);

  return Response.json({ ok: true, due: next.due });
}

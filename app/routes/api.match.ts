import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { applyRating } from "~/lib/fsrs.server";
import { applyReview, getItemDetail } from "~/lib/items.server";
import { getMatchRounds } from "~/lib/quiz.server";

/**
 * GET /api/match → 5 ronde × 4 pasangan {itemId, word, meaning}
 * POST { results: { itemId, correct }[] } → FSRS: benar = Good(3), pernah salah = Again(1)
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const rounds = await getMatchRounds(5, 4);
  return Response.json({ rounds });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    results?: { itemId?: number; correct?: boolean }[];
  };
  const results = (body.results ?? []).filter(
    (r) => Number.isInteger(r.itemId) && typeof r.correct === "boolean",
  ) as { itemId: number; correct: boolean }[];
  if (results.length === 0) {
    return Response.json({ ok: true, updated: 0 });
  }

  // Dedupe per item (bisa muncul di >1 ronde) — rating terakhir yang menang.
  const byItem = new Map<number, boolean>();
  for (const r of results) byItem.set(r.itemId, r.correct);

  let updated = 0;
  for (const [itemId, correct] of byItem) {
    const detail = await getItemDetail(itemId);
    if (!detail?.card) continue;
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
    await applyReview(itemId, rating as 1 | 2 | 3 | 4, "match", next);
    updated++;
  }
  return Response.json({ ok: true, updated });
}

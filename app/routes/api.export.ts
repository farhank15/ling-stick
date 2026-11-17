import type { LoaderFunctionArgs } from "react-router";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import {
  alternatives,
  cards,
  examples,
  itemTags,
  items,
  quizSets,
  reviewLogs,
  settings,
  tags,
} from "~/lib/db/schema";
import { inUserContext, requireUserId } from "~/lib/user-context";

/**
 * GET /api/export — backup JSON seluruh data.
 * Format file memakai snake_case (sama dengan kolom DB) supaya stabil
 * dan gampah dibaca; import menerima snake_case & camelCase.
 */
export function loader(...args: Parameters<typeof _loader>) {
  return inUserContext(() => _loader(...args));
}

async function _loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const uid = requireUserId();

  const its = await db.select().from(items).where(eq(items.userId, uid));
  const ids = its.map((r) => r.id);
  const [exs, alts, itgs, cds, rls] = await Promise.all([
    ids.length ? db.select().from(examples).where(inArray(examples.itemId, ids)) : [],
    ids.length ? db.select().from(alternatives).where(inArray(alternatives.itemId, ids)) : [],
    ids.length ? db.select().from(itemTags).where(inArray(itemTags.itemId, ids)) : [],
    ids.length ? db.select().from(cards).where(inArray(cards.itemId, ids)) : [],
    ids.length
      ? db
          .select()
          .from(reviewLogs)
          .where(and(inArray(reviewLogs.itemId, ids), eq(reviewLogs.userId, uid)))
      : [],
  ]);
  const qs = await db.select().from(quizSets).where(eq(quizSets.userId, uid));
  const sts = await db.select().from(settings).where(eq(settings.userId, uid));
  const tagIds = [...new Set(itgs.map((r) => r.tagId))];
  const tgs = tagIds.length ? await db.select().from(tags).where(inArray(tags.id, tagIds)) : [];

  const payload = {
    app: "lingstick",
    version: 1,
    exportedAt: new Date().toISOString(),
    items: its.map((r) => ({
      id: r.id,
      text: r.text,
      text_norm: r.textNorm,
      type: r.type,
      register: r.register,
      meaning_id: r.meaningId,
      notes_id: r.notesId,
      source: r.source,
      confidence: r.confidence,
      status: r.status,
      hide_meaning: r.hideMeaning,
      created_at: r.createdAt,
    })),
    examples: exs.map((r) => ({
      id: r.id,
      item_id: r.itemId,
      sense_label: r.senseLabel,
      register: r.register,
      en: r.en,
      id_text: r.idText,
      is_context: r.isContext,
    })),
    alternatives: alts.map((r) => ({
      id: r.id,
      item_id: r.itemId,
      text: r.text,
      register: r.register,
      nuance_id: r.nuanceId,
      use_when_id: r.useWhenId,
    })),
    tags: tgs,
    item_tags: itgs.map((r) => ({ item_id: r.itemId, tag_id: r.tagId })),
    cards: cds.map((r) => ({
      item_id: r.itemId,
      due: r.due,
      stability: r.stability,
      difficulty: r.difficulty,
      elapsed_days: r.elapsedDays,
      scheduled_days: r.scheduledDays,
      reps: r.reps,
      lapses: r.lapses,
      state: r.state,
      learning_steps: r.learningSteps,
      last_review: r.lastReview,
    })),
    review_logs: rls.map((r) => ({
      id: r.id,
      item_id: r.itemId,
      rating: r.rating,
      mode: r.mode,
      reviewed_at: r.reviewedAt,
      state: r.state,
      due: r.due,
    })),
    quiz_sets: qs.map((r) => ({
      id: r.id,
      day: r.day,
      title: r.title,
      questions: r.questions,
      order_json: r.order,
      total: r.total,
      done: r.done,
      correct: r.correct,
      completed: r.completed,
      created_at: r.createdAt,
    })),
    settings: sts,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lingstick-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

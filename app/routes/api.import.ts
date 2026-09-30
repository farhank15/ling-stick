import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import {
  alternatives,
  cards,
  examples,
  exploreItems,
  itemTags,
  items,
  quizSets,
  reviewLogs,
  settings,
  tags,
} from "~/lib/db/schema";
import { normalizeText } from "~/lib/items.server";

type Row = Record<string, unknown>;
const str = (v: unknown, d = "") => (v === null || v === undefined ? d : String(v));
const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const nullableNum = (v: unknown) =>
  v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

/** Ambil array dari payload, terima snake_case (format baru) & camelCase (lama). */
function pick(p: Row, snake: string, camel: string): Row[] {
  const v = p[snake] ?? p[camel];
  return Array.isArray(v) ? (v as Row[]) : [];
}

/**
 * POST /api/import — restore data dari file backup (GET /api/export).
 * Additive: item dengan text_norm yang sama dilewati (nggak ditimpa).
 * Atomic: satu transaction — gagal di tengah → semua dibatalkan.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const p = (await request.json().catch(() => null)) as Row | null;
  if (!p || !Array.isArray(p.items ?? p.its)) {
    return Response.json(
      { error: "Format nggak dikenal — pakai file backup LingStick (ada field 'items')" },
      { status: 400 },
    );
  }

  const stats = {
    itemsAdded: 0,
    itemsSkipped: 0,
    examplesAdded: 0,
    alternativesAdded: 0,
    cardsAdded: 0,
    reviewLogsAdded: 0,
    exploreAdded: 0,
    quizSetsAdded: 0,
  };

  try {
    await db.transaction(async (tx) => {
      // 1) Items — skip yang text_norm-nya sudah ada, insert sisanya.
      const idMap = new Map<number, number>();
      for (const it of pick(p, "items", "items")) {
        const text = str(it.text).trim();
        const oldId = num(it.id);
        if (!text) continue;
        const textNorm = str(it.text_norm) || normalizeText(text);
        const [existing] = await tx
          .select({ id: items.id })
          .from(items)
          .where(eq(items.textNorm, textNorm))
          .limit(1);
        if (existing) {
          // Skip: item sudah ada → children-nya JUGA dilewati (anti duplikat).
          stats.itemsSkipped++;
          continue;
        }
        const [inserted] = await tx
          .insert(items)
          .values({
            text,
            textNorm,
            type: str(it.type, "word"),
            register: str(it.register, "neutral"),
            meaningId: str(it.meaning_id ?? it.meaningId) || null,
            notesId: str(it.notes_id ?? it.notesId) || null,
            source: str(it.source) || null,
            confidence: str(it.confidence, "medium"),
            status: str(it.status, "learning"),
            hideMeaning: num(it.hide_meaning ?? it.hideMeaning),
            createdAt: num(it.created_at ?? it.createdAt, Date.now()),
          })
          .returning({ id: items.id });
        if (oldId) idMap.set(oldId, inserted.id);
        stats.itemsAdded++;
      }

      // 2) Anak-anah item — hanya untuk item baru (id lama → baru ada di map).
      for (const ex of pick(p, "examples", "examples")) {
        const itemId = idMap.get(num(ex.item_id ?? ex.itemId));
        if (!itemId) continue;
        await tx.insert(examples).values({
          itemId,
          senseLabel: str(ex.sense_label ?? ex.senseLabel) || null,
          register: str(ex.register, "neutral"),
          en: str(ex.en),
          idText: str(ex.id_text ?? ex.idText),
          isContext: num(ex.is_context ?? ex.isContext),
        });
        stats.examplesAdded++;
      }
      for (const al of pick(p, "alternatives", "alternatives")) {
        const itemId = idMap.get(num(al.item_id ?? al.itemId));
        if (!itemId) continue;
        await tx.insert(alternatives).values({
          itemId,
          text: str(al.text),
          register: str(al.register) || null,
          nuanceId: str(al.nuance_id ?? al.nuanceId) || null,
          useWhenId: str(al.use_when_id ?? al.useWhenId) || null,
        });
        stats.alternativesAdded++;
      }
      for (const c of pick(p, "cards", "cards")) {
        const itemId = idMap.get(num(c.item_id ?? c.itemId));
        if (!itemId) continue;
        const [dupe] = await tx
          .select({ x: cards.itemId })
          .from(cards)
          .where(eq(cards.itemId, itemId))
          .limit(1);
        if (dupe) continue;
        await tx.insert(cards).values({
          itemId,
          due: num(c.due, Date.now()),
          stability: nullableNum(c.stability),
          difficulty: nullableNum(c.difficulty),
          elapsedDays: num(c.elapsed_days ?? c.elapsedDays),
          scheduledDays: num(c.scheduled_days ?? c.scheduledDays),
          reps: num(c.reps),
          lapses: num(c.lapses),
          state: num(c.state),
          learningSteps: num(c.learning_steps ?? c.learningSteps),
          lastReview: nullableNum(c.last_review ?? c.lastReview),
        });
        stats.cardsAdded++;
      }
      for (const rl of pick(p, "review_logs", "reviewLogs")) {
        const itemId = idMap.get(num(rl.item_id ?? rl.itemId));
        if (!itemId) continue;
        await tx.insert(reviewLogs).values({
          itemId,
          rating: num(rl.rating),
          mode: str(rl.mode) || null,
          reviewedAt: num(rl.reviewed_at ?? rl.reviewedAt, Date.now()),
          state: nullableNum(rl.state),
          due: nullableNum(rl.due),
        });
        stats.reviewLogsAdded++;
      }

      // 3) Tags — resolve by nama (global).
      const tagMap = new Map<number, number>();
      for (const t of pick(p, "tags", "tags")) {
        const name = str(t.name).trim();
        if (!name) continue;
        await tx.insert(tags).values({ name }).onConflictDoNothing();
        const [row] = await tx
          .select({ id: tags.id })
          .from(tags)
          .where(eq(tags.name, name))
          .limit(1);
        if (row) tagMap.set(num(t.id), row.id);
      }
      for (const itg of pick(p, "item_tags", "itemTags")) {
        const itemId = idMap.get(num(itg.item_id ?? itg.itemId));
        const tagId = tagMap.get(num(itg.tag_id ?? itg.tagId));
        if (!itemId || !tagId) continue;
        await tx.insert(itemTags).values({ itemId, tagId }).onConflictDoNothing();
      }

      // 4) Explore — merge aman (unique category+text).
      for (const e of pick(p, "explore_items", "exploreItems")) {
        const r = await tx
          .insert(exploreItems)
          .values({
            category: str(e.category),
            text: str(e.text),
            type: str(e.type) || null,
            register: str(e.register) || null,
            meaningId: str(e.meaning_id ?? e.meaningId) || null,
            useWhenId: str(e.use_when_id ?? e.useWhenId) || null,
            exampleEn: str(e.example_en ?? e.exampleEn) || null,
            exampleId: str(e.example_id ?? e.exampleId) || null,
            examplesJson: str(e.examples_json ?? e.examplesJson) || null,
            hidden: num(e.hidden),
            createdAt: num(e.created_at ?? e.createdAt, Date.now()),
          })
          .onConflictDoNothing()
          .returning({ id: exploreItems.id });
        if (r.length > 0) stats.exploreAdded++;
      }

      // 5) Quiz set & settings — merge (yang sudah ada dilewati).
      for (const q of pick(p, "quiz_sets", "quizSets")) {
        if (!str(q.day)) continue;
        const r = await tx
          .insert(quizSets)
          .values({
            day: str(q.day),
            title: str(q.title, "Import"),
            questions: str(q.questions, "[]"),
            order: str(q.order_json ?? q.order ?? q.orderJson, "[]"),
            total: num(q.total),
            done: num(q.done),
            correct: num(q.correct),
            completed: num(q.completed),
            createdAt: num(q.created_at ?? q.createdAt, Date.now()),
          })
          .onConflictDoNothing()
          .returning({ id: quizSets.id });
        if (r.length > 0) stats.quizSetsAdded++;
      }
      for (const s of pick(p, "settings", "settings")) {
        const key = str(s.key);
        if (!key) continue;
        await tx
          .insert(settings)
          .values({ key, value: str(s.value) })
          .onConflictDoNothing();
      }
    });

    return Response.json({ ok: true, stats });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Import gagal" },
      { status: 500 },
    );
  }
}

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { db } from "./db/client.server";
import {
  alternatives,
  cards,
  examples,
  exploreItems,
  itemTags,
  items,
  reviewLogs,
  tags,
} from "./db/schema";
import { env } from "./env.server";
import { newCardRow } from "./fsrs.server";
import { startOfDay, addDays } from "./utils.shared";

/**
 * Data layer Item — BLUEPRINT §6/§7. Semua akses DB items/cards ada di sini.
 */

export type ItemType =
  | "word"
  | "phrasal_verb"
  | "idiom"
  | "collocation"
  | "slang"
  | "reaction"
  | "sentence";

export type SaveItemInput = {
  text: string;
  type: ItemType;
  register?: string;
  meaningId?: string;
  notesId?: string;
  source?: string;
  confidence?: string;
  status?: "learning" | "known" | "archived";
  examples: {
    senseLabel?: string;
    register: string; // casual | neutral | formal
    en: string;
    idText: string;
    isContext?: boolean;
  }[];
  alternatives?: {
    text: string;
    register?: string;
    nuanceId?: string;
    useWhenId?: string;
  }[];
  tagNames?: string[];
};

export class DuplicateItemError extends Error {
  existingId: number;
  constructor(existingId: number) {
    super("Item sudah ada di Library");
    this.existingId = existingId;
  }
}

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function findItemIdByText(text: string): Promise<number | null> {
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.textNorm, normalizeText(text)))
    .limit(1);
  return row?.id ?? null;
}

export async function saveItem(input: SaveItemInput): Promise<number> {
  const now = Date.now();
  const textNorm = normalizeText(input.text);

  const existing = await findItemIdByText(input.text);
  if (existing) throw new DuplicateItemError(existing);

  const id = await db.transaction(async (tx) => {
    const result = await tx
      .insert(items)
      .values({
        text: input.text.trim(),
        textNorm,
        type: input.type,
        register: input.register ?? "neutral",
        meaningId: input.meaningId || null,
        notesId: input.notesId || null,
        source: input.source || null,
        confidence: input.confidence ?? "medium",
        status: input.status ?? "learning",
        createdAt: now,
      })
      .returning({ id: items.id });
    const item = result[0];

    if (input.examples.length > 0) {
      await tx.insert(examples).values(
        input.examples.map((ex) => ({
          itemId: item.id,
          senseLabel: ex.senseLabel || null,
          register: ex.register,
          en: ex.en.trim(),
          idText: ex.idText.trim(),
        isContext: ex.isContext ? 1 : 0,
        })),
      );
    }
    if (input.alternatives && input.alternatives.length > 0) {
      await tx.insert(alternatives).values(
        input.alternatives.map((a) => ({
          itemId: item.id,
          text: a.text.trim(),
          register: a.register || null,
          nuanceId: a.nuanceId || null,
          useWhenId: a.useWhenId || null,
        })),
      );
    }
    if (input.tagNames && input.tagNames.length > 0) {
      for (const name of input.tagNames) {
        const clean = name.trim();
        if (!clean) continue;
        await tx.insert(tags).values({ name: clean }).onConflictDoNothing();
        const [tag] = await tx.select().from(tags).where(eq(tags.name, clean));
        if (tag) {
          await tx.insert(itemTags).values({ itemId: item.id, tagId: tag.id }).onConflictDoNothing();
        }
      }
    }

    // Kartu review dibuat langsung, due: hari ini (BLUEPRINT §4).
    const card = newCardRow(item.id, now);
    await tx.insert(cards).values({
      itemId: item.id,
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      learningSteps: card.learningSteps,
      lastReview: card.lastReview,
    });

    return item.id;
  });

  return id;
}

/** Tambah contoh baru ke item yang sudah ada (alur duplikat). */
export async function addExamplesToItem(
  itemId: number,
  newExamples: SaveItemInput["examples"],
) {
  if (newExamples.length === 0) return;
  await db.insert(examples)
    .values(
      newExamples.map((ex) => ({
        itemId,
        senseLabel: ex.senseLabel || null,
        register: ex.register,
        en: ex.en.trim(),
        idText: ex.idText.trim(),
        isContext: ex.isContext ? 1 : 0,
      })),
    );
}

export type LibraryFilters = {
  q?: string;
  type?: string;
  register?: string;
  status?: string;
  tag?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
};

export type LibraryRow = {
  id: number;
  text: string;
  type: string;
  register: string;
  meaningId: string | null;
  notesId: string | null;
  source: string | null;
  confidence: string | null;
  status: string;
  hideMeaning: number;
  createdAt: number;
  firstExampleEn: string | null;
  firstExampleId: string | null;
  firstExampleRegister: string | null;
};

export async function listItems(filters: LibraryFilters): Promise<LibraryRow[]> {
  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;

  // Full-text search via FTS5 (BLUEPRINT §5).
  if (filters.q && filters.q.trim()) {
    const ftsQuery = ftsEscape(filters.q);
    const rows = await db.all<{
        id: number;
        text: string;
        type: string;
        register: string;
        meaning_id: string | null;
        notes_id: string | null;
        source: string | null;
        confidence: string | null;
        status: string;
        hide_meaning: number;
        created_at: number;
        first_en: string | null;
        first_id: string | null;
        first_reg: string | null;
      }>(sql`
        SELECT i.id, i.text, i.type, i.register, i.meaning_id, i.notes_id, i.source,
               i.confidence, i.status, i.hide_meaning, i.created_at,
               (SELECT en FROM examples WHERE item_id = i.id ORDER BY id LIMIT 1) AS first_en,
               (SELECT id_text FROM examples WHERE item_id = i.id ORDER BY id LIMIT 1) AS first_id,
               (SELECT register FROM examples WHERE item_id = i.id ORDER BY id LIMIT 1) AS first_reg
        FROM items i
        JOIN items_fts f ON i.id = f.rowid
        WHERE items_fts MATCH ${ftsQuery}
          AND i.status = ${filters.status === "all" ? sql`i.status` : (filters.status || "learning")}
          ${filters.type ? sql`AND i.type = ${filters.type}` : sql``}
          ${filters.register ? sql`AND i.register = ${filters.register}` : sql``}
        ORDER BY i.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
    return rows.map(mapLibraryRow);
  }

  const conds: SQLWrapper[] = [];
  // Default (tab "Belajar") = status learning saja — yang udah hafal ilang dari sini.
  // "all" = learning + hafal (arsip dihapus dari UI).
  if (filters.status === "all") conds.push(sql`${items.status} IN ('learning', 'known')`);
  else if (filters.status) conds.push(eq(items.status, filters.status));
  else conds.push(eq(items.status, "learning"));
  if (filters.type) conds.push(eq(items.type, filters.type));
  if (filters.register) conds.push(eq(items.register, filters.register));
  if (filters.dateFrom) conds.push(gte(items.createdAt, filters.dateFrom));
  if (filters.dateTo) conds.push(lte(items.createdAt, filters.dateTo));

  let idsByTag: number[] | null = null;
  if (filters.tag) {
    const rows = await db
      .select({ itemId: itemTags.itemId })
      .from(itemTags)
      .innerJoin(tags, eq(tags.id, itemTags.tagId))
      .where(eq(tags.name, filters.tag));
    idsByTag = rows.map((r) => r.itemId);
    if (idsByTag.length === 0) return [];
    conds.push(inArray(items.id, idsByTag));
  }

  const rows = await db
    .select({
      id: items.id,
      text: items.text,
      type: items.type,
      register: items.register,
      meaningId: items.meaningId,
      notesId: items.notesId,
      source: items.source,
      confidence: items.confidence,
      status: items.status,
      hideMeaning: items.hideMeaning,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(and(...conds))
    .orderBy(desc(items.createdAt))
    .limit(limit)
    .offset(offset);

  return Promise.all(rows.map(async (r) => {
    const [ex] = await db
      .select({ en: examples.en, idText: examples.idText, register: examples.register })
      .from(examples)
      .where(eq(examples.itemId, r.id))
      .orderBy(examples.id)
      .limit(1);
    return {
      ...r,
      firstExampleEn: ex?.en ?? null,
      firstExampleId: ex?.idText ?? null,
      firstExampleRegister: ex?.register ?? null,
    } satisfies LibraryRow;
  }));
}

function ftsEscape(q: string): string {
  // Kalimat bebas → prefix-match per token, aman dari karakter spesial FTS.
  return q
    .trim()
    .split(/\s+/)
    .map((w) => `"${w.replace(/"/g, "")}"*`)
    .join(" ");
}

function mapLibraryRow(r: {
  id: number;
  text: string;
  type: string;
  register: string;
  meaning_id: string | null;
  notes_id: string | null;
  source: string | null;
  confidence: string | null;
  status: string;
  hide_meaning: number;
  created_at: number;
  first_en: string | null;
  first_id: string | null;
  first_reg: string | null;
}): LibraryRow {
  return {
    id: r.id,
    text: r.text,
    type: r.type,
    register: r.register,
    meaningId: r.meaning_id,
    notesId: r.notes_id,
    source: r.source,
    confidence: r.confidence,
    status: r.status,
    hideMeaning: r.hide_meaning,
    createdAt: r.created_at,
    firstExampleEn: r.first_en,
    firstExampleId: r.first_id,
    firstExampleRegister: r.first_reg,
  };
}

export async function getItemDetail(id: number) {
  const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!item) return null;
  const exs = await db
    .select()
    .from(examples)
    .where(eq(examples.itemId, id))
    .orderBy(examples.id);
  const alts = await db
    .select()
    .from(alternatives)
    .where(eq(alternatives.itemId, id))
    .orderBy(alternatives.id);
  const [card] = await db.select().from(cards).where(eq(cards.itemId, id)).limit(1);
  return { item, examples: exs, alternatives: alts, card: card ?? null };
}

export async function updateItem(
  id: number,
  patch: Partial<{
    text: string;
    type: string;
    register: string;
    meaningId: string;
    notesId: string;
    source: string;
    status: string;
    hideMeaning: number;
  }>,
) {
  const values: Record<string, unknown> = {};
  if (patch.text !== undefined) {
    values.text = patch.text.trim();
    values.textNorm = normalizeText(patch.text);
  }
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.register !== undefined) values.register = patch.register;
  if (patch.meaningId !== undefined) values.meaningId = patch.meaningId;
  if (patch.notesId !== undefined) values.notesId = patch.notesId;
  if (patch.source !== undefined) values.source = patch.source;
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.hideMeaning !== undefined) values.hideMeaning = patch.hideMeaning;
  if (Object.keys(values).length === 0) return;
  await db.update(items).set(values).where(eq(items.id, id));
}

export async function deleteItem(id: number) {
  await db.delete(items).where(eq(items.id, id));
}

/* ── Review queue ───────────────────────────────────────────── */

export type QueueCard = {
  itemId: number;
  itemText: string;
  type: string;
  register: string;
  meaningId: string | null;
  state: number;
  due: number;
  examples: { en: string; idText: string; register: string; senseLabel: string | null }[];
};

export async function getReviewQueue(): Promise<{
  due: QueueCard[];
  newCards: QueueCard[];
  newPerDay: number;
}> {
  const today = startOfDay().getTime();
  const tomorrow = addDays(startOfDay(), 1).getTime();

  const dueRows = await db
    .select({
      itemId: cards.itemId,
      state: cards.state,
      due: cards.due,
      itemText: items.text,
      type: items.type,
      register: items.register,
      meaningId: items.meaningId,
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(lte(cards.due, tomorrow - 1), eq(items.status, "learning"), sql`${cards.reps} > 0`))
    .orderBy(cards.due)
    .limit(200);

  const newRows = await db
    .select({
      itemId: cards.itemId,
      state: cards.state,
      due: cards.due,
      itemText: items.text,
      type: items.type,
      register: items.register,
      meaningId: items.meaningId,
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(gte(cards.due, today), lte(cards.due, tomorrow - 1), sql`${cards.reps} = 0`, eq(items.status, "learning")))
    .orderBy(items.createdAt)
    .limit(env.NEW_CARDS_PER_DAY);

  const all = [...dueRows, ...newRows];
  const exs = all.length
    ? await db
        .select()
        .from(examples)
        .where(inArray(examples.itemId, all.map((r) => r.itemId)))
    : [];

  const decorate = (r: (typeof dueRows)[number]): QueueCard => ({
    itemId: r.itemId,
    itemText: r.itemText,
    type: r.type,
    register: r.register,
    meaningId: r.meaningId,
    state: r.state,
    due: r.due,
    examples: exs
      .filter((e) => e.itemId === r.itemId)
      .map((e) => ({ en: e.en, idText: e.idText, register: e.register, senseLabel: e.senseLabel })),
  });

  return {
    due: dueRows.map(decorate),
    newCards: newRows.map(decorate),
    newPerDay: env.NEW_CARDS_PER_DAY,
  };
}

export async function applyReview(
  itemId: number,
  rating: 1 | 2 | 3 | 4,
  mode: string,
  next: {
    due: number;
    stability: number | null;
    difficulty: number | null;
    elapsedDays: number | null;
    scheduledDays: number | null;
    reps: number;
    lapses: number;
    state: number;
    lastReview: number | null;
  },
) {
  await db.transaction(async (tx) => {
    await tx.update(cards)
      .set({
        due: next.due,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsedDays,
        scheduledDays: next.scheduledDays,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        lastReview: next.lastReview,
      })
      .where(eq(cards.itemId, itemId));
    await tx.insert(reviewLogs).values({
      itemId,
      rating,
      mode,
      reviewedAt: Date.now(),
      state: next.state,
      due: next.due,
    });
  });
}

/** Tandai sudah hafal: kartu keluar dari antrian, item tetap di Library. */
export async function markKnown(itemId: number) {
  await db.update(items).set({ status: "known" }).where(eq(items.id, itemId));
}

export async function markLearning(itemId: number) {
  await db.update(items).set({ status: "learning" }).where(eq(items.id, itemId));
}

/* ── Explore ────────────────────────────────────────────────── */

export async function getExploreCategory(category: string) {
  const rows = await db
    .select()
    .from(exploreItems)
    .where(and(eq(exploreItems.category, category), eq(exploreItems.hidden, 0)));
  return rows;
}

export async function saveExploreRow(row: {
  category: string;
  text: string;
  type: string;
  register: string;
  meaningId: string;
  useWhenId: string;
  examplesJson: string; // JSON {en,id}[] — 3–5 contoh
}) {
  await db
    .insert(exploreItems)
    .values({
      category: row.category,
      text: row.text,
      type: row.type,
      register: row.register,
      meaningId: row.meaningId,
      useWhenId: row.useWhenId,
      examplesJson: row.examplesJson,
      hidden: 0,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}

export async function hideExploreItem(id: number) {
  await db.update(exploreItems).set({ hidden: 1 }).where(eq(exploreItems.id, id));
}

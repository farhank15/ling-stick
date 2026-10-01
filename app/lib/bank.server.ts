import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/lib/db/client.server";
import { cards, examples, items, wordbank } from "~/lib/db/schema";
import { applyRating } from "~/lib/fsrs.server";
import { env } from "~/lib/env.server";
import { normalizeText } from "~/lib/utils.shared";

/** Bank Kata — BLUEPRINT §3 (katalog kosakata per level CEFR, koleksi selalu bertambah). */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR_LEVELS)[number];

export type BankExample = { en: string; id: string };

export type BankEntry = {
  id: number;
  text: string;
  type: string;
  register: string;
  cefr: Cefr;
  meaningId: string;
  useWhenId: string | null;
  examples: BankExample[];
  status: "new" | "learning" | "known";
  itemId: number | null;
};

const CEFR_LABEL: Record<Cefr, string> = {
  A1: "Pemula",
  A2: "Dasar",
  B1: "Menengah",
  B2: "Menengah atas",
  C1: "Mahir",
  C2: "Near-native",
};

export function cefrLabel(level: string): string {
  return CEFR_LABEL[level as Cefr] ?? level;
}

function parseRow(r: typeof wordbank.$inferSelect): BankEntry {
  let examples: BankExample[] = [];
  try {
    const parsed = JSON.parse(r.examplesJson) as BankExample[];
    if (Array.isArray(parsed)) examples = parsed;
  } catch {
    /* examples rusak → biarkan kosong */
  }
  return {
    id: r.id,
    text: r.text,
    type: r.type,
    register: r.register,
    cefr: r.cefr as Cefr,
    meaningId: r.meaningId,
    useWhenId: r.useWhenId,
    examples,
    status: r.status as BankEntry["status"],
    itemId: r.itemId,
  };
}

export function isCefr(v: string | null | undefined): v is Cefr {
  return !!v && (CEFR_LEVELS as readonly string[]).includes(v);
}

/** List entri bank; filter level & status. Contoh di-prefetch 1 query (anti N+1). */
export async function listBank(filter: { cefr?: string; status?: string } = {}) {
  const conds = [];
  if (isCefr(filter.cefr)) conds.push(eq(wordbank.cefr, filter.cefr));
  if (filter.status && ["new", "learning", "known"].includes(filter.status)) {
    conds.push(eq(wordbank.status, filter.status));
  }
  const rows = await db
    .select()
    .from(wordbank)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`CASE ${wordbank.cefr} WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3 WHEN 'B2' THEN 4 WHEN 'C1' THEN 5 ELSE 6 END`, wordbank.id)
    .limit(600);
  return rows.map(parseRow);
}

/** Badge count per level CEFR + per status — 1 query GROUP BY. */
export async function getBankStats() {
  const perLevel = await db
    .select({ cefr: wordbank.cefr, total: sql<number>`count(*)` })
    .from(wordbank)
    .groupBy(wordbank.cefr);
  const perStatus = await db
    .select({ status: wordbank.status, total: sql<number>`count(*)` })
    .from(wordbank)
    .groupBy(wordbank.status);
  const byLevel = Object.fromEntries(perLevel.map((r) => [r.cefr, Number(r.total)])) as Record<string, number>;
  const byStatus = Object.fromEntries(perStatus.map((r) => [r.status, Number(r.total)])) as Record<string, number>;
  return {
    byLevel,
    byStatus,
    total: Object.values(byLevel).reduce((a, b) => a + b, 0),
    learning: byStatus.learning ?? 0,
    known: byStatus.known ?? 0,
  };
}

/** Tandai "mau dipelajari": kirim ke Library + bikin kartu FSRS (jalan mulai sekarang). */
export async function startLearning(bankId: number) {
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) throw new Error("Entri tidak ada");
  if (entry.status === "learning") return entry.itemId;
  if (entry.status === "known") {
    // Sudah tahu → tetap boleh dipelajari lagi.
    await db.update(items).set({ status: "learning" }).where(eq(items.id, entry.itemId!));
    await db.update(wordbank).set({ status: "learning" }).where(eq(wordbank.id, bankId));
    return entry.itemId;
  }

  const norm = normalizeText(entry.text);
  const [existing] = await db.select().from(items).where(eq(items.textNorm, norm)).limit(1);
  let itemId: number;
  if (existing) {
    itemId = existing.id;
    await db.update(items).set({ status: "learning" }).where(eq(items.id, itemId));
  } else {
    const exs = (JSON.parse(entry.examplesJson || "[]") as BankExample[]).slice(0, 3);
    const [created] = await db
      .insert(items)
      .values({
        text: entry.text,
        textNorm: norm,
        type: entry.type,
        register: entry.register,
        meaningId: entry.meaningId,
        notesId: entry.useWhenId ? `Dipakai saat: ${entry.useWhenId}` : null,
        source: `Bank Kata (${entry.cefr})`,
        status: "learning",
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      itemId = created.id;
    } else {
      const [again] = await db.select().from(items).where(eq(items.textNorm, norm)).limit(1);
      if (!again) throw new Error("Gagal impor kata");
      itemId = again.id;
    }
    if (exs.length) {
      await db
        .insert(examples)
        .values(
          exs.map((e) => ({
            itemId,
            register: "neutral",
            en: e.en,
            idText: e.id,
          })),
        )
        .onConflictDoNothing();
    }
  }

  // Kartu FSRS: bikin kalau belum ada (due = sekarang → langsung masuk latihan).
  const [card] = await db.select().from(cards).where(eq(cards.itemId, itemId)).limit(1);
  if (!card) {
    const now = Date.now();
    await db.insert(cards).values({ itemId, due: now, reps: 0, lapses: 0, state: 0, learningSteps: 0 });
  }
  await db.update(wordbank).set({ status: "learning", itemId }).where(eq(wordbank.id, bankId));
  return itemId;
}

/** Tandai "sudah tahu": item di Library ikut di-known supaya keluar dari antrian. */
export async function markKnown(bankId: number) {
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) throw new Error("Entri tidak ada");
  await db.update(wordbank).set({ status: "known" }).where(eq(wordbank.id, bankId));
  if (entry.itemId) {
    await db.update(items).set({ status: "known" }).where(eq(items.id, entry.itemId));
  }
}

/** Undo ke status awal. */
export async function resetStatus(bankId: number) {
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) throw new Error("Entri tidak ada");
  await db.update(wordbank).set({ status: "new" }).where(eq(wordbank.id, bankId));
  if (entry.itemId) {
    await db.update(items).set({ status: "learning" }).where(eq(items.id, entry.itemId));
  }
}

/* ── Generate kata baru via LLM ─────────────────────────────── */

export type GenOptions = { level: Cefr; count: number; topic?: string };

export async function generateBankWords(opts: GenOptions): Promise<{ added: number; skipped: number }> {
  const { chatJson } = await import("~/lib/llm.server");
  const { bankOutputSchema } = await import("~/lib/schemas");
  const { BANK_SYSTEM } = await import("~/lib/prompts");

  const topic = opts.topic?.trim();
  const topicLine = topic
    ? `Theme: "${topic}" — all words must clearly relate to this theme.`
    : "No theme: pick words an Indonesian adult learner at this level should know next.";
  const user = `Generate exactly ${opts.count} English words or phrases of CEFR level ${opts.level}.\n${topicLine}\nAvoid these words that are already in the bank:\n${await existingWordsForPrompt(opts.level)}\n\nJSON shape:\n{ "words": [{ "text": string, "type": "word"|"phrasal_verb"|"idiom"|"collocation"|"slang", "register": "formal"|"neutral"|"informal"|"slang", "meaning_id": string, "use_when_id": string, "examples": [{ "en": string, "id": string }] }] }`;

  const { data } = await chatJson(BANK_SYSTEM, user, bankOutputSchema, "bank:v1", user);
  return await insertGenerated(opts.level, data.words, topic ? `bank:${topic}` : "bank");
}

async function existingWordsForPrompt(level: Cefr): Promise<string> {
  const rows = await db
    .select({ text: wordbank.text })
    .from(wordbank)
    .where(eq(wordbank.cefr, level))
    .limit(300);
  return rows.length ? rows.map((r) => r.text.toLowerCase()).join(", ") : "(none)";
}

/** Simpan hasil generate: skip duplikat (text_norm unik). */
async function insertGenerated(
  level: Cefr,
  words: { text: string; type?: string; register?: string; meaning_id: string; use_when_id?: string; examples?: BankExample[] }[],
  source: string,
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const w of words) {
    const text = w.text.trim();
    if (!text || !w.meaning_id) continue;
    const norm = normalizeText(text);
    const [dup] = await db.select({ id: wordbank.id }).from(wordbank).where(eq(wordbank.textNorm, norm)).limit(1);
    if (dup) {
      skipped++;
      continue;
    }
    await db.insert(wordbank).values({
      text,
      textNorm: norm,
      type: w.type || "word",
      register: w.register || "neutral",
      cefr: level,
      meaningId: w.meaning_id,
      useWhenId: w.use_when_id || null,
      examplesJson: JSON.stringify((w.examples ?? []).slice(0, 4)),
      status: "new",
      source,
      createdAt: Date.now(),
    });
    added++;
  }
  return { added, skipped };
}

/** Sinkronkan status bank dari status item Library (mis. item di-known dari quiz). */
export async function syncBankFromItems() {
  const rows = await db.select().from(wordbank).where(eq(wordbank.status, "learning"));
  if (!rows.length) return;
  const ids = rows.map((r) => r.itemId).filter((v): v is number => typeof v === "number");
  if (!ids.length) return;
  const itemRows = await db
    .select({ id: items.id, status: items.status })
    .from(items)
    .where(inArray(items.id, ids));
  const map = new Map(itemRows.map((r) => [r.id, r.status]));
  for (const r of rows) {
    if (r.itemId && map.get(r.itemId) === "known") {
      await db.update(wordbank).set({ status: "known" }).where(eq(wordbank.id, r.id));
    }
  }
}

export const DAILY_BANK_SIZE = () => env.DAILY_QUIZ_SIZE;
export const rating = { applyRating };

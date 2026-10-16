import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db/client.server";
import { cards, decks, examples, items } from "./db/schema";
import { normalizeText } from "./items.server";
import { newCardRow } from "./fsrs.server";

/**
 * Decks impor (TSV user) — terpisah dari Library.
 * Item deck = baris `items` biasa (deckId terisi) → FSRS + kuis reuse penuh.
 * Duplikat vs teks yang sudah ada (textNorm UNIQUE) dilewati + dilaporkan.
 * matcha: deck vs library campur = user bingung + data dobel.
 */

export type DeckRow = {
  id: number;
  name: string;
  lang: string;
  level: string | null;
  source: string | null;
  license: string | null;
  count: number;
  skipped: number;
  createdAt: number;
};

export async function listDecks(lang?: string): Promise<DeckRow[]> {
  const rows = await db
    .select()
    .from(decks)
    .where(lang ? eq(decks.lang, lang) : undefined)
    .orderBy(decks.createdAt);
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    lang: d.lang,
    level: d.level,
    source: d.source,
    license: d.license,
    count: d.count,
    skipped: d.skipped,
    createdAt: d.createdAt,
  }));
}

export async function getDeck(deckId: number) {
  const [d] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
  return d ?? null;
}

export type ImportRow = {
  text: string;
  reading?: string;
  meaningId?: string;
  type?: string;
  level?: string;
  extra?: Record<string, string>;
  examples?: { en: string; id: string; kana?: string }[];
};

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

export async function importDeck(
  meta: { name: string; lang: string; level?: string; source?: string; license?: string },
  rows: ImportRow[],
): Promise<{ deckId: number; imported: number; skipped: number }> {
  const name = meta.name.trim().slice(0, 80);
  if (!name) throw new Error("Nama deck wajib");
  if (rows.length === 0) throw new Error("Tidak ada baris");
  if (rows.length > 10_000) throw new Error("Maks 10.000 baris per deck");
  const lang = meta.lang === "en" ? "en" : "ja";

  const [deck] = await db
    .insert(decks)
    .values({
      name,
      lang,
      level: meta.level?.trim().slice(0, 10) || null,
      source: meta.source?.trim().slice(0, 200) || null,
      license: meta.license?.trim().slice(0, 500) || null,
      count: 0,
      skipped: 0,
      createdAt: Date.now(),
    })
    .returning();
  if (!deck) throw new Error("Gagal buat deck");

  let imported = 0;
  let skipped = 0;
  const seen = new Set<string>();
  // Batch 200 baris per transaksi biar impor 10k baris tak N+1.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await db.transaction(async (tx) => {
      for (const r of chunk) {
        const text = stripHtml(r.text ?? "");
        if (!text) {
          skipped++;
          continue;
        }
        const norm = normalizeText(text);
        if (seen.has(norm)) {
          skipped++;
          continue;
        }
        seen.add(norm);
        const meaning = stripHtml(r.meaningId ?? "");
        const [item] = await tx
          .insert(items)
          .values({
            text,
            textNorm: norm,
            type: (r.type ?? "word").trim().slice(0, 20) || "word",
            register: "neutral",
            meaningId: meaning || null,
            source: `deck:${deck.id}`,
            confidence: "medium",
            status: "learning",
            hideMeaning: 0,
            lang,
            reading: stripHtml(r.reading ?? "") || null,
            createdAt: Date.now(),
            deckId: deck.id,
            extraJson: r.extra && Object.keys(r.extra).length > 0 ? JSON.stringify(r.extra) : null,
            needsId: meaning ? 0 : 1,
          })
          .onConflictDoNothing()
          .returning({ id: items.id });
        if (!item) {
          skipped++;
          continue;
        }
        const card = newCardRow(item.id);
        await tx.insert(cards).values(card).onConflictDoNothing();
        // Contoh kalimat (kalau ada) — ikut terhapus via cascade saat deck dihapus.
        if (r.examples && r.examples.length > 0) {
          await tx.insert(examples).values(
            r.examples.slice(0, 3).map((e) => ({
              itemId: item.id,
              register: "neutral",
              en: stripHtml(e.en).slice(0, 500) || "—",
              idText: stripHtml(e.id).slice(0, 500) || "—",
              isContext: 0,
              kana: e.kana ? stripHtml(e.kana).slice(0, 500) : null,
            })),
          );
        }
        imported++;
      }
    });
  }
  await db.update(decks).set({ count: imported, skipped }).where(eq(decks.id, deck.id));
  return { deckId: deck.id, imported, skipped };
}

/** Hapus deck + semua item + kartu + contoh (cascade). */
export async function deleteDeck(deckId: number): Promise<number> {
  const itemIds = (
    await db.select({ id: items.id }).from(items).where(eq(items.deckId, deckId))
  ).map((r) => r.id);
  if (itemIds.length > 0) {
    // Hapus per chunk biar placeholder SQLite tak jebol.
    for (let i = 0; i < itemIds.length; i += 500) {
      const chunk = itemIds.slice(i, i + 500);
      await db.delete(examples).where(inArray(examples.itemId, chunk));
      await db.delete(cards).where(inArray(cards.itemId, chunk));
      await db.delete(items).where(inArray(items.id, chunk));
    }
  }
  await db.delete(decks).where(eq(decks.id, deckId));
  return itemIds.length;
}

/** Item ID satu deck — untuk scope kuis/flashcard via filter itemIds yang sudah ada. */
export async function deckItemIds(deckId: number): Promise<number[]> {
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.deckId, deckId), eq(items.status, "learning")));
  return rows.map((r) => r.id);
}

/** Hitung needs-ID per deck (arti kosong). */
export async function deckNeedsId(deckId: number): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(items)
    .where(and(eq(items.deckId, deckId), eq(items.needsId, 1)));
  return Number(row?.c ?? 0);
}

import { db } from "~/lib/db/client.server";
import { readings } from "~/lib/db/schema";
import { getTargetLang } from "~/lib/lang.server";
import { chatJson } from "~/lib/llm.server";
import { readingOutputSchema } from "~/lib/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ReadingBody, ReadingLevel, ReadingRow } from "./reading.shared";
import { isReadingLevelFor, readingLevels } from "./reading.shared";

// Re-export (tipe aman buat siapa pun yang konsisten import dari .server di server code).
export { READING_LEVELS, isReadingLevel, isReadingLevelFor, readingLevels } from "./reading.shared";
export type { ReadingLevel, ReadingBody, ReadingRow, ReadingParagraph } from "./reading.shared";

const TOPICS_JA: Record<string, string[]> = {
  N5: ["perkenalan diri", "makanan favorit", "hobi sehari-hari", "hujan di Tokyo", "kucing di taman"],
  N4: ["liburan ke Kyoto", "kerja part-time", "olahraga di musim panas", "surat ke teman", "restoran ramen"],
  N3: ["berita teknologi", "adat minuman teh", "perjalanan naik kereta", "cerita masa kecil", "festival musim panas"],
  N2: ["berita ekonomi", "persamaan budaya", "lingkungan & daur ulang", "kehidupan kerja di Jepang", "cerpen singkat"],
  N1: ["opini media", "cerpen sastra", "berita politik", "esai pendidikan", "tradisi vs modernisasi"],
};

const TOPICS_EN: Record<string, string[]> = {
  A1: ["my family", "my favorite food", "a day at school", "my cat", "the weather today"],
  A2: ["a trip to the beach", "my first job", "weekend plans", "shopping online", "a birthday party"],
  B1: ["social media habits", "learning a language", "public transport", "a childhood memory", "working from home"],
  B2: ["remote work debate", "environment & recycling", "travel culture", "technology in education", "a short story"],
  C1: ["media & opinion", "economics news", "urbanization", "an essay on education", "tradition vs modernity"],
  C2: ["literary short story", "political commentary", "philosophy of technology", "cultural criticism", "satire"],
};

function pickTopic(lang: string, level: ReadingLevel, variant: number): string {
  const pool = lang === "ja" ? TOPICS_JA : TOPICS_EN;
  const list = pool[level] ?? pool[Object.keys(pool)[0]!]!;
  return list[Math.abs(variant) % list.length]!;
}

/** Generate bacaan baru — lang-aware: JA (JLPT, kana furigana) / EN (CEFR, teks + arti). */
export async function generateReading(
  lang: string,
  level: ReadingLevel,
  variant = 0,
): Promise<{ id: number; title: string }> {
  const topic = pickTopic(lang, level, variant);

  const system =
    lang === "ja"
      ? `You write short reading passages in natural Japanese for an Indonesian adult learner at JLPT ${level}.
Return ONLY valid JSON. No prose, no markdown fences.
Rules:
- 3 to 4 short paragraphs, ${level === "N5" ? "2-3" : "3-4"} sentences each. Grammar & vocabulary must genuinely match level ${level}.
- Every paragraph: "text" = Japanese as normally written (kanji where natural), "kana" = the FULL kana reading of that paragraph (furigana source — REQUIRED, must cover every kanji), "romaji" = hepburn lowercase of the kana, "arti" = natural casual Indonesian translation of the whole paragraph.
- "title" = Japanese title, "title_en" = Indonesian translation of the title.
- "vocab" = 5-7 key words: "text" (as written), "kana", "meaning" in casual Indonesian.
- Everything except Japanese text/kana/romaji MUST be casual Indonesian.

JSON shape:
{ "title": string, "title_en": string, "paragraphs": [{ "text": string, "kana": string, "romaji": string, "arti": string }], "vocab": [{ "text": string, "kana": string, "meaning": string }] }`
      : `You write short reading passages in natural English for an Indonesian adult learner at CEFR level ${level}.
Return ONLY valid JSON. No prose, no markdown fences.
Rules:
- 3 to 4 short paragraphs, ${level === "A1" || level === "A2" ? "2-3" : "3-4"} sentences each. Grammar & vocabulary must genuinely match level ${level}.
- Every paragraph: "text" = the English paragraph, "kana" = "" (not used for English), "arti" = natural casual Indonesian translation of the whole paragraph. "romaji" is omitted.
- "title" = English title, "title_en" = Indonesian translation of the title.
- "vocab" = 5-7 key words: "text", "meaning" in casual Indonesian ("kana" omitted).
- Everything except the English text MUST be casual Indonesian.

JSON shape:
{ "title": string, "title_en": string, "paragraphs": [{ "text": string, "kana": string, "arti": string }], "vocab": [{ "text": string, "meaning": string }] }`;

  const { data } = await chatJson(
    system,
    `Topic: "${topic}" (variasi ke-${variant + 1}, jangan berulang persis). Buat bacaan level ${level}.`,
    readingOutputSchema,
    `reading:${lang}:v1`,
    `${lang}|${level}|${topic}|${variant}`,
  );

  const body: ReadingBody = {
    paragraphs: data.paragraphs,
    vocab: data.vocab ?? [],
  };
  const wordCount = data.paragraphs.reduce(
    (n, p) => n + (p.text.match(/[\u3040-\u30ff\u4e00-\u9faf]+|[a-zA-Z']+/g)?.length ?? 0),
    0,
  );
  const [row] = await db
    .insert(readings)
    .values({
      title: data.title,
      titleEn: data.title_en || null,
      level,
      topic,
      lang,
      body: JSON.stringify(body),
      wordCount,
      readCount: 0,
      source: "llm",
      createdAt: Date.now(),
    })
    .returning({ id: readings.id });
  return { id: row!.id, title: data.title };
}

export async function listReadings(lang: string, level?: ReadingLevel): Promise<ReadingRow[]> {
  const conds = [eq(readings.lang, lang)];
  if (level) conds.push(eq(readings.level, level));
  const rows = await db
    .select({
      id: readings.id,
      title: readings.title,
      titleEn: readings.titleEn,
      level: readings.level,
      topic: readings.topic,
      wordCount: readings.wordCount,
      readCount: readings.readCount,
      createdAt: readings.createdAt,
    })
    .from(readings)
    .where(and(...conds))
    .orderBy(desc(readings.createdAt))
    .limit(60);
  return rows;
}

/**
 * Graded reader path: bacaan berikutnya yang belum dibaca (readCount=0),
 * urut level termudah dulu (N5→N1 / A1→C2), lalu paling lama. Kalau semua
 * sudah dibaca, kembalikan bacaan terbaru biar tombol tetap berguna.
 */
export async function nextReading(lang: string): Promise<ReadingRow | null> {
  const order =
    lang === "ja"
      ? sql`CASE ${readings.level} WHEN 'N5' THEN 1 WHEN 'N4' THEN 2 WHEN 'N3' THEN 3 WHEN 'N2' THEN 4 ELSE 5 END`
      : sql`CASE ${readings.level} WHEN 'A1' THEN 1 WHEN 'A2' THEN 2 WHEN 'B1' THEN 3 WHEN 'B2' THEN 4 WHEN 'C1' THEN 5 ELSE 6 END`;
  const base = {
    id: readings.id,
    title: readings.title,
    titleEn: readings.titleEn,
    level: readings.level,
    topic: readings.topic,
    wordCount: readings.wordCount,
    readCount: readings.readCount,
    createdAt: readings.createdAt,
  };
  const [fresh] = await db
    .select(base)
    .from(readings)
    .where(and(eq(readings.lang, lang), eq(readings.readCount, 0)))
    .orderBy(order, readings.createdAt)
    .limit(1);
  if (fresh) return fresh;
  const [latest] = await db
    .select(base)
    .from(readings)
    .where(eq(readings.lang, lang))
    .orderBy(desc(readings.createdAt))
    .limit(1);
  return latest ?? null;
}

export async function getReading(
  lang: string,
  id: number,
): Promise<(ReadingRow & { body: ReadingBody }) | null> {
  const [row] = await db.select().from(readings).where(eq(readings.id, id)).limit(1);
  if (!row || row.lang !== lang) return null;
  let body: ReadingBody = { paragraphs: [], vocab: [] };
  try {
    body = JSON.parse(row.body) as ReadingBody;
  } catch {
    /* body rusak → kosong */
  }
  return { ...row, body };
}

export async function bumpReadCount(id: number): Promise<void> {
  await db
    .update(readings)
    .set({ readCount: sql`${readings.readCount} + 1` })
    .where(eq(readings.id, id));
}

/** Hapus bacaan permanen (tombol delete di list). */
export async function deleteReading(id: number): Promise<void> {
  await db.delete(readings).where(eq(readings.id, id));
}

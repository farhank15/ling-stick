import { db } from "~/lib/db/client.server";
import { readings } from "~/lib/db/schema";
import { chatJson } from "~/lib/llm.server";
import { readingOutputSchema } from "~/lib/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
// Konstanta/tipe client-safe tinggal di reading.shared — jangan dire-export dari
// sini (route file yang import .server di module level bikin build gagal).
import type { ReadingBody, ReadingLevel, ReadingRow } from "./reading.shared";
import { isReadingLevel } from "./reading.shared";

// Re-export (tipe aman buat siapa pun yang konsisten import dari .server di server code).
export { READING_LEVELS, isReadingLevel } from "./reading.shared";
export type { ReadingLevel, ReadingBody, ReadingRow, ReadingParagraph } from "./reading.shared";

const TOPICS_BY_LEVEL: Record<ReadingLevel, string[]> = {
  N5: ["perkenalan diri", "makanan favorit", "hobi sehari-hari", "hujan di Tokyo", "kucing di taman"],
  N4: ["liburan ke Kyoto", "kerja part-time", "olahraga di musim panas", "surat ke teman", "restoran ramen"],
  N3: ["berita teknologi", "adat minuman teh", "perjalanan naik kereta", "cerita masa kecil", "festival musim panas"],
  N2: ["berita ekonomi", "persamaan budaya", "lingkungan & daur ulang", "kehidupan kerja di Jepang", "cerpen singkat"],
  N1: ["opini media", "cerpen sastra", "berita politik", "esai pendidikan", "tradisi vs modernisasi"],
};

function pickTopic(level: ReadingLevel, variant: number): string {
  const list = TOPICS_BY_LEVEL[level];
  return list[Math.abs(variant) % list.length]!;
}

/** Generate bacaan baru per level — tiap varian topik beda; body berisi kana penuh per paragraf. */
export async function generateReading(
  level: ReadingLevel,
  variant = 0,
): Promise<{ id: number; title: string }> {
  const topic = pickTopic(level, variant);
  const { data } = await chatJson(
    `You write short reading passages in natural Japanese for an Indonesian adult learner at JLPT ${level}.
Return ONLY valid JSON. No prose, no markdown fences.
Rules:
- 3 to 4 short paragraphs, ${level === "N5" ? "2-3" : "3-4"} sentences each. Grammar & vocabulary must genuinely match level ${level}.
- Every paragraph: "text" = Japanese as normally written (kanji where natural), "kana" = the FULL kana reading of that paragraph (furigana source — REQUIRED, must cover every kanji), "romaji" = hepburn lowercase of the kana.
- "title" = Japanese title, "title_en" = Indonesian translation of the title.
- "vocab" = 5-7 key words: "text" (as written), "kana", "meaning" in casual Indonesian.
- Everything except Japanese text/kana/romaji MUST be casual Indonesian.

JSON shape:
{ "title": string, "title_en": string, "paragraphs": [{ "text": string, "kana": string, "romaji": string }], "vocab": [{ "text": string, "kana": string, "meaning": string }] }`,
    `Topic: "${topic}" (variasi ke-${variant + 1}, jangan berulang persis). Buat bacaan level ${level}.`,
    readingOutputSchema,
    `reading:ja:v1`,
    `${level}|${topic}|${variant}`,
  );

  const body: ReadingBody = {
    paragraphs: data.paragraphs,
    vocab: data.vocab ?? [],
  };
  const wordCount = data.paragraphs.reduce(
    (n, p) => n + (p.text.match(/[\u3040-\u30ff\u4e00-\u9faf]+|[a-zA-Z]+/g)?.length ?? 0),
    0,
  );
  const [row] = await db
    .insert(readings)
    .values({
      title: data.title,
      titleEn: data.title_en || null,
      level,
      topic,
      lang: "ja",
      body: JSON.stringify(body),
      wordCount,
      readCount: 0,
      source: "llm",
      createdAt: Date.now(),
    })
    .returning({ id: readings.id });
  return { id: row!.id, title: data.title };
}

export async function listReadings(level?: ReadingLevel): Promise<ReadingRow[]> {
  const conds = [eq(readings.lang, "ja")];
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

export async function getReading(id: number): Promise<(ReadingRow & { body: ReadingBody }) | null> {
  const [row] = await db.select().from(readings).where(eq(readings.id, id)).limit(1);
  if (!row) return null;
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

/**
 * Konstanta & tipe Reading yang aman buat client (tanpa import db/llm).
 * reading.server.ts me-re-export dari sini — route file WAJIB import dari
 * modul shared ini, bukan dari .server (RRv7: import server di level module
 * dari route file = gagal build "Server-only module referenced by client").
 */

export const READING_LEVELS_JA = ["N5", "N4", "N3", "N2", "N1"] as const;
export const READING_LEVELS_EN = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const READING_LEVELS = READING_LEVELS_JA; // alias lama (JA)

export type ReadingLevel = (typeof READING_LEVELS_JA)[number] | (typeof READING_LEVELS_EN)[number];

export function readingLevels(lang: string): readonly string[] {
  return lang === "ja" ? READING_LEVELS_JA : READING_LEVELS_EN;
}

export function isReadingLevel(v: string | null | undefined): v is ReadingLevel {
  return (
    !!v &&
    ((READING_LEVELS_JA as readonly string[]).includes(v) ||
      (READING_LEVELS_EN as readonly string[]).includes(v))
  );
}

export function isReadingLevelFor(lang: string, v: string | null | undefined): v is ReadingLevel {
  return !!v && readingLevels(lang).includes(v);
}

export type ReadingParagraph = { text: string; kana: string; romaji?: string; arti?: string };
export type ReadingBody = {
  paragraphs: ReadingParagraph[];
  vocab?: { text: string; kana?: string; meaning: string }[];
};

export type ReadingRow = {
  id: number;
  title: string;
  titleEn: string | null;
  level: string;
  topic: string;
  wordCount: number;
  readCount: number;
  createdAt: number;
};

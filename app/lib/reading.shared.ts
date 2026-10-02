/**
 * Konstanta & tipe Reading yang aman buat client (tanpa import db/llm).
 * reading.server.ts me-re-export dari sini — route file WAJIB import dari
 * modul shared ini, bukan dari .server (RRv7: import server di level module
 * dari route file = gagal build "Server-only module referenced by client").
 */

export const READING_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];

export function isReadingLevel(v: string | null | undefined): v is ReadingLevel {
  return !!v && (READING_LEVELS as readonly string[]).includes(v);
}

export type ReadingParagraph = { text: string; kana: string; romaji?: string };
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

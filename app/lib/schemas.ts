import { z } from "zod";

/** Kontrak output LLM — BLUEPRINT §8. Divalidasi Zod; retry 1x jika gagal. */

export const exampleSchema = z.object({
  register: z.enum(["casual", "neutral", "formal"]),
  en: z.string().min(1),
  id: z.string().min(1),
  romaji: z.string().catch("").optional(), // JA: romaji kalimat
});

export const senseSchema = z.object({
  label: z.string().min(1),
  examples: z.array(exampleSchema).max(6).default([]),
});

export const alternativeSchema = z.object({
  text: z.string().min(1),
  register: z.string().optional().nullable(),
  nuance_id: z.string().optional().nullable(),
  use_when_id: z.string().optional().nullable(),
});

export const generateOutputSchema = z.object({
  headword: z.string().min(1),
  reading: z.string().optional().nullable().default(""), // JA: kana
  romaji: z.string().optional().nullable().default(""), // JA: hepburn
  type: z.enum([
    "word",
    "phrasal_verb",
    "idiom",
    "collocation",
    "slang",
    "reaction",
    "sentence",
    "particle",
  ]),
  register: z.enum(["formal", "neutral", "informal", "slang"]),
  meaning_id: z.string().min(1),
  senses: z.array(senseSchema).min(1).max(4),
  unnatural_registers: z.array(z.enum(["casual", "neutral", "formal"])).default([]),
  alternatives: z.array(alternativeSchema).max(8).default([]),
  notes_id: z.string().optional().nullable().default(""),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export type GenerateOutput = z.infer<typeof generateOutputSchema>;

export const extractOutputSchema = z.object({
  expressions: z
    .array(
      z.object({
        text: z.string().min(1),
        type: z.string().default("word"),
        register: z.string().default("neutral"),
        meaning_id: z.string().min(1),
        sentence_en: z.string().min(1),
      }),
    )
    .max(15),
});

export type ExtractOutput = z.infer<typeof extractOutputSchema>;

export const checkSentenceOutputSchema = z.object({
  correct: z.boolean(),
  better: z.string().default(""),
  explanation_id: z.string().default(""),
  register_note_id: z.string().default(""),
});

export type CheckSentenceOutput = z.infer<typeof checkSentenceOutputSchema>;

export const bankWordSchema = z.object({
  text: z.string().min(1).max(60),
  reading: z.string().catch("").optional(), // JA: kana
  romaji: z.string().catch("").optional(), // JA: hepburn
  type: z
    .enum([
      "word",
      "phrasal_verb",
      "idiom",
      "collocation",
      "slang",
      "particle",
      "expression",
      "kana",
    ])
    .catch("word"),
  register: z
    .enum(["formal", "neutral", "informal", "slang"])
    .catch("neutral"),
  meaning_id: z.string().min(1),
  use_when_id: z.string().catch("").optional(),
  examples: z
    .array(
      z.object({
        en: z.string().min(1),
        id: z.string().min(1),
        romaji: z.string().catch("").optional(),
        kana: z.string().catch("").optional(), // JA: bacaan penuh kalimat — sumber furigana per kanji
      }),
    )
    .max(4)
    .catch([]),
});

export const bankOutputSchema = z.object({
  words: z.array(bankWordSchema).min(1).max(40),
});

export type BankOutput = z.infer<typeof bankOutputSchema>;

/** Bacaan Jepang (Latihan Reading): paragraf + kana penuh (furigana) + romaji + vocab. */
export const readingOutputSchema = z.object({
  title: z.string().min(1),
  title_en: z.string().catch("").optional(),
  paragraphs: z
    .array(
      z.object({
        text: z.string().min(1),
        kana: z.string().min(1), // bacaan penuh — sumber furigana per kanji
        romaji: z.string().catch("").optional(),
      }),
    )
    .min(1)
    .max(8),
  vocab: z
    .array(
      z.object({
        text: z.string().min(1),
        kana: z.string().catch("").optional(),
        meaning: z.string().min(1),
      }),
    )
    .max(10)
    .catch([]),
});

export type ReadingOutput = z.infer<typeof readingOutputSchema>;

export const exploreOutputSchema = z.object({
  expressions: z
    .array(
      z.object({
        text: z.string().min(1),
        reading: z.string().catch("").optional(), // JA: kana
        romaji: z.string().catch("").optional(), // JA: hepburn
        type: z.string().default("idiom"),
        register: z.string().default("informal"),
        meaning_id: z.string().min(1),
        use_when_id: z.string().default(""),
        examples: z
          .array(
            z.object({
              en: z.string().min(1),
              id: z.string().min(1),
              kana: z.string().catch("").optional(), // JA: bacaan penuh kalimat — sumber furigana
              romaji: z.string().catch("").optional(),
            }),
          )
          .min(1)
          .max(5),
      }),
    )
    .min(1)
    .max(20),
});

export type ExploreOutput = z.infer<typeof exploreOutputSchema>;

export const chatOutputSchema = z.object({
  reply: z.string().min(1),
  suggestions: z
    .array(
      z.object({
        text: z.string().min(1),
        reading: z.string().catch("").optional(), // JA: kana
        meaning_id: z.string().min(1),
        examples: z
          .array(z.object({ en: z.string().min(1), id: z.string().min(1) }))
          .max(3)
          .default([]),
      }),
    )
    .max(3)
    .default([]),
});

export type ChatOutput = z.infer<typeof chatOutputSchema>;

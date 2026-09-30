import { z } from "zod";

/** Kontrak output LLM — BLUEPRINT §8. Divalidasi Zod; retry 1x jika gagal. */

export const exampleSchema = z.object({
  register: z.enum(["casual", "neutral", "formal"]),
  en: z.string().min(1),
  id: z.string().min(1),
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
  type: z.enum([
    "word",
    "phrasal_verb",
    "idiom",
    "collocation",
    "slang",
    "reaction",
    "sentence",
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

export const exploreOutputSchema = z.object({
  expressions: z
    .array(
      z.object({
        text: z.string().min(1),
        type: z.string().default("idiom"),
        register: z.string().default("informal"),
        meaning_id: z.string().min(1),
        use_when_id: z.string().default(""),
        examples: z
          .array(z.object({ en: z.string().min(1), id: z.string().min(1) }))
          .min(3)
          .max(5),
      }),
    )
    .min(1)
    .max(20),
});

export type ExploreOutput = z.infer<typeof exploreOutputSchema>;

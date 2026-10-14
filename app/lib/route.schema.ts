import { z } from "zod";

/**
 * Skema materi Rute JA (agent-agnostic).
 * Satu step = file Markdown + frontmatter di content/route/{n5,n4,n3}/*.md,
 * divalidasi `npm run route:validate` sebelum merge. Gaya defensif mengikuti
 * schemas.ts: .catch() agar LLM gagal parsial tidak meledak — tapi untuk
 * konten kurikulum, validate BERSIKERAS (strict) karena ini materi belajar.
 */

const exampleSchema = z.object({
  jp: z.string().min(1),
  kana: z.string().min(1),
  romaji: z.string().default(""),
  arti_id: z.string().min(1),
  pola_ref: z.string().default(""),
});

const clozeItemSchema = z.object({
  front: z.string().min(1),
  answer: z.string().min(1),
  distractors: z.array(z.string().min(1)).min(2).max(4),
  kana_hint: z.string().default(""),
  explain_id: z.string().default(""),
});

const refSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
});

export const routeStepSchema = z.object({
  step_id: z.string().regex(/^ja-n[543]-\d{3}$/),
  level: z.enum(["N5", "N4", "N3"]),
  segment: z.number().int().min(1).max(30),
  order: z.number().int().min(1).max(300),
  title_id: z.string().min(1).max(120),
  pattern: z.string().min(1).max(120),
  objectives: z.array(z.string().min(1)).min(1).max(3),
  explanation_id: z.string().min(20).max(2000),
  formation: z.string().default(""),
  examples: z.array(exampleSchema).min(3).max(8),
  pitfalls_id: z.array(z.string().min(1)).default([]),
  cloze_items: z.array(clozeItemSchema).min(5).max(12),
  refs: z.array(refSchema).default([]),
  passing: z
    .object({
      min_items: z.number().int().min(1).default(8),
      grade_pct: z.number().int().min(50).max(100).default(80),
    })
    .default({ min_items: 8, grade_pct: 80 }),
  est_minutes: z.number().int().min(3).max(30).default(10),
  version: z.number().int().min(1).default(1),
});

export type RouteStep = z.infer<typeof routeStepSchema>;

/** Checkpoint exam per segmen — digenerate dari cloze_items 10 step segmen itu. */
export const routeExamSchema = z.object({
  exam_id: z.string().regex(/^ja-n[543]-exam-\d{2}$/),
  level: z.enum(["N5", "N4", "N3"]),
  segment: z.number().int().min(1).max(30),
  title_id: z.string().min(1).max(120),
  step_ids: z.array(z.string()).min(2).max(10),
  item_count: z.number().int().min(5).max(20).default(15),
  grade_pct: z.number().int().min(50).max(100).default(80),
});

export type RouteExam = z.infer<typeof routeExamSchema>;

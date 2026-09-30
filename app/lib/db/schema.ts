import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Skema mengikuti BLUEPRINT.md §6 (SQLite), plus:
 * - `sessions`  : sesi login (cookie) disimpan di SQLite
 * - `llm_usage` : penghitung panggilan LLM harian (DAILY_LLM_CALL_LIMIT)
 */

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    text: text("text").notNull(),
    textNorm: text("text_norm").notNull(),
    type: text("type").notNull(),
    register: text("register").notNull().default("neutral"),
    meaningId: text("meaning_id"),
    notesId: text("notes_id"),
    source: text("source"),
    confidence: text("confidence").default("medium"),
    status: text("status").notNull().default("learning"),
    hideMeaning: integer("hide_meaning").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("items_text_norm_uq").on(t.textNorm),
    index("items_status_idx").on(t.status),
  ],
);

export const examples = sqliteTable(
  "examples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    senseLabel: text("sense_label"),
    register: text("register").notNull().default("neutral"),
    en: text("en").notNull(),
    idText: text("id_text").notNull(),
    isContext: integer("is_context").notNull().default(0),
  },
  (t) => [index("examples_item_idx").on(t.itemId)],
);

export const alternatives = sqliteTable(
  "alternatives",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    register: text("register"),
    nuanceId: text("nuance_id"),
    useWhenId: text("use_when_id"),
  },
  (t) => [index("alternatives_item_idx").on(t.itemId)],
);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const itemTags = sqliteTable("item_tags", {
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.itemId, t.tagId] })]);

export const cards = sqliteTable("cards", {
  itemId: integer("item_id")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  due: integer("due").notNull(),
  stability: real("stability"),
  difficulty: real("difficulty"),
  elapsedDays: integer("elapsed_days"),
  scheduledDays: integer("scheduled_days"),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  state: integer("state").notNull().default(0), // 0 new, 1 learning, 2 review, 3 relearning
  learningSteps: integer("learning_steps").notNull().default(0),
  lastReview: integer("last_review"),
});

export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").notNull(),
    rating: integer("rating").notNull(), // 1..4 (Again/Hard/Good/Easy)
    mode: text("mode"),
    reviewedAt: integer("reviewed_at").notNull(),
    state: integer("state"),
    due: integer("due"),
  },
  (t) => [index("review_logs_item_idx").on(t.itemId)],
);

export const exploreItems = sqliteTable(
  "explore_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    category: text("category").notNull(),
    text: text("text").notNull(),
    type: text("type"),
    register: text("register"),
    meaningId: text("meaning_id"),
    useWhenId: text("use_when_id"),
    exampleEn: text("example_en"),
    exampleId: text("example_id"),
    hidden: integer("hidden").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("explore_category_text_uq").on(t.category, t.text)],
);

export const llmCache = sqliteTable("llm_cache", {
  key: text("key").primaryKey(),
  response: text("response").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const laraUsage = sqliteTable("lara_usage", {
  month: text("month").primaryKey(), // YYYY-MM
  chars: integer("chars").notNull().default(0),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // token acak
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_expires_idx").on(t.expiresAt)],
);

export const llmUsage = sqliteTable("llm_usage", {
  day: text("day").primaryKey(), // YYYY-MM-DD
  calls: integer("calls").notNull().default(0),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const quizSets = sqliteTable("quiz_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  day: text("day").notNull().unique(), // YYYY-MM-DD
  title: text("title").notNull(),
  questions: text("questions").notNull(), // JSON QuizQuestion[]
  order: text("order_json").notNull(), // JSON number[] urutan soal (bisa bertambah)
  total: integer("total").notNull(),
  done: integer("done").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const quizAnswers = sqliteTable(
  "quiz_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    setId: integer("set_id").notNull(),
    day: text("day").notNull(),
    questionIndex: integer("question_index").notNull(),
    itemId: integer("item_id").notNull(),
    correct: integer("correct").notNull(),
    answeredAt: integer("answered_at").notNull(),
  },
  (t) => [uniqueIndex("quiz_answers_set_idx_uq").on(t.setId, t.questionIndex)],
);

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
    lang: text("lang").notNull().default("en"), // en | ja — bahasa target item
    reading: text("reading"), // JA: kana (+ romaji), tampil redup di bawah kanji
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
    examplesJson: text("examples_json"), // JSON {en,id}[] — 3–5 contoh kalimat
    reading: text("reading"), // JA: kana (romaji) — furigana & romaji di UI
    hidden: integer("hidden").notNull().default(0),
    lang: text("lang").notNull().default("en"), // en | ja
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

export const chatSessions = sqliteTable("chat_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull().default("Obrolan baru"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    suggestionsJson: text("suggestions_json"), // JSON saran kata saat itu
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId)],
);

export const quizSets = sqliteTable(
  "quiz_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    day: text("day").notNull(), // YYYY-MM-DD
    mode: text("mode").notNull().default("daily"), // daily|extra|typing|intens
    lang: text("lang").notNull().default("en"), // en | ja — bahasa target set
    title: text("title").notNull(),
    questions: text("questions").notNull(), // JSON QuizQuestion[]
    order: text("order_json").notNull(), // JSON number[] urutan soal (bisa bertambah)
    total: integer("total").notNull(),
    done: integer("done").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("quiz_sets_day_mode_uq").on(t.day, t.mode)],
);

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

/** Bank Kata: katalog kosakata per level CEFR + status belajar. */
export const wordbank = sqliteTable(
  "wordbank",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    text: text("text").notNull(),
    textNorm: text("text_norm").notNull().unique(),
    type: text("type").notNull().default("word"),
    register: text("register").notNull().default("neutral"),
    cefr: text("cefr").notNull().default("B1"), // A1|A2|B1|B2|C1|C2
    meaningId: text("meaning_id").notNull(),
    useWhenId: text("use_when_id"),
    examplesJson: text("examples_json").notNull().default("[]"),
    status: text("status").notNull().default("new"), // new|learning|known
    itemId: integer("item_id"),
    source: text("source").notNull().default("seed"),
    lang: text("lang").notNull().default("en"), // en | ja — bahasa target entri
    reading: text("reading"), // JA: kana (+ romaji), ikut ke items saat mulai belajar
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("wordbank_cefr_idx").on(t.cefr), index("wordbank_status_idx").on(t.status)],
);

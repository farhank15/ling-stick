import type Database from "better-sqlite3";

/**
 * DDL lengkap (BLUEPRINT §6 + sessions + llm_usage).
 * Idempotent — aman dipanggil tiap start.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY,
    text          TEXT NOT NULL,
    text_norm     TEXT NOT NULL UNIQUE,
    type          TEXT NOT NULL,
    register      TEXT NOT NULL DEFAULT 'neutral',
    meaning_id    TEXT,
    notes_id      TEXT,
    source        TEXT,
    confidence    TEXT DEFAULT 'medium',
    status        TEXT NOT NULL DEFAULT 'learning',
    hide_meaning  INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS items_status_idx ON items(status);

  CREATE TABLE IF NOT EXISTS examples (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    sense_label TEXT,
    register    TEXT NOT NULL DEFAULT 'neutral',
    en          TEXT NOT NULL,
    id_text     TEXT NOT NULL,
    is_context  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS examples_item_idx ON examples(item_id);

  CREATE TABLE IF NOT EXISTS alternatives (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    register    TEXT,
    nuance_id   TEXT,
    use_when_id TEXT
  );
  CREATE INDEX IF NOT EXISTS alternatives_item_idx ON alternatives(item_id);

  CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS cards (
    item_id        INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    due            INTEGER NOT NULL,
    stability      REAL,
    difficulty     REAL,
    elapsed_days   INTEGER,
    scheduled_days INTEGER,
    reps           INTEGER DEFAULT 0,
    lapses         INTEGER DEFAULT 0,
    state          INTEGER DEFAULT 0,
    learning_steps INTEGER NOT NULL DEFAULT 0,
    last_review    INTEGER
  );
  CREATE INDEX IF NOT EXISTS cards_due_idx ON cards(due);

  CREATE TABLE IF NOT EXISTS review_logs (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER,
    rating      INTEGER,
    mode        TEXT,
    reviewed_at INTEGER,
    state       INTEGER,
    due         INTEGER
  );

  CREATE TABLE IF NOT EXISTS explore_items (
    id           INTEGER PRIMARY KEY,
    category     TEXT NOT NULL,
    text         TEXT NOT NULL,
    type         TEXT,
    register     TEXT,
    meaning_id   TEXT,
    use_when_id  TEXT,
    example_en   TEXT,
    example_id   TEXT,
    hidden       INTEGER DEFAULT 0,
    created_at   INTEGER NOT NULL,
    UNIQUE(category, text)
  );

  CREATE TABLE IF NOT EXISTS llm_cache (
    key        TEXT PRIMARY KEY,
    response   TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lara_usage (
    month TEXT PRIMARY KEY,
    chars INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS llm_usage (
    day   TEXT PRIMARY KEY,
    calls INTEGER NOT NULL DEFAULT 0
  );  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_sets (
    id         INTEGER PRIMARY KEY,
    day        TEXT NOT NULL UNIQUE,
    title      TEXT NOT NULL,
    questions  TEXT NOT NULL,
    order_json TEXT NOT NULL,
    total      INTEGER NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    correct    INTEGER NOT NULL DEFAULT 0,
    completed  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_answers (
    id             INTEGER PRIMARY KEY,
    set_id         INTEGER NOT NULL,
    day            TEXT NOT NULL,
    question_index INTEGER NOT NULL,
    item_id        INTEGER NOT NULL,
    correct        INTEGER NOT NULL,
    answered_at    INTEGER NOT NULL,
    UNIQUE(set_id, question_index)
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    text, meaning_id, content='items', content_rowid='id'
  );

  CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(rowid, text, meaning_id) VALUES (new.id, new.text, new.meaning_id);
  END;
  CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, text, meaning_id)
    VALUES('delete', old.id, old.text, old.meaning_id);
  END;
  CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
    INSERT INTO items_fts(items_fts, rowid, text, meaning_id)
    VALUES('delete', old.id, old.text, old.meaning_id);
    INSERT INTO items_fts(rowid, text, meaning_id) VALUES (new.id, new.text, new.meaning_id);
  END;
  `,
  // Reindex FTS sekali di awal (isi tabel lama bila ada).
  `
  INSERT INTO items_fts(items_fts) VALUES('rebuild');
  `,
];

export function runMigrations(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const migrate = db.transaction(() => {
    for (const ddl of MIGRATIONS) db.exec(ddl);
  });
  migrate();
}

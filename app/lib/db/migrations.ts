import type { Client } from "@libsql/client";
import { SEED_BANK_JP } from "./seed.ja";

/**
 * DDL lengkap (BLUEPRINT §6 + sessions + llm_usage + quiz).
 * Idempotent — aman dijalankan ulang tiap start, juga di Turso remote.
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
    examples_json TEXT,
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
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz_sets (
    id         INTEGER PRIMARY KEY,
    day        TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'daily',
    title      TEXT NOT NULL,
    questions  TEXT NOT NULL,
    order_json TEXT NOT NULL,
    total      INTEGER NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    correct    INTEGER NOT NULL DEFAULT 0,
    completed  INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(day, mode)
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT 'Obrolan baru',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    suggestions_json TEXT,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id);

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

  CREATE TABLE IF NOT EXISTS wordbank (
    id          INTEGER PRIMARY KEY,
    text        TEXT NOT NULL,
    text_norm   TEXT NOT NULL UNIQUE,
    type        TEXT NOT NULL DEFAULT 'word',
    register    TEXT NOT NULL DEFAULT 'neutral',
    cefr        TEXT NOT NULL DEFAULT 'B1',
    meaning_id  TEXT NOT NULL,
    use_when_id TEXT,
    examples_json TEXT NOT NULL DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'new',
    item_id     INTEGER,
    source      TEXT NOT NULL DEFAULT 'seed',
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS wordbank_cefr_idx ON wordbank(cefr);
  CREATE INDEX IF NOT EXISTS wordbank_status_idx ON wordbank(status);
  `,
  // FTS5 — jalan setelah tabel items ada. Turso mendukung FTS5.
  `
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

/**
 * ALTER yang tidak idempotent (SQLite tak punya ADD COLUMN IF NOT EXISTS).
 * Dijalankan best-effort — error "duplicate column" diabaikan.
 */
const TOLERANT_MIGRATIONS: string[] = [
  `ALTER TABLE explore_items ADD COLUMN examples_json TEXT`,
  // Multi-bahasa target (EN/JP): kolom lang, existing data = 'en'.
  `ALTER TABLE items ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'`,
  `ALTER TABLE wordbank ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'`,
  `ALTER TABLE explore_items ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'`,
  // Mode Jepang: cara baca kana (+ romaji) di Bank Kata — ikut pindah ke items saat mulai belajar.
  `ALTER TABLE wordbank ADD COLUMN reading TEXT`,
  // Mode Jepang: cara baca kana (+ romaji) untuk kata kanji — tampil redup di kartu.
  `ALTER TABLE items ADD COLUMN reading TEXT`,
  // Mode Jepang: reading kana (romaji) buat kartu explore — furigana & romaji di UI.
  `ALTER TABLE explore_items ADD COLUMN reading TEXT`,
];

/** Seed awal Bank Kata — jalan sekali (skip kalau bank sudah berisi). */
const SEED_BANK: {
  text: string;
  type: string;
  register: string;
  cefr: string;
  meaning: string;
  useWhen: string;
  examples: { en: string; id: string }[];
}[] = [
  { text: "eat", type: "word", register: "neutral", cefr: "A1", meaning: "makan", useWhen: "kapan pun bahas makanan", examples: [{ en: "I eat rice every day.", id: "Aku makan nasi tiap hari." }, { en: "Let's eat something.", id: "Kita makan sesuatu yuk." }] },
  { text: "sleep", type: "word", register: "neutral", cefr: "A1", meaning: "tidur", useWhen: "bahas istirahat", examples: [{ en: "I sleep at 10 pm.", id: "Aku tidur jam 10 malam." }, { en: "Did you sleep well?", id: "Tidurmu nyenyak?" }] },
  { text: "friend", type: "word", register: "neutral", cefr: "A1", meaning: "teman", useWhen: "bahas relasi sosial", examples: [{ en: "He is my best friend.", id: "Dia sahabatku." }, { en: "I'm meeting a friend later.", id: "Aku ketemu teman nanti." }] },
  { text: "water", type: "word", register: "neutral", cefr: "A1", meaning: "air", useWhen: "kapan pun", examples: [{ en: "Can I have some water?", id: "Boleh minta air?" }, { en: "Drink more water.", id: "Minum airnya ditambah." }] },
  { text: "borrow", type: "word", register: "neutral", cefr: "A2", meaning: "pinjam (dari orang)", useWhen: "bedain sama 'lend' yang kasih pinjam", examples: [{ en: "Can I borrow your pen?", id: "Boleh pinjam pulpenmu?" }, { en: "I borrowed a book from the library.", id: "Aku pinjam buku dari perpustakaan." }] },
  { text: "cheap", type: "word", register: "neutral", cefr: "A2", meaning: "murah", useWhen: "bahas harga", examples: [{ en: "This shirt is cheap.", id: "Baju ini murah." }, { en: "Food is cheap here.", id: "Makanan di sini murah." }] },
  { text: "hurry up", type: "phrasal_verb", register: "informal", cefr: "A2", meaning: "cepatan / buruan", useWhen: "suruh orang ngebut, santai", examples: [{ en: "Hurry up, we're late!", id: "Buruan, kita telat!" }, { en: "Hurry up, the movie starts soon.", id: "Cepatan, filmnya mau mulai." }] },
  { text: "weather", type: "word", register: "neutral", cefr: "A2", meaning: "cuaca", useWhen: "small talk klasik", examples: [{ en: "The weather is nice today.", id: "Cuacanya enak hari ini." }, { en: "What's the weather like there?", id: "Cuaca di sana gimana?" }] },
  { text: "afford", type: "word", register: "neutral", cefr: "B1", meaning: "cukup dana buat beli", useWhen: "sering pakai 'can't afford'", examples: [{ en: "I can't afford a new phone.", id: "Aku gak mampu beli HP baru." }, { en: "We can afford a short trip.", id: "Kita sanggup dana liburan singkat." }] },
  { text: "reliable", type: "word", register: "neutral", cefr: "B1", meaning: "bisa diandalkan", useWhen: "puji orang/barang", examples: [{ en: "She's a reliable friend.", id: "Dia teman yang bisa diandalkan." }, { en: "This car is reliable.", id: "Mobil ini awet dan bisa diandalkan." }] },
  { text: "look forward to", type: "phrasal_verb", register: "neutral", cefr: "B1", meaning: "nggak sabar nunggu sesuatu", useWhen: "email formal juga aman; diikuti kata kerja -ing", examples: [{ en: "I look forward to seeing you.", id: "Aku nggak sabar ketemu kamu." }, { en: "I'm looking forward to the weekend.", id: "Aku nggak sabar nunggu weekend." }] },
  { text: "on purpose", type: "idiom", register: "informal", cefr: "B1", meaning: "sengaja", useWhen: "bahas niat", examples: [{ en: "He did it on purpose.", id: "Dia nglakuin itu sengaja." }, { en: "I didn't break it on purpose.", id: "Aku gak sengaja ngerusaknya." }] },
  { text: "come across", type: "phrasal_verb", register: "neutral", cefr: "B2", meaning: "nggak sengaja nemu", useWhen: "nemu sesuatu pas lagi ngelakuin hal lain", examples: [{ en: "I came across an old photo.", id: "Aku nggak sengaja nemu foto lama." }, { en: "You might come across this word often.", id: "Kamu bakal sering nemu kata ini." }] },
  { text: "inevitable", type: "word", register: "formal", cefr: "B2", meaning: "gak bisa dihindari", useWhen: "bahas hal pasti terjadi", examples: [{ en: "Change is inevitable.", id: "Perubahan itu gak bisa dihindari." }, { en: "The delay was inevitable.", id: "Keterlambatannya udah pasti terjadi." }] },
  { text: "put off", type: "phrasal_verb", register: "neutral", cefr: "B2", meaning: "menunda", useWhen: "nunda kerjaan (jangan ditiru terus)", examples: [{ en: "Don't put off your homework.", id: "Jangan nunda PR-mu." }, { en: "We put off the meeting to Friday.", id: "Kita nunda meetingnya ke Jumat." }] },
  { text: "strike a balance", type: "collocation", register: "formal", cefr: "B2", meaning: "nemuin titik tengah antara dua hal", useWhen: "work-life, keputusan", examples: [{ en: "Try to strike a balance between work and rest.", id: "Coba cari keseimbangan antara kerja dan istirahat." }, { en: "The plan strikes a balance between cost and quality.", id: "Rencananya seimbang antara biaya dan kualitas." }] },
  { text: "get carried away", type: "idiom", register: "informal", cefr: "C1", meaning: "kebawa suasana sampe berlebihan", useWhen: "shopping, ngomong, kerja", examples: [{ en: "I got carried away shopping.", id: "Aku kebawa suasana sampe belanja berlebihan." }, { en: "Sorry, I got carried away.", id: "Maaf, aku kebablasan ngomongnya." }] },
  { text: "prudent", type: "word", register: "formal", cefr: "C1", meaning: "bijak & hati-hati (dalam keputusan)", useWhen: "teks formal, laporan, berita", examples: [{ en: "It's prudent to save money.", id: "Bijak kalau nyimpan duit." }, { en: "A prudent decision saved the company.", id: "Keputusan yang bijak nyelametin perusahaan." }] },
  { text: "hindsight", type: "word", register: "neutral", cefr: "C1", meaning: "pandangan belakang — sadar setelah kejadian", useWhen: "idiom 'in hindsight' (kalau dipikir-pikir)", examples: [{ en: "In hindsight, it was a mistake.", id: "Kalau dipikir-pikir, itu kesalahan." }, { en: "With hindsight, I'd do it differently.", id: "Dengan sadar setelahnya, aku bakal beda cara." }] },
  { text: "quintessential", type: "word", register: "formal", cefr: "C2", meaning: "contoh paling khas dari sesuatu", useWhen: "tulisan sastra/jurnalistik", examples: [{ en: "She's the quintessential New Yorker.", id: "Dia contoh paling khas orang New York." }, { en: "This dish is quintessential Italian food.", id: "Masakan ini adalah makanan Italia yang paling khas." }] },
  { text: "ubiquitous", type: "word", register: "formal", cefr: "C2", meaning: "ada di mana-mana", useWhen: "esai, berita teknologi", examples: [{ en: "Smartphones are ubiquitous.", id: "HP pintar ada di mana-mana." }, { en: "The logo is ubiquitous in the city.", id: "Logonya ada dimana-mana di kota ini." }] },
];

async function seedWordbank(client: Client): Promise<void> {
  const cnt = await client.execute("SELECT COUNT(*) AS c FROM wordbank");
  if (Number(cnt.rows[0]?.c ?? 0) === 0) {
    const now = Date.now();
    for (const w of SEED_BANK) {
      await client.execute({
        sql: `INSERT INTO wordbank (text, text_norm, type, register, cefr, meaning_id, use_when_id, examples_json, status, source, created_at, lang)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 'seed', ?, 'en')`,
        args: [
          w.text,
          w.text.toLowerCase(),
          w.type,
          w.register,
          w.cefr,
          w.meaning,
          w.useWhen,
          JSON.stringify(w.examples),
          now,
        ],
      });
    }
  }
  // Seed JP sekali (per bahasa). Rows seed LAMA (source='seed', sebelum format furigana
  // + exclude kana) dibuang sekali di sini supaya ke-replace versi baru di bawah.
  // Data generate/import milik user (source lain) gak disentuh.
  await client.execute("DELETE FROM wordbank WHERE lang = 'ja' AND source = 'seed'");
  // Hasil generate JA dari masa bug ikut dibuang: (a) meaningId format campur
  // "kana (romaji) arti", (b) reading gak kesimpan (schema lama nolak) + level
  // kepaksa B1 — keduanya gak layak tampil di format baru.
  await client.execute(
    "DELETE FROM wordbank WHERE lang = 'ja' AND source LIKE 'bank%' AND meaning_id LIKE '%(%'",
  );
  await client.execute(
    "DELETE FROM wordbank WHERE lang = 'ja' AND source LIKE 'bank%' AND reading IS NULL AND cefr = 'B1'",
  );
  // Kartu explore EN yang ke-generate pas mode JA (sebelum prompt lang-aware):
  // teks tanpa kana/kanji di lang='ja' pasti salah scope → dibuang biar bisa
  // di-generate ulang sebagai konten Jepang beneran.
  const exploreJa = await client.execute("SELECT id, text FROM explore_items WHERE lang = 'ja'");
  for (const r of exploreJa.rows) {
    const text = String(r.text ?? "");
    if (!/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) {
      await client.execute({ sql: "DELETE FROM explore_items WHERE id = ?", args: [Number(r.id)] });
    }
  }
  // Seed jalan kalau BELUM ADA row seed JA (row generate/import user gak nimblokir).
  const cntJa = await client.execute(
    "SELECT COUNT(*) AS c FROM wordbank WHERE lang = 'ja' AND source LIKE 'seed%'",
  );
  if (Number(cntJa.rows[0]?.c ?? 0) === 0) {
    const now = Date.now();
    for (const w of SEED_BANK_JP) {
      await client.execute({
        sql: `INSERT INTO wordbank (text, text_norm, type, register, cefr, meaning_id, use_when_id, examples_json, status, source, created_at, lang, reading)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', 'seed-ja-v2', ?, 'ja', ?)`,
        args: [
          w.text,
          w.text.toLowerCase(),
          w.type,
          w.register,
          w.cefr,
          w.meaning,
          w.useWhen,
          JSON.stringify(w.examples),
          now,
          w.reading ?? null,
        ],
      });
    }
  }
}

/** Jalankan semua migrasi via libsql (async). Sekali per proses. */
export async function runMigrations(client: Client): Promise<void> {
  for (const ddl of MIGRATIONS) {
    await client.executeMultiple(ddl);
  }
  for (const ddl of TOLERANT_MIGRATIONS) {
    try {
      await client.execute(ddl);
    } catch {
      /* kolom sudah ada — abaikan */
    }
  }

  // Rebuild quiz_sets jika skema lama: UNIQUE(day) → UNIQUE(day,mode) → UNIQUE(day,mode,lang).
  // Data lama selalu ikut kepindah dengan lang='en' (existing = bahasa Inggris).
  const cols = await client.execute("PRAGMA table_info(quiz_sets)");
  const names = new Set(cols.rows.map((r) => String(r.name ?? "")));
  if (!names.has("mode") || !names.has("lang")) {
    await client.executeMultiple(`
      ALTER TABLE quiz_sets RENAME TO quiz_sets_legacy;
      CREATE TABLE quiz_sets (
        id         INTEGER PRIMARY KEY,
        day        TEXT NOT NULL,
        mode       TEXT NOT NULL DEFAULT 'daily',
        lang       TEXT NOT NULL DEFAULT 'en',
        title      TEXT NOT NULL,
        questions  TEXT NOT NULL,
        order_json TEXT NOT NULL,
        total      INTEGER NOT NULL,
        done       INTEGER NOT NULL DEFAULT 0,
        correct    INTEGER NOT NULL DEFAULT 0,
        completed  INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        UNIQUE(day, mode, lang)
      );
      INSERT INTO quiz_sets (id, day, mode, lang, title, questions, order_json, total, done, correct, completed, created_at)
        SELECT id, day,
               ${names.has("mode") ? "mode" : "'daily'"},
               ${names.has("lang") ? "lang" : "'en'"},
               title, questions, order_json, total, done, correct, completed, created_at
        FROM quiz_sets_legacy;
      DROP TABLE quiz_sets_legacy;
    `);
  }

  // Seed awal Bank Kata sekali di awal (per bahasa — EN & JP beda set).
  await seedWordbank(client);
}

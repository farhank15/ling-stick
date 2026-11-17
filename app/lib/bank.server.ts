import { and, eq, ne, inArray, sql } from "drizzle-orm";
import { db, getRawClient } from "~/lib/db/client.server";
import { cards, examples, items, wordbank, wordbankProgress } from "~/lib/db/schema";
import { getTargetLang, detectLang } from "~/lib/lang.server";
import { normalizeText } from "~/lib/utils.shared";
import { requireUserId } from "~/lib/user-context";

/** Bank Kata — BLUEPRINT §3 (katalog kosakata per level CEFR, koleksi selalu bertambah). */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
/**
 * Label level generik di kolom `cefr`: EN pakai CEFR, JA pakai JLPT.
 * (Kolom dipakai generik biar gak perlu rebuild skema — lihat BLUEPRINT mode JA.)
 */
export type Cefr = (typeof CEFR_LEVELS)[number] | (typeof JLPT_LEVELS)[number];

export type BankExample = { en: string; id: string; kana?: string | null }; // kana: bacaan penuh kalimat JA (furigana)

export type BankEntry = {
  id: number;
  text: string;
  type: string;
  register: string;
  cefr: Cefr;
  meaningId: string;
  useWhenId: string | null;
  examples: BankExample[];
  status: "new" | "learning" | "known";
  itemId: number | null;
  reading: string | null; // JA: kana (+ romaji)
};;



function parseRow(r: typeof wordbank.$inferSelect): BankEntry {
  let examples: BankExample[] = [];
  try {
    const parsed = JSON.parse(r.examplesJson) as BankExample[];
    if (Array.isArray(parsed)) examples = parsed;
  } catch {
    /* examples rusak → biarkan kosong */
  }
  return {
    id: r.id,
    text: r.text,
    type: r.type,
    register: r.register,
    cefr: r.cefr as Cefr,
    meaningId: r.meaningId,
    useWhenId: r.useWhenId,
    examples,
    status: r.status as BankEntry["status"],
    itemId: r.itemId,
    reading: r.reading ?? null,
  };
}

export function isCefr(v: string | null | undefined): v is (typeof CEFR_LEVELS)[number] {
  return !!v && (CEFR_LEVELS as readonly string[]).includes(v);
}

/** Level valid apa pun bahasanya: CEFR (EN) atau JLPT (JA). */
export function isLevel(v: string | null | undefined): v is Cefr {
  return isCefr(v) || (!!v && (JLPT_LEVELS as readonly string[]).includes(v));
}

/** List entri bank; filter level & status. Katalog bersama + status belajar per-user.
 *  Mode JA: entri type "kana" gak ikut — aksara punya menu sendiri (halaman Aksara). */
export async function listBank(filter: { cefr?: string; status?: string } = {}) {
  const lang = await getTargetLang();
  const uid = requireUserId();
  const baseConds = [eq(wordbank.lang, lang)];
  if (lang === "ja") baseConds.push(ne(wordbank.type, "kana"));
  if (isLevel(filter.cefr)) baseConds.push(eq(wordbank.cefr, filter.cefr));

  const [catalog, prog] = await Promise.all([
    db.select().from(wordbank).where(and(...baseConds)).limit(600),
    db.select().from(wordbankProgress).where(eq(wordbankProgress.userId, uid)),
  ]);
  const progMap = new Map(prog.map((p) => [p.bankId, p]));

  const merged = catalog.map((r) => {
    const p = progMap.get(r.id);
    return p
      ? { ...parseRow(r), status: p.status as BankEntry["status"], itemId: p.itemId }
      : parseRow(r);
  });
  if (filter.status && ["new", "learning", "known"].includes(filter.status)) {
    return merged.filter((r) => r.status === filter.status);
  }
  return merged;
}

/** Badge count per level CEFR/JLPT + per status — per-user (katalog + progress).
 *  Mode JA kana di-exclude biar badge count = isi list Bank (kana dihitung di menu Aksara). */
export async function getBankStats() {
  const lang = await getTargetLang();
  const uid = requireUserId();
  const baseConds =
    lang === "ja" ? [eq(wordbank.lang, lang), ne(wordbank.type, "kana")] : [eq(wordbank.lang, lang)];

  const [catalog, prog] = await Promise.all([
    db.select().from(wordbank).where(and(...baseConds)),
    db.select().from(wordbankProgress).where(eq(wordbankProgress.userId, uid)),
  ]);
  const adopted = new Set(prog.map((p) => p.bankId));
  const unadopted = catalog.filter((r) => !adopted.has(r.id));

  const byLevel: Record<string, number> = {};
  for (const r of unadopted) byLevel[r.cefr] = (byLevel[r.cefr] ?? 0) + 1;
  const learning = prog.filter((p) => p.status === "learning").length;
  const known = prog.filter((p) => p.status === "known").length;
  return {
    byLevel,
    byStatus: { new: unadopted.length, learning, known },
    total: unadopted.length,
    learning,
    known,
  };
}

async function upsertProgress(uid: number, bankId: number, status: string, itemId: number | null) {
  await db
    .insert(wordbankProgress)
    .values({ userId: uid, bankId, status, itemId, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: [wordbankProgress.userId, wordbankProgress.bankId],
      set: { status, itemId, updatedAt: Date.now() },
    });
}

/** Pastikan item Library + kartu FSRS ada untuk entri bank (milik user). */
async function ensureItemForBank(entry: typeof wordbank.$inferSelect, uid: number): Promise<number> {
  const norm = normalizeText(entry.text);
  const exRows = await getRawClient().execute({
    sql: "SELECT id FROM items WHERE text_norm = ? AND lang = ? AND user_id = ? LIMIT 1",
    args: [norm, entry.lang, uid],
  });
  const existingId = Number(exRows.rows[0]?.id) || null;
  if (existingId) {
    await db.update(items).set({ status: "learning" }).where(eq(items.id, existingId));
    return existingId;
  }
  const exs = (JSON.parse(entry.examplesJson || "[]") as BankExample[]).slice(0, 3);
  await db
    .insert(items)
    .values({
      text: entry.text,
      textNorm: norm,
      type: entry.type,
      lang: entry.lang,
      reading: entry.reading ?? null,
      register: entry.register,
      meaningId: entry.meaningId,
      notesId: entry.useWhenId ? `Dipakai saat: ${entry.useWhenId}` : null,
      source: `Bank Kata (${entry.cefr})`,
      status: "learning",
      createdAt: Date.now(),
      userId: uid,
    })
    .onConflictDoNothing();
  const rows = await getRawClient().execute({
    sql: "SELECT id FROM items WHERE text_norm = ? AND user_id = ? LIMIT 1",
    args: [norm, uid],
  });
  const itemId = Number(rows.rows[0]?.id);
  if (!itemId) throw new Error("Gagal impor kata");
  if (exs.length) {
    await db
      .insert(examples)
      .values(exs.map((e) => ({ itemId, register: "neutral", en: e.en, idText: e.id })))
      .onConflictDoNothing();
  }
  const [card] = await db.select().from(cards).where(eq(cards.itemId, itemId)).limit(1);
  if (!card) {
    const now = Date.now();
    await db.insert(cards).values({ itemId, due: now, reps: 0, lapses: 0, state: 0, learningSteps: 0, userId: uid });
  }
  return itemId;
}

/** Tandai "mau dipelajari": kirim ke Library + bikin kartu FSRS (status per-user). */
export async function startLearning(bankId: number) {
  const uid = requireUserId();
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) throw new Error("Entri tidak ada");
  const itemId = await ensureItemForBank(entry, uid);
  await upsertProgress(uid, bankId, "learning", itemId);
  return itemId;
}

/** Tandai "sudah tahu": item di Library ikut di-known + progress per-user. */
export async function markKnown(bankId: number) {
  const uid = requireUserId();
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) throw new Error("Entri tidak ada");
  const [prog] = await db
    .select()
    .from(wordbankProgress)
    .where(and(eq(wordbankProgress.userId, uid), eq(wordbankProgress.bankId, bankId)))
    .limit(1);
  const itemId = prog?.itemId ?? entry.itemId;
  if (itemId) {
    await db.update(items).set({ status: "known" }).where(and(eq(items.id, itemId), eq(items.userId, uid)));
  }
  await upsertProgress(uid, bankId, "known", itemId);
}

/* ── Generate kata baru via LLM ─────────────────────────────── */

export type GenOptions = { level: Cefr; count: number; topic?: string };

export async function generateBankWords(opts: GenOptions): Promise<{ added: number; skipped: number }> {
  const { chatJson } = await import("~/lib/llm.server");
  const { bankOutputSchema } = await import("~/lib/schemas");
  const { BANK_SYSTEM } = await import("~/lib/prompts");
  const lang = await getTargetLang();

  const topic = opts.topic?.trim();
  const topicLine = topic
    ? `Theme: "${topic}" — all words must clearly relate to this theme.`
    : "No theme: pick words an Indonesian adult learner at this level should know next.";

  // Mode Jepang: generate kosakata JP per level JLPT. "text" = kata dalam kanji/kana,
  // wajib ada field "reading" (kana) + "romaji" biar bisa dipelajari orang dewasa.
  if (lang === "ja") {
    const userJa = `Generate exactly ${opts.count} Japanese vocabulary items of JLPT level ${opts.level}.\n${topicLine}\n"text" MUST be the word written in kanji (and/or kana), plus "reading" in hiragana and "romaji".\nNEVER generate kana characters (single hiragana/katakana letters like あ or カ) — kana charts are taught elsewhere, not in this vocabulary bank. Only real words, particles, grammar points and expressions.\nExplanations (meaning_id, use_when_id, id fields) in casual Indonesian. Examples: natural Japanese sentence + Indonesian translation.\nAvoid these words already in the bank:\n${await existingWordsForPrompt(opts.level, "ja")}\n\nJSON shape:\n{ "words": [{ "text": string, "reading": string, "romaji": string, "type": "word"|"particle"|"expression", "register": "formal"|"neutral"|"informal", "meaning_id": string, "use_when_id": string, "examples": [{ "en": string (Japanese sentence), "id": string (Indonesian), "romaji": string }] }] }`;
    const { data } = await chatJson(BANK_SYSTEM, userJa, bankOutputSchema, "bank:ja:v1", userJa);
    return await insertGeneratedJa(opts.level, data.words, topic ? `bank:${topic}` : "bank");
  }

  const user = `Generate exactly ${opts.count} English words or phrases of CEFR level ${opts.level}.\n${topicLine}\nAvoid these words that are already in the bank:\n${await existingWordsForPrompt(opts.level, "en")}\n\nJSON shape:\n{ "words": [{ "text": string, "type": "word"|"phrasal_verb"|"idiom"|"collocation"|"slang", "register": "formal"|"neutral"|"informal"|"slang", "meaning_id": string, "use_when_id": string, "examples": [{ "en": string, "id": string }] }] }`;

  const { data } = await chatJson(BANK_SYSTEM, user, bankOutputSchema, "bank:v1", user);
  return await insertGenerated(opts.level, data.words, topic ? `bank:${topic}` : "bank");
}

async function existingWordsForPrompt(level: Cefr, lang: "en" | "ja"): Promise<string> {
  // Hindari kata yang sudah di bank (level ini) DAN yang sudah di library —
  // tanpa ini LLM generate kata yang user udah simpan (duplikat UX).
  // matcha: prompt cuma avoid bank → kata library muncul lagi sebagai "baru".
  // 2 SELECT ringan ber-limit, bukan full scan.
  const [bankRows, libRows] = await Promise.all([
    db
      .select({ text: wordbank.text })
      .from(wordbank)
      .where(and(eq(wordbank.cefr, level), eq(wordbank.lang, lang)))
      .limit(200),
    db
      .select({ text: items.text })
      .from(items)
      .where(eq(items.lang, lang))
      .orderBy(sql`RANDOM()`)
      .limit(200),
  ]);
  const seen = new Set<string>();
  for (const r of [...bankRows, ...libRows]) {
    const t = r.text.toLowerCase().trim();
    if (t) seen.add(t);
    if (seen.size >= 400) break;
  }
  return seen.size ? [...seen].join(", ") : "(none)";
}

/** Simpan hasil generate: skip duplikat bank DAN library (batch-check, 2 query).
 *  LLM kadang tetap generate kata yang dihindari di prompt — guard DB ini
 *  yang menjamin bank cuma berisi kata fresh. */
async function insertGenerated(
  level: Cefr,
  words: { text: string; type?: string; register?: string; meaning_id: string; use_when_id?: string; examples?: BankExample[] }[],
  source: string,
): Promise<{ added: number; skipped: number }> {
  const lang = await getTargetLang();
  const cands = words
    .map((w) => ({ text: w.text.trim(), w }))
    .filter((c) => c.text && c.w.meaning_id)
    .map((c) => ({ ...c, norm: normalizeText(c.text) }));
  const norms = [...new Set(cands.map((c) => c.norm))];
  const taken = new Set<string>();
  if (norms.length) {
    const [inBank, inLib] = await Promise.all([
      db.select({ t: wordbank.textNorm }).from(wordbank).where(and(inArray(wordbank.textNorm, norms), eq(wordbank.lang, lang))),
      db.select({ t: items.textNorm }).from(items).where(and(inArray(items.textNorm, norms), eq(items.lang, lang))),
    ]);
    for (const r of [...inBank, ...inLib]) if (r.t) taken.add(r.t);
  }
  let added = 0;
  let skipped = 0;
  for (const c of cands) {
    if (taken.has(c.norm)) {
      skipped++;
      continue;
    }
    taken.add(c.norm);
    await db.insert(wordbank).values({
      text: c.text,
      textNorm: c.norm,
      type: c.w.type || "word",
      register: c.w.register || "neutral",
      cefr: level,
      meaningId: c.w.meaning_id,
      useWhenId: c.w.use_when_id || null,
      examplesJson: JSON.stringify((c.w.examples ?? []).slice(0, 4)),
      status: "new",
      source,
      lang,
      createdAt: Date.now(),
    });
    added++;
  }
  return { added, skipped };
}

/** Simpan hasil generate JA: reading/romaji dilipat ke meaning & examples. Skip duplikat bank + library (batch). */
async function insertGeneratedJa(
  level: Cefr,
  words: { text: string; reading?: string; romaji?: string; type?: string; register?: string; meaning_id: string; use_when_id?: string; examples?: { en: string; id: string; romaji?: string; kana?: string }[] }[],
  source: string,
): Promise<{ added: number; skipped: number }> {
  const cands = words
    .map((w) => ({ text: w.text.trim(), w }))
    .filter((c) => c.text && c.w.meaning_id)
    .map((c) => ({ ...c, norm: normalizeText(c.text) }));
  const norms = [...new Set(cands.map((c) => c.norm))];
  const taken = new Set<string>();
  if (norms.length) {
    const [inBank, inLib] = await Promise.all([
      db.select({ t: wordbank.textNorm }).from(wordbank).where(and(inArray(wordbank.textNorm, norms), eq(wordbank.lang, "ja"))),
      db.select({ t: items.textNorm }).from(items).where(and(inArray(items.textNorm, norms), eq(items.lang, "ja"))),
    ]);
    for (const r of [...inBank, ...inLib]) if (r.t) taken.add(r.t);
  }
  let added = 0;
  let skipped = 0;
  for (const c of cands) {
    if (taken.has(c.norm)) {
      skipped++;
      continue;
    }
    taken.add(c.norm);
    const w = c.w;
    // meaningId DIJAGA MURNI Indonesia — reading/romaji tersimpan terpisah di kolom
    // `reading` ("かな (romaji)") biar UI bisa render furigana + toggle romaji.
    // Contoh JA: en = kalimat Jepang murni, kana = bacaan penuh (sumber furigana per
    // kanji), romaji = baris ke-2 (hidden behind toggle romaji).
    const examplesJa: BankExample[] = (w.examples ?? []).slice(0, 4).map((e) => ({
      en: [e.en, e.romaji].filter(Boolean).join("\n"),
      id: e.id,
      kana: e.kana || null,
    }));
    await db.insert(wordbank).values({
      text: c.text,
      textNorm: c.norm,
      type: w.type || "word",
      register: w.register || "neutral",
      cefr: level,
      meaningId: w.meaning_id,
      useWhenId: w.use_when_id || null,
      examplesJson: JSON.stringify(examplesJa),
      status: "new",
      source,
      lang: "ja",
      reading: [w.reading, w.romaji ? `(${w.romaji})` : null].filter(Boolean).join(" ") || null,
      createdAt: Date.now(),
    });
    added++;
  }
  return { added, skipped };
}

/**
 * Tandai entri bank "mau dipelajari" TANPA menghapus row-nya (dipakai halaman
 * Aksara/kanji: daftar tetap lengkap, status berubah jadi filter belajar/hafal).
 * Status tersimpan per-user di wordbank_progress.
 */
export async function learnBankKeep(bankId: number): Promise<number | null> {
  const uid = requireUserId();
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) return null;
  const itemId = await ensureItemForBank(entry, uid);
  await upsertProgress(uid, bankId, "learning", itemId);
  return itemId;
}

/** Tandai entri bank "sudah hafal" (progress per-user — row katalog tetap ada). */
export async function markBankKnownKeep(bankId: number): Promise<void> {
  const uid = requireUserId();
  const [entry] = await db.select().from(wordbank).where(eq(wordbank.id, bankId)).limit(1);
  if (!entry) return;
  const [prog] = await db
    .select()
    .from(wordbankProgress)
    .where(and(eq(wordbankProgress.userId, uid), eq(wordbankProgress.bankId, bankId)))
    .limit(1);
  const itemId = prog?.itemId ?? entry.itemId;
  if (itemId) {
    await db.update(items).set({ status: "known" }).where(and(eq(items.id, itemId), eq(items.userId, uid)));
  }
  await upsertProgress(uid, bankId, "known", itemId);
}

/** Sinkronkan status bank dari status item Library (mis. item di-known dari quiz). */
export async function syncBankFromItems() {
  const uid = requireUserId();
  const rows = await db
    .select()
    .from(wordbankProgress)
    .where(and(eq(wordbankProgress.userId, uid), eq(wordbankProgress.status, "learning")));
  if (!rows.length) return;
  const ids = rows.map((r) => r.itemId).filter((v): v is number => typeof v === "number");
  if (!ids.length) return;
  const itemRows = await db
    .select({ id: items.id, status: items.status })
    .from(items)
    .where(and(inArray(items.id, ids), eq(items.userId, uid)));
  const map = new Map(itemRows.map((r) => [r.id, r.status]));
  for (const r of rows) {
    if (r.itemId && map.get(r.itemId) === "known") {
      await db.update(wordbankProgress).set({ status: "known", updatedAt: Date.now() }).where(and(eq(wordbankProgress.userId, uid), eq(wordbankProgress.bankId, r.bankId)));
    }
  }
}



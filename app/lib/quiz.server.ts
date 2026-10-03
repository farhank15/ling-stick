import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/lib/db/client.server";
import { cards, items, quizSets, quizAnswers, wordbank } from "~/lib/db/schema";
import { env } from "~/lib/env.server";
import { getTargetLang, type TargetLang } from "~/lib/lang.server";

/**
 * Latihan harian & multi-metode — BLUEPRINT §3 F3 (diupgrade):
 * - SATU SET per hari per mode ("daily" = kuis rutin; "extra"/"typing"/"intens" = tambahan)
 * - Progres kesimpen: keluar di tengah → lanjut lagi dari posisi terakhir
 * - Soal yang salah diselipkan lagi ±5 posisi dari posisi sekarang
 * - Sumber soal: item Library sendiri + kata dari Bank Kata (CEFR level bisa dipilih)
 */

export type QuizMode =
  | "daily"
  | "extra"
  | "typing"
  | "intens"
  | "audio"
  | "scramble"
  | "mix"
  | "dikte"
  | "shadow"
  | "pola"
  | "salah"
  | "toefl"
  | "bulanan";
export const QUIZ_MODES: QuizMode[] = [
  "daily",
  "extra",
  "typing",
  "intens",
  "audio",
  "scramble",
  "mix",
  "dikte",
  "shadow",
  "pola",
  "salah",
  "toefl",
  "bulanan",
];

/** Minggu ISO: 2025-W41 — kunci satu TOEFL Test per minggu. */
export function isoWeekKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Kunci bulan: 2025-10 — kunci satu Uji Bulanan per bulan. */
export function monthKey(d = new Date()): string {
  return localDayStr().slice(0, 7);
}

/** Tanggal berapa di bulan ini (Jakarta). */
export function dayOfMonth(): number {
  return Number(localDayStr().slice(8, 10));
}

/** Mode khusus memaksa tipe soal tertentu biar isinya beda dari kuis harian. */
function forceTypeFor(mode: QuizMode): QuizQuestion["type"] | undefined {
  if (mode === "typing" || mode === "scramble" || mode === "dikte" || mode === "shadow") return "typing";
  if (mode === "audio") return "listen";
  if (mode === "pola") return "cloze";
  // mix: campur semua tipe.
  return undefined;
}

export type QuizQuestion = {
  itemId: number;
  bankId?: number;
  type: "mcq_en_id" | "mcq_id_en" | "cloze" | "listen" | "typing";
  prompt: string;
  options: string[];
  answer: string;
  meaningId: string | null;
  exampleEn: string | null;
  reading?: string | null; // JA: kana (+romaji) — furigana di UI shadow
  tokens?: string[]; // JA Susun Kata: token per-kata dari segmentasi AI
};

type ItemRow = {
  id: number;
  text: string;
  type: string;
  register: string;
  meaningId: string | null;
  firstEn: string | null;
  reading: string | null;
};

/** Kata fungsi buat cloze gramatika (mode Pola): partikel/preposisi/auxiliary
 * yang paling sering salah pakai. Dipilih dari kalimat contoh apa pun — tidak
 * tergantung isi library. */
const FUNCTION_WORDS_JA = ["は", "が", "を", "に", "で", "へ", "と", "も", "か", "から", "まで", "より", "の", "ね", "よ"];
const FUNCTION_WORDS_EN = ["in", "on", "at", "to", "for", "of", "with", "by", "from", "about", "that", "who", "which", "is", "are", "was", "were", "have", "has", "will", "would", "can"];

const KANA_RE = /[\u3040-\u30ff]/;

/**
 * Cari partikel JA yang aman dirumpang: tolak yang nempel di konjugasi
 * (です→で, ます→ま, でしょう→で) dan の di dalam kata kana murni (もの/こと).
 * Balikkan { hit, index } kemunculan valid pertama.
 * matcha: blank で di です jadi "優しい＿＿す" — soal rusak.
 */
function findJaParticle(raw: string, candidates: string[]): { hit: string; index: number } | null {
  const KONJUGASI_NEXT = new Set(["す", "せ", "し", "ょ"]);
  for (const w of candidates) {
    let from = 0;
    for (;;) {
      const idx = raw.indexOf(w, from);
      if (idx === -1) break;
      const prev = raw[idx - 1];
      const next = raw[idx + w.length];
      const inKonjugasi = next !== undefined && KONJUGASI_NEXT.has(next);
      const noTengahKata =
        w === "の" && prev !== undefined && next !== undefined && KANA_RE.test(prev) && KANA_RE.test(next);
      if (!inKonjugasi && !noTengahKata) return { hit: w, index: idx };
      from = idx + 1;
    }
  }
  return null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function naivePronunciation(text: string): string {
  return text.toLowerCase().split(/\s+/).join("·");
}

/** Tanggal lokal Asia/Jakarta (app personal, timezone tunggal). */
export function localDayStr(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
    .toISOString()
    .slice(0, 10);
}

type BuildOpts = { sources?: ("library" | "bank")[]; bankLevel?: string; scrambleTokens?: boolean; grammarCloze?: boolean; shuffledTypes?: boolean; shufflePool?: boolean; itemIds?: number[]; typeMix?: QuizQuestion["type"][]; recallKnown?: boolean };

/**
 * Segmentasi kalimat Jepang jadi token per-kata via AI (partikel selalu token
 * sendiri). Hasil divalidasi: token digabung harus = kalimat asli, else gagal.
 * Di-cache di llm_cache (ns seg:ja:v1) — 1 kali per kalimat.
 */
async function segmentJa(sentence: string): Promise<string[]> {
  try {
    const clean = sentence.replace(/\s+/g, "").slice(0, 200);
    if (!clean) return [];
    const { chatJson } = await import("~/lib/llm.server");
    const { SEGMENT_SYSTEM_JA } = await import("~/lib/prompts");
    const { z } = await import("zod");
    const schema = z.object({ tokens: z.array(z.string().min(1)).min(2).max(40) });
    const { data } = await chatJson(SEGMENT_SYSTEM_JA, clean, schema, "seg:ja:v1", clean);
    const joined = data.tokens.join("").replace(/\s+/g, "");
    return joined === clean ? data.tokens : [];
  } catch {
    return []; // AI gagal → caller fallback ke soal lain
  }
}

/** Kumpulan kandidat: dari Library, dari Bank Kata (status learning), atau keduanya. Ter-scope bahasa aktif. */
async function collectRows(opts: BuildOpts) {
  const sources = opts.sources ?? ["library", "bank"];
  const lang = await getTargetLang();
  // Ulas Salah: cuma item library yang ID-nya dikasih (jawaban salah terakhir).
  const idFilter = opts.itemIds && opts.itemIds.length > 0 ? opts.itemIds : null;
  const lib = sources.includes("library")
    ? await db
        .select({
          id: items.id,
          text: items.text,
          type: items.type,
          register: items.register,
          meaningId: items.meaningId,
          reading: items.reading,
          firstEn: sql<string | null>`(SELECT en FROM examples WHERE item_id = items.id ORDER BY length(en), id LIMIT 1)`,
        })
        .from(items)
        .where(
          and(
            eq(items.status, "learning"),
            eq(items.lang, lang),
            ...(idFilter ? [inArray(items.id, idFilter)] : []),
          ),
        )
        .limit(300)
    : [];

  let bank: ItemRow[] = [];
  if (sources.includes("bank")) {
    const conds = [eq(wordbank.status, "learning"), sql`${wordbank.itemId} IS NULL`, eq(wordbank.lang, lang)];
    if (opts.bankLevel) conds.push(eq(wordbank.cefr, opts.bankLevel));
    const bankRows = await db
      .select({
        id: wordbank.id,
        text: wordbank.text,
        type: wordbank.type,
        register: wordbank.register,
          meaningId: wordbank.meaningId,
          reading: wordbank.reading,
          firstEn: sql<string | null>`(SELECT json_extract(value, '$.en') FROM json_each(wordbank.examples_json) ORDER BY length(json_extract(value, '$.en')) LIMIT 1)`,
      })
      .from(wordbank)
      .where(and(...conds))
      .limit(300);
    bank = bankRows;
  }
  return [...lib, ...bank];
}

/**
 * Bangun soal bervariasi — 1 item boleh dipakai beberapa tipe soal (biar genap
 * walau pool masih sedikit). `forceType` untuk mode khusus (mis. "typing").
 */
async function buildQuestions(
  limit: number,
  opts: BuildOpts & { forceType?: QuizQuestion["type"]; typeMix?: QuizQuestion["type"][] } = {},
): Promise<QuizQuestion[]> {
  const allRows = await collectRows(opts);
  if (allRows.length === 0) return [];

  // Recall: selipkan item yang sudah hafal (±15%) di antara materi belajar.
  // Riset: retrieval sesekali atas materi hafal mencegah forgetting curve diam-diam.
  // Kecuali mode salah (fokus penuh ke kesalahan) — dimatikan via recallKnown:false.
  // matcha: pool learning saja = yang hafal tidak pernah dites lagi.
  if (opts.recallKnown !== false) {
    const lang = await getTargetLang();
    const recallN = Math.min(6, Math.max(2, Math.round(limit * 0.15)));
    const recallRows = await db
      .select({
        id: items.id,
        text: items.text,
        type: items.type,
        register: items.register,
        meaningId: items.meaningId,
        reading: items.reading,
        firstEn: sql<string | null>`(SELECT en FROM examples WHERE item_id = items.id ORDER BY length(en), id LIMIT 1)`,
      })
      .from(items)
      .where(and(eq(items.status, "known"), eq(items.lang, lang)))
      .orderBy(sql`RANDOM()`)
      .limit(recallN);
    const knownIds = new Set(allRows.map((r) => r.id));
    const fresh = recallRows.filter((r) => r.meaningId && !knownIds.has(r.id));
    // Sisip tiap ~6 item biar tersebar, bukan menumpuk di akhir.
    const merged: ItemRow[] = [];
    let ri = 0;
    for (let k = 0; k < allRows.length; k++) {
      merged.push(allRows[k]!);
      if ((k + 1) % 6 === 0 && ri < fresh.length) merged.push(fresh[ri++]!);
    }
    while (ri < fresh.length) merged.push(fresh[ri++]!);
    allRows.length = 0;
    allRows.push(...merged);
  }

  const dueIds = new Set(
    (
      await db
        .select({ itemId: cards.itemId })
        .from(cards)
        .innerJoin(items, eq(items.id, cards.itemId))
        .where(and(sql`${cards.due} <= ${Date.now() + 86_400_000}`, eq(items.lang, await getTargetLang())))
        .limit(100)
    ).map((r) => r.itemId),
  );

  const pool: ItemRow[] = [...allRows]
    .filter((r) => r.meaningId)
    .sort((a, b) => {
      // Campur = acak bebas tanpa jadwal (beda dari daily yang due-first).
      if (opts.shufflePool) return Math.random() - 0.5;
      const ad = dueIds.has(a.id) ? 0 : 1;
      const bd = dueIds.has(b.id) ? 0 : 1;
      return ad - bd;
    });
  if (pool.length === 0) return [];

  const baseTypes: QuizQuestion["type"][] = opts.forceType
    ? [opts.forceType]
    : (opts.typeMix ?? ["mcq_en_id", "mcq_id_en", "cloze", "listen"]);
  // Campur = urutan tipe diacak per set (daily/intens rapi bergiliran).
  const types = opts.shuffledTypes ? shuffle(baseTypes) : baseTypes;
  const lang = await getTargetLang();

  // Ketik/Susun Kata: jawaban berupa kalimat panjang (mis. kalimat hasil
  // translate yang tersimpan sebagai item) tidak layak jadi soal — chip/input
  // membludak. Pakai item pendek saja; kalau tidak ada, fallback ke semua.
  // matcha: EN "The company's ledger shows..." 10 kata tidak bisa disusun.
  const shortEnough = (text: string) =>
    lang === "ja" ? text.trim().length <= 30 : (text.match(/[A-Za-z']+/g) || []).length <= 8;
  const askPool =
    opts.forceType === "typing" ? (pool.filter((r) => shortEnough(r.text)) || []) : pool;
  const usePool = askPool.length > 0 ? askPool : pool;
  const questions: QuizQuestion[] = [];
  // Anti-bosan: kalimat/jawaban yang sudah dipakai di set ini dilewati dulu
  // (pool kecil bikin 1 kalimat dominan, mis. ledger 10 contoh). Guard
  // i > limit*10 di bawah mencegah loop habis saat pool benar-benar sempit.
  // matcha: user protes kalimat itu-itu saja di susun kata/campur.
  const usedText = new Set<string>();
  // Pool lebih kecil dari limit → pengulangan tak terhindarkan, dedupe dimatikan
  // biar jumlah soal tetap penuh (kloter kecil memang segitu adanya).
  const dedupe = usePool.length >= limit;
  // Kunci jawaban MCQ/listen per tipe — kata yang sama dari sumber beda
  // (library + bank) tidak boleh jadi soal ganda dalam satu set.
  const usedAns = new Set<string>();

  for (let i = 0; questions.length < limit; i++) {
    const item = usePool[i % usePool.length];
    const type = types[questions.length % types.length];
    const others = allRows.filter((o) => o.id !== item.id && o.meaningId);
    const distractors = shuffle(others).slice(0, 3);
    // MCQ/listen: jawaban sama (teks/arti identik lintas sumber) → lewati.
    // Cloze dikecualikan: jawaban partikel yang sama di kalimat beda itu sah.
    if (
      dedupe &&
      (type === "mcq_en_id"
        ? usedAns.has(`m:${item.meaningId}`)
        : type === "mcq_id_en" || type === "listen"
          ? usedAns.has(`t:${item.text.toLowerCase().trim()}`)
          : false)
    ) {
      if (i > limit * 10) break; // pengaman
      continue;
    }

    if (type === "typing") {
      // Susun Kata JP: pakai kalimat contoh, dipecah jadi token per-kata oleh AI.
      // Kalimat >150 char diskip (chip membludak) → jatuh ke typing biasa.
      if (lang === "ja" && opts.scrambleTokens && item.firstEn) {
        const sentence = item.firstEn.split("\n")[0].trim(); // buang baris romaji
        const tokens = sentence && sentence.length <= 150 ? await segmentJa(sentence) : [];
        if (tokens.length >= 2 && (!dedupe || !usedText.has(sentence))) {
          usedText.add(sentence);
          questions.push({
            itemId: item.id,
            type: "typing",
            prompt: item.meaningId!,
            options: [],
            answer: sentence,
            meaningId: item.meaningId,
            exampleEn: item.firstEn,
            tokens,
          });
          if (i > limit * 10) break; // pengaman
          continue;
        }
      }
      // Ketik frasa dari arti Indonesia — dinilai di server. Jawaban yang
      // sudah keluar di set ini dilewati (pool kecil = item berulang), dan
      // item kepanjangan diskip di SEMUA mode (campur/daily bisa kena typing
      // tanpa filter pool) → loop lanjut, tipe soal dipertahankan.
      const typeAnswer = lang === "ja" ? item.text.trim() : item.text.toLowerCase().trim();
      if (!shortEnough(item.text) || (dedupe && usedText.has(typeAnswer))) {
        if (i > limit * 10) break; // pengaman
        continue;
      }
      usedText.add(typeAnswer);
      // Ketik frasa dari arti Indonesia — dinilai di server.
      questions.push({
        itemId: item.id,
        type: "typing",
        prompt: item.meaningId!,
        options: [],
        answer: typeAnswer,
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
        reading: item.reading,
      });
    } else if (type === "mcq_en_id") {
      const opts2 = shuffle([item.meaningId!, ...distractors.map((d) => d.meaningId!)]);
      usedAns.add(`m:${item.meaningId}`);
      questions.push({
        itemId: item.id,
        type,
        prompt: item.text,
        options: opts2,
        answer: String(opts2.indexOf(item.meaningId!)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    } else if (type === "mcq_id_en") {
      const opts2 = shuffle([item.text, ...distractors.map((d) => d.text)]);
      usedAns.add(`t:${item.text.toLowerCase().trim()}`);
      questions.push({
        itemId: item.id,
        type,
        prompt: item.meaningId!,
        options: opts2,
        answer: String(opts2.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    } else if (type === "cloze") {
      // Mode Pola (forceType cloze): rumpang FUNCTION WORD dari kalimat contoh
      // (partikel JA / preposisi+auxiliary EN) — latihan gramatika eksplisit
      // yang jalan dengan isi library apa pun.
      // matcha: grammar butuh konten pola; function-word cloze = versi tanpa
      // pipeline konten baru (daily mix tidak memaksa cloze → cabang ini aman).
      if (opts.forceType === "cloze" && opts.grammarCloze) {
        const raw = (item.firstEn ?? "").split("\n")[0].trim();
        const candidates =
          lang === "ja" ? FUNCTION_WORDS_JA : FUNCTION_WORDS_EN;
        // JA: partikel panjang diprioritaskan (stabil sort → acak dalam
        // panjang sama) + tolak yang nempel konjugasi/kata. EN: full acak,
        // batas kata (\b) biar tidak motong kata.
        const ordered =
          lang === "ja"
            ? shuffle(candidates).sort((a, b) => b.length - a.length)
            : shuffle(candidates);
        let hit: string | null = null;
        let blanked = raw;
        if (lang === "ja") {
          const found = findJaParticle(raw, ordered);
          if (found) {
            hit = found.hit;
            blanked = raw.slice(0, found.index) + "＿＿＿" + raw.slice(found.index + found.hit.length);
          }
        } else {
          const found = ordered.find((w) => new RegExp(`\\b${w}\\b`, "i").test(raw));
          if (found) {
            hit = found;
            blanked = raw.replace(new RegExp(`\\b${found}\\b`), "_____");
          }
        }
        if (hit && raw) {
          // Tolak kalimat degenerat (blanko tanpa konteks, mis. contoh
          // satu kata) → jatuh ke cloze biasa/MCQ di bawah.
          // matcha: prompt "_____" polos tidak bisa dijawab.
          const cukupKonteks =
            lang === "ja" ? raw.length >= 6 : raw.split(/\s+/).filter(Boolean).length >= 4;
          if (!cukupKonteks) {
            // Lewati cabang grammar, lanjut ke cloze biasa di bawah.
          } else {
          const others = shuffle(candidates.filter((w) => w !== hit)).slice(0, 3);
          if (blanked !== raw && others.length === 3 && (!dedupe || !usedText.has(raw))) {
            usedText.add(raw);
            const opts2 = shuffle([hit, ...others]);
            questions.push({
              itemId: item.id,
              type,
              prompt: blanked,
              options: opts2,
              answer: String(opts2.indexOf(hit)),
              meaningId: item.meaningId,
              exampleEn: item.firstEn,
            });
            if (i > limit * 10) break; // pengaman
            continue;
          }
          } // tutup else cukupKonteks → lanjut cloze biasa
        }
      }
      // Cloze dari KALIMAT CONTOH (sentence mining): rumpang satu kata kunci.
      // Kalimat >25 kata diskip (melelahkan, bukan melatih) → fallback MCQ.
      // Kalimat yang sudah dipakai di set ini diskip (anti-bosan). Baris
      // romaji (contoh JA "kalimat\nromaji") dibuang — bocor bacaan + jelek.
      // matcha: romaji tampil di prompt = spoiler jawaban.
      const sentence = (item.firstEn ?? "").split("\n")[0]!.trim();
      const sentWords = (sentence.match(/[A-Za-z'\u3040-\u30ff\u4e00-\u9faf]+/g) || []).length;
      const re = new RegExp(item.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const blanked = sentence && sentWords <= 25 && (!dedupe || !usedText.has(sentence)) ? sentence.replace(re, "_____") : "";
      // Tolak prompt degenerat (blanko tanpa konteks, mis. contoh == headword).
      const sisaKonteks = blanked.replace(/_____|＿＿＿/g, "").trim();
      const cukupIsi = lang === "ja" ? sisaKonteks.length >= 4 : sisaKonteks.split(/\s+/).filter(Boolean).length >= 3;
      if (!blanked.includes("_____") || !cukupIsi) {
        const opts2 = shuffle([item.meaningId!, ...distractors.map((d) => d.meaningId!)]);
        usedAns.add(`m:${item.meaningId}`);
        questions.push({
          itemId: item.id,
          type: "mcq_en_id",
          prompt: item.text,
          options: opts2,
          answer: String(opts2.indexOf(item.meaningId!)),
          meaningId: item.meaningId,
          exampleEn: item.firstEn,
        });
        continue;
      }
      const opts2 = shuffle([item.text, ...distractors.map((d) => d.text)]);
      usedText.add(sentence);
      questions.push({
        itemId: item.id,
        type: "cloze",
        prompt: blanked,
        options: opts2,
        answer: String(opts2.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: sentence,
      });
    } else {
      const opts2 = shuffle([item.text, ...distractors.map((d) => d.text)]);
      usedAns.add(`t:${item.text.toLowerCase().trim()}`);
      questions.push({
        itemId: item.id,
        type: "listen",
        prompt: naivePronunciation(item.text),
        options: opts2,
        answer: String(opts2.indexOf(item.text)),
        meaningId: item.meaningId,
        exampleEn: item.firstEn,
      });
    }
    if (i > limit * 10) break; // pengaman
  }
  return questions;
}

function modeTitle(mode: QuizMode, day: string, lang: TargetLang = "en"): string {
  const d = new Date(day + "T00:00:00");
  const tgl = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  // Mode JA: tes periodik berlabel JLPT (bukan TOEFL).
  const names: Record<QuizMode, string> =
    lang === "ja"
      ? {
          daily: "Latihan",
          extra: "Latihan Tambahan",
          typing: "Latihan Ketik",
          intens: "Latihan Intens",
          audio: "Latihan Dengar",
          scramble: "Susun Kata",
          mix: "Campur",
          dikte: "Dikte",
          shadow: "Shadowing",
          pola: "Pola Kalimat",
          salah: "Ulas Salah",
          toefl: "Tes JLPT",
          bulanan: "JLPT Bulanan",
        }
      : {
          daily: "Latihan",
          extra: "Latihan Tambahan",
          typing: "Latihan Ketik",
          intens: "Latihan Intens",
          audio: "Latihan Dengar",
          scramble: "Susun Kata",
          mix: "Campur",
          dikte: "Dikte",
          shadow: "Shadowing",
          pola: "Pola Kalimat",
          salah: "Ulas Salah",
          toefl: "TOEFL Test",
          bulanan: "Uji Bulanan",
        };
  if (mode === "toefl") return `${names.toefl} ${day}`;
  if (mode === "bulanan") {
    const [y, m] = day.split("-").map(Number);
    const bulan = new Date(y, (m || 1) - 1, 1).toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric",
    });
    return `${names.bulanan} ${bulan}`;
  }
  return `${names[mode]} ${tgl}`;
}

export function defaultTitle(day: string, lang: TargetLang = "en"): string {
  return modeTitle("daily", day, lang);
}

/** Set bawaan harian (kuis rutin). */
export async function getTodaySet() {
  return getSetForDay("daily", localDayStr(), env.DAILY_QUIZ_SIZE);
}

/** Item yang baru-baru ini dijawab SALAH (14 hari) — bahan mode Ulas Salah.
 * Riset: melatih kesalahan = retensi tertinggi per menit. Tanpa migrasi. */
async function recentWrongItemIds(limit = 60): Promise<number[]> {
  const lang = await getTargetLang();
  const cutoff = Date.now() - 14 * 86_400_000;
  const rows = await db
    .select({ itemId: quizAnswers.itemId })
    .from(quizAnswers)
    .innerJoin(quizSets, eq(quizSets.id, quizAnswers.setId))
    .where(and(eq(quizAnswers.correct, 0), eq(quizSets.lang, lang), sql`${quizAnswers.answeredAt} >= ${cutoff}`))
    .limit(400);
  const freq = new Map<number, number>();
  for (const r of rows) freq.set(r.itemId, (freq.get(r.itemId) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** Set harian per mode (satu per mode per hari). */
export async function getSetForDay(mode: QuizMode, day: string, limit: number, opts: BuildOpts = {}) {
  const lang = await getTargetLang();
  const [existing] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, mode), eq(quizSets.lang, lang)))
    .limit(1);
  if (existing) return existing;

  // Daily = sistematis: due-first + SEMUA skill incl. ketik, urutan rapi.
  // Campur = acak bebas: pool + urutan tipe diacak, tanpa jadwal.
  const ALL_FIVE: QuizQuestion["type"][] = ["mcq_en_id", "mcq_id_en", "cloze", "listen", "typing"];
  const modeOpts: BuildOpts =
    mode === "daily" || mode === "intens" || mode === "salah"
      ? { typeMix: ALL_FIVE }
      : mode === "mix"
        ? { typeMix: ALL_FIVE, shuffledTypes: true, shufflePool: true }
        : {};
  // Ulas Salah: khusus item yang pernah salah (library saja); kosong → pool normal.
  const wrongIds = mode === "salah" ? await recentWrongItemIds() : [];
  const effOpts: BuildOpts = {
    ...opts,
    ...modeOpts,
    ...(wrongIds.length > 0 ? { sources: ["library"] as ("library" | "bank")[], itemIds: wrongIds } : {}),
    // Ulas Salah fokus ke kesalahan — jangan campur materi hafal.
    ...(mode === "salah" ? { recallKnown: false } : {}),
  };

  const questions = await buildQuestions(limit, { ...effOpts, forceType: forceTypeFor(mode), scrambleTokens: mode === "scramble", grammarCloze: mode === "pola" });
  if (questions.length === 0) return null;

  const [created] = await db
    .insert(quizSets)
    .values({
      day,
      mode,
      lang,
      title: modeTitle(mode, day, lang),
      questions: JSON.stringify(questions),
      order: JSON.stringify(questions.map((_, i) => i)),
      total: questions.length,
      done: 0,
      correct: 0,
      completed: 0,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, mode), eq(quizSets.lang, lang)))
    .limit(1);
  return again ?? null;
}

/** Set tambahan dibuat manual (tombol "Generate") — selalu set baru, boleh >1 per hari. */
export async function createExtraSet(
  mode: Exclude<QuizMode, "daily">,
  limit: number,
  opts: BuildOpts = {},
) {
  const ALL_FIVE: QuizQuestion["type"][] = ["mcq_en_id", "mcq_id_en", "cloze", "listen", "typing"];
  const modeOpts: BuildOpts =
    mode === "intens"
      ? { typeMix: ALL_FIVE }
      : mode === "mix"
        ? { typeMix: ALL_FIVE, shuffledTypes: true, shufflePool: true }
        : {};
  const questions = await buildQuestions(limit, { ...opts, ...modeOpts, forceType: forceTypeFor(mode), scrambleTokens: mode === "scramble", grammarCloze: mode === "pola" });
  if (questions.length === 0) return null;
  const today = localDayStr();
  const lang = await getTargetLang();

  // Slot (day, mode) unik di DB — kalau udah kepakai, pakai suffix #n biar
  // generate kedua/ketiga gak 500. Urutan ronde tetap masuk riwayat.
  for (let attempt = 0; attempt < 10; attempt++) {
    const day = attempt === 0 ? today : `${today}#${attempt + 1}`;
    const title = `${modeTitle(mode, today, lang)} — ekstra${attempt > 0 ? ` ${attempt + 1}` : ""}`;
    try {
      const [created] = await db
        .insert(quizSets)
        .values({
          day,
          mode,
          lang,
          title,
          questions: JSON.stringify(questions),
          order: JSON.stringify(questions.map((_, i) => i)),
          total: questions.length,
          done: 0,
          correct: 0,
          completed: 0,
          createdAt: Date.now(),
        })
        .returning();
      return created ?? null;
    } catch {
      /* slot kepakai → coba suffix berikutnya */
    }
  }
  return null;
}

/** Ambil set by id (mode tambahan bisa dibuat kapan pun). */
export async function getSetById(id: number) {
  const [row] = await db.select().from(quizSets).where(eq(quizSets.id, id)).limit(1);
  return row ?? null;
}

/** Jawab soal by id set (semua mode). */
export async function answerQuestionById(
  setId: number,
  index: number, correct: boolean,
  typedText?: string,
) {
  const [set] = await db.select().from(quizSets).where(eq(quizSets.id, setId)).limit(1);
  if (!set) return { ok: false as const, error: "Set tidak ada" };

  const questions = JSON.parse(set.questions) as QuizQuestion[];

  // Mode typing dinilai dari teks yang diketik. Normalisasi beda per bahasa:
  // EN buang semua kecuali huruf/angka; JA hanya rapikan spasi & full-width.
  // Scoring ulang HANYA kalau ada teks kiriman non-kosong: mode susun kata /
  // shadow tidak pakai state `typed` (chip / tombol selesai) → client kirim ""
  // dan nilai client dipercaya. Tanpa guard ini SEMUA jawaban scramble/shadow
  // dinilai salah → benar stuck 0 + soal diulang-ulang via requeue.
  // matcha: typed "" bukan jawaban kosong, melainkan "tidak applicable".
  let isCorrect = correct;
  if (questions[index]?.type === "typing" && typeof typedText === "string" && typedText.trim().length > 0) {
    const normJa = (s: string) =>
      s
        .replace(/\u3000/g, " ")
        .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/\s+/g, " ")
        .trim();
    if (set.lang === "ja") {
      // JP: bandingkan tanpa spasi sama sekali (Susun Kata join pakai spasi,
      // kalimat Jepang asli nggak ada spasi) + rapikan full-width.
      isCorrect =
        normJa(typedText).replace(/\s+/g, "") ===
        normJa(questions[index].answer).replace(/\s+/g, "");
    } else {
      isCorrect =
        typedText.toLowerCase().replace(/[^a-z0-9' ]/g, "").trim() ===
        questions[index].answer.replace(/[^a-z0-9' ]/g, "").trim();
    }
  }

  return applyAnswer(set, questions, index, isCorrect);
}

/** Kompatibilitas: jawab by day (mode daily). */
export async function answerQuestion(day: string, index: number, correct: boolean) {
  const [set] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.day, day), eq(quizSets.mode, "daily")))
    .limit(1);
  if (!set) return { ok: false as const, error: "Set tidak ada" };
  const questions = JSON.parse(set.questions) as QuizQuestion[];
  return applyAnswer(set, questions, index, correct);
}

async function applyAnswer(
  set: typeof quizSets.$inferSelect,
  questions: QuizQuestion[],
  index: number,
  correct: boolean,
) {
  if (set.completed) return { ok: false as const, error: "Set sudah selesai" };
  const order = JSON.parse(set.order) as number[];

  await db.transaction(async (tx) => {
    await tx.insert(quizAnswers)
      .values({ setId: set.id, day: set.day, questionIndex: index, itemId: questions[index]?.itemId ?? 0, correct: correct ? 1 : 0, answeredAt: Date.now() })
      .onConflictDoNothing();
    await tx.update(quizSets)
      .set({
        done: set.done + 1,
        correct: set.correct + (correct ? 1 : 0),
      })
      .where(eq(quizSets.id, set.id));

    if (!correct) {
      // Selipkan ulang soal yang salah ±5 posisi dari posisi sekarang.
      const reinsertAt = Math.min(order.length, index + 1 + 4 + Math.floor(Math.random() * 3));
      const nextOrder = [...order];
      nextOrder.splice(reinsertAt, 0, index);
      await tx.update(quizSets)
        .set({ order: JSON.stringify(nextOrder) })
        .where(eq(quizSets.id, set.id));
    }
  });

  // FSRS tetap dicatat per item.
  const itemId = questions[index]?.itemId;
  if (itemId) {
    const { applyRating } = await import("~/lib/fsrs.server");
    const { getItemDetail, applyReview } = await import("~/lib/items.server");
    const detail = await getItemDetail(itemId);
    if (detail?.card) {
      const rating = correct ? 3 : 1;
      const row = {
        itemId,
        due: detail.card.due,
        stability: detail.card.stability,
        difficulty: detail.card.difficulty,
        elapsedDays: detail.card.elapsedDays,
        scheduledDays: detail.card.scheduledDays,
        reps: detail.card.reps,
        lapses: detail.card.lapses,
        state: detail.card.state,
        learningSteps: detail.card.learningSteps,
        lastReview: detail.card.lastReview,
      };
      const next = applyRating(row, rating as 1 | 2 | 3 | 4);
      await applyReview(itemId, rating as 1 | 2 | 3 | 4, "quiz", next);
    }
  }

  const [after] = await db.select().from(quizSets).where(eq(quizSets.id, set.id)).limit(1);
  const newOrder = JSON.parse(after!.order) as number[];
  const finished = after!.done >= newOrder.length;
  if (finished && !after!.completed) {
    await db.update(quizSets).set({ completed: 1 }).where(eq(quizSets.id, after!.id));
  }
  return { ok: true as const, set: after!, finished };
}

/** Tandai item sudah hafal langsung dari soal. */
export async function markItemKnownFromQuiz(itemId: number) {
  await db.update(items).set({ status: "known" }).where(eq(items.id, itemId));
}

/** Riwayat latihan (untuk halaman review). */
export async function getHistory(limit = 14) {
  return db.select().from(quizSets).orderBy(desc(quizSets.day)).limit(limit);
}

/** Bel: set harian (daily) belum selesai? */
export async function pendingToday(): Promise<{ total: number; done: number; completed: boolean } | null> {
  const set = await getTodaySet();
  if (!set) return null;
  const order = JSON.parse(set.order) as number[];
  return { total: order.length, done: set.done, completed: Boolean(set.completed) };
}

/**
 * Streak latihan: hari beruntun dengan ≥1 set selesai (mode latihan apa pun,
 * periodic ikut dihitung). Tanpa migrasi — dihitung dari quiz_sets.
 */
export async function getStreak(): Promise<{ days: number; todayDone: boolean }> {
  const lang = await getTargetLang();
  const rows = await db
    .select({ day: quizSets.day, completed: quizSets.completed })
    .from(quizSets)
    .where(and(eq(quizSets.lang, lang), eq(quizSets.completed, 1)))
    .orderBy(desc(quizSets.day))
    .limit(400);
  const doneDays = new Set(rows.map((r) => r.day));
  const today = localDayStr();
  let days = 0;
  const d = new Date(today + "T00:00:00");
  // Mulai dari kemarin kalau hari ini belum ada yang selesai (streak tetap hidup).
  if (!doneDays.has(today)) d.setDate(d.getDate() - 1);
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!doneDays.has(key)) break;
    days++;
    d.setDate(d.getDate() - 1);
    if (days > 365) break;
  }
  return { days, todayDone: doneDays.has(today) };
}

/** Antrian flashcard: kartu due + kartu baru hari ini (dengan contoh & catatan). */
export async function getFlashQueue(limit = 30) {
  const today = localDayStr();
  const dayStart = new Date(today + "T00:00:00+07:00").getTime();
  const dayEnd = dayStart + 86_400_000;
  const lang = await getTargetLang();
  // Contoh TERPENDEK + terjemahannya (pasangan) — contoh panjang melelahkan
  // tampil di kartu/soal. matcha: contoh ledger 10 kata selalu tampil pertama.
  const firstEn = sql<string | null>`(SELECT en FROM examples WHERE item_id = items.id ORDER BY length(en), id LIMIT 1)`;
  const firstId = sql<string | null>`(SELECT id_text FROM examples WHERE item_id = items.id ORDER BY length(en), id LIMIT 1)`;
  const dueRows = await db
    .select({
      itemId: items.id,
      text: items.text,
      reading: items.reading,
      meaningId: items.meaningId,
      notesId: items.notesId,
      firstEn,
      firstId,
      due: cards.due,
      reps: cards.reps,
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(eq(items.status, "learning"), eq(items.lang, lang), sql`${cards.due} < ${Date.now()}`))
    .orderBy(cards.due)
    .limit(limit);
  const newRows = await db
    .select({
      itemId: items.id,
      text: items.text,
      reading: items.reading,
      meaningId: items.meaningId,
      notesId: items.notesId,
      firstEn,
      firstId,
      due: cards.due,
      reps: cards.reps,
    })
    .from(cards)
    .innerJoin(items, eq(items.id, cards.itemId))
    .where(and(eq(items.status, "learning"), eq(items.lang, lang), sql`${cards.due} >= ${dayStart}`, sql`${cards.due} < ${dayEnd}`, eq(cards.reps, 0)))
    .limit(Math.max(0, limit - dueRows.length));
  return [...dueRows, ...newRows];
}

/**
 * Set periodik (TOEFL mingguan / Uji Bulanan) — SATU per periode, hari = kunci periode.
 * toefl: 40 soal 3 section (Structure 15 → Vocabulary 15 → Listening 10), timer di client.
 * bulanan: 50 soal campuran + typing, tersedia mulai tgl 25.
 */
export async function getPeriodicSet(mode: "toefl" | "bulanan") {
  const lang = await getTargetLang();
  if (mode === "toefl") {
    const week = isoWeekKey();
    const [existing] = await db
      .select()
      .from(quizSets)
      .where(and(eq(quizSets.mode, "toefl"), eq(quizSets.day, week), eq(quizSets.lang, lang)))
      .limit(1);
    if (existing) return existing;

    // Section 1: Structure (cloze) → Section 2: Vocabulary (mcq) → Section 3: Listening.
    const structure = await buildQuestions(15, { forceType: "cloze" });
    const vocab = await buildQuestions(15, {
      forceType: "mcq_en_id",
      typeMix: ["mcq_en_id", "mcq_id_en"],
    });
    const listening = await buildQuestions(10, { forceType: "listen" });
    const questions = [...structure, ...vocab, ...listening];
    if (questions.length < 10) return null; // kosakata belum cukup buat tes

    const [created] = await db
      .insert(quizSets)
      .values({
        day: week,
        mode: "toefl",
        lang,
        title: modeTitle("toefl", week, lang),
        questions: JSON.stringify(questions),
        order: JSON.stringify(questions.map((_, i) => i)),
        total: questions.length,
        done: 0,
        correct: 0,
        completed: 0,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [again] = await db
      .select()
      .from(quizSets)
      .where(and(eq(quizSets.mode, "toefl"), eq(quizSets.day, week), eq(quizSets.lang, lang)))
      .limit(1);
    return again ?? null;
  }

  // Bulanan — hanya dibuat setelah tgl 25 (muncul + notif di bel).
  const month = monthKey();
  if (dayOfMonth() < 25) return null;
  const [existing] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.mode, "bulanan"), eq(quizSets.day, month), eq(quizSets.lang, lang)))
    .limit(1);
  if (existing) return existing;

  const mix = await buildQuestions(40, {});
  const typing = await buildQuestions(10, { forceType: "typing" });
  const questions = [...mix, ...typing];
 if (questions.length < 10) return null;

  const [created] = await db
    .insert(quizSets)
    .values({
      day: month,
      mode: "bulanan",
      lang,
      title: modeTitle("bulanan", month, lang),
      questions: JSON.stringify(questions),
      order: JSON.stringify(questions.map((_, i) => i)),
      total: questions.length,
      done: 0,
      correct: 0,
      completed: 0,
      createdAt: Date.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(quizSets)
    .where(and(eq(quizSets.mode, "bulanan"), eq(quizSets.day, month), eq(quizSets.lang, lang)))
    .limit(1);
  return again ?? null;
}

/** Badge periodik untuk bel notifikasi: tes minggu/bulan ini sudah selesai? */
export async function periodicStatus() {
  const lang = await getTargetLang();
  const [toefl] = await db
    .select({ id: quizSets.id, done: quizSets.done, completed: quizSets.completed })
    .from(quizSets)
    .where(and(eq(quizSets.mode, "toefl"), eq(quizSets.day, isoWeekKey()), eq(quizSets.lang, lang)))
    .limit(1);
  const available = dayOfMonth() >= 25;
  const [bulanan] = await db
    .select({ id: quizSets.id, done: quizSets.done, completed: quizSets.completed })
    .from(quizSets)
    .where(and(eq(quizSets.mode, "bulanan"), eq(quizSets.day, monthKey()), eq(quizSets.lang, lang)))
    .limit(1);
  return {
    toefl: {
      week: isoWeekKey(),
      exists: Boolean(toefl),
      setId: toefl?.id ?? null,
      done: toefl?.done ?? 0,
      completed: Boolean(toefl?.completed),
    },
    bulanan: {
      month: monthKey(),
      available,
      exists: Boolean(bulanan),
      setId: bulanan?.id ?? null,
      done: bulanan?.done ?? 0,
      completed: Boolean(bulanan?.completed),
    },
  };
}

/** Ronde minigame Match: 5 ronde × 4 pasangan kata-arti dari kosakata yang dipelajari. */
export type MatchPair = { itemId: number; word: string; meaning: string };

export async function getMatchRounds(rounds = 5, perRound = 4): Promise<MatchPair[][]> {
  const rows = (
    await db
      .select({ id: items.id, text: items.text, meaningId: items.meaningId })
      .from(items)
      .where(and(eq(items.status, "learning"), eq(items.lang, await getTargetLang()), sql`${items.meaningId} IS NOT NULL`))
      .limit(200)
  ).map((r) => ({ itemId: r.id, word: r.text, meaning: r.meaningId! }));
  if (rows.length < perRound) return [];

  const shuffled = shuffle(rows);
  const out: MatchPair[][] = [];
  let cursor = 0;
  for (let i = 0; i < rounds; i++) {
    const round: MatchPair[] = [];
    for (let j = 0; j < perRound; j++) {
      if (cursor >= shuffled.length) cursor = 0;
      round.push(shuffled[cursor++]);
    }
    out.push(round);
  }
  return out;
}

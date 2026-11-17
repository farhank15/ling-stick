import themesFile from "../../data/kanji-study-themes.json";
import studyN4 from "../../data/kanji-study-n4.json";
import studyN5 from "../../data/kanji-study-n5.json";

/**
 * Urutan belajar N5 + notasi bacaan KANJIDIC.
 *
 * Tema & urutan = kurasi di data/kanji-study-n5.json + n4.json (bukan API —
 * tak ada sumber publik yang menyediakan urutan/tema JLPT). Daftar tema di
 * data/kanji-study-themes.json. Radikal = data resmi kanji-levels.json;
 * dipakai untuk mode "pola" (kanji berbagi radikal).
 */

export type StudyTheme = {
  id: string;
  label: string;
  hint: string;
  order: number;
};

export type StudyEntry = {
  theme: string;
  order: number;
  radical: string;
};

/** Hasil pecah bacaan KANJIDIC: "ひと.つ" / "ひと-" / "-び". */
export type ReadingPart = {
  stem: string;
  okurigana: string | null;
  affix: "prefix" | "suffix" | null;
  raw: string;
};

export type StudyGroup<T> = {
  key: string;
  label: string;
  hint: string;
  rows: T[];
};

const ENTRIES: Record<string, StudyEntry> = {
  ...(studyN5.kanji as Record<string, StudyEntry>),
  ...(studyN4.kanji as Record<string, StudyEntry>),
};
const THEMES = [...(themesFile.themes as StudyTheme[])].sort((a, b) => a.order - b.order);

export const STUDY_THEMES: readonly StudyTheme[] = THEMES;

export function studyEntry(char: string): StudyEntry | null {
  return ENTRIES[char] ?? null;
}

export function themeOf(char: string): StudyTheme | null {
  const entry = ENTRIES[char];
  if (!entry) return null;
  return THEMES.find((t) => t.id === entry.theme) ?? null;
}

/**
 * KANJIDIC2 (DTD v1.6): okurigana dipisah ".", afiks ditandai "-".
 * Strip kiri = akhiran (menempel di belakang kanji lain, mis. 日曜日 -び);
 * strip kanan = awalan (menempel di depan, mis. 一休み ひと-).
 */
export function parseReading(raw: string): ReadingPart {
  const value = raw.trim();
  let body = value;
  let affix: ReadingPart["affix"] = null;
  if (body.startsWith("-")) {
    affix = "suffix";
    body = body.slice(1);
  } else if (body.endsWith("-")) {
    affix = "prefix";
    body = body.slice(0, -1);
  }
  const dot = body.indexOf(".");
  if (dot === -1) return { stem: body, okurigana: null, affix, raw: value };
  const stem = body.slice(0, dot);
  const okurigana = body.slice(dot + 1);
  if (!stem || !okurigana) return { stem: value, okurigana: null, affix: null, raw: value };
  return { stem, okurigana, affix, raw: value };
}

/** Katakana → hiragana — untuk mencocokkan bacaan on dengan reading vocab. */
export function toHiragana(text: string): string {
  return [...text]
    .map((c) => {
      const cp = c.codePointAt(0)!;
      return cp >= 0x30a1 && cp <= 0x30f6 ? String.fromCodePoint(cp - 0x60) : c;
    })
    .join("");
}

/** Varian tampilan radikal klasik → bentuk yang dikenal (辵 → 辶). */
const RADICAL_DISPLAY: Record<string, string> = {
  辵: "辶",
  艸: "艹",
  巛: "川",
  襾: "西",
  阜: "阝",
  毋: "母",
  曰: "日",
  气: "気",
};

export function radicalLabel(radical: string): string {
  return RADICAL_DISPLAY[radical] ?? radical;
}

function byStrokes<T extends { char: string; strokes?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.strokes ?? 99) - (b.strokes ?? 99));
}

/** Kelompokkan per tema kurasi; kanji tanpa tema (N4+) masuk "Belum bertema". */
export function groupByTheme<T extends { char: string }>(rows: T[]): StudyGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const id = ENTRIES[row.char]?.theme ?? "lain";
    const list = buckets.get(id) ?? [];
    list.push(row);
    buckets.set(id, list);
  }
  const groups: StudyGroup<T>[] = [];
  for (const theme of THEMES) {
    const list = buckets.get(theme.id);
    if (!list?.length) continue;
    list.sort((a, b) => (ENTRIES[a.char]?.order ?? 999) - (ENTRIES[b.char]?.order ?? 999));
    groups.push({ key: theme.id, label: theme.label, hint: theme.hint, rows: list });
  }
  const rest = buckets.get("lain");
  if (rest?.length) {
    groups.push({
      key: "lain",
      label: "Belum bertema",
      hint: "Level ini belum punya kurasi tema — pakai urutan frekuensi.",
      rows: byStrokes(rest),
    });
  }
  return groups;
}

const IS_CJK = /[\u4e00-\u9faf]/;

/**
 * Kelompokkan per POLA BENTUK (komponen penyusun). Berbeda dari versi lama
 * yang cuma pakai 1 radikal resmi per kanji (mis. 安 ber-radikal 宀 padahal
 * mengandung 女) — versi ini memakai dekomposisi komponen penuh (KRad):
 * - Sebuah kanji tampil di SEMUA keluarga yang memuat komponennya
 *   (multi-membership), anggota primer (kanji itu sendiri / radikal resmi)
 *   diletakkan paling depan.
 * - Keluarga = komponen CJK dengan >=2 anggota; diurutkan menurun. Sisanya
 *   (komponen/frekuensi 1 atau tanpa data) digabung ke bucket "__single".
 */
export function groupByRadical<
  T extends { char: string; strokes?: number; components?: readonly string[] },
>(rows: T[]): StudyGroup<T>[] {
  const compOf = (r: T): string[] => {
    if (r.components && r.components.length > 0) return r.components.filter((c) => IS_CJK.test(c));
    const rad = ENTRIES[r.char]?.radical;
    return rad ? [rad] : [];
  };
  const primaryOf = (r: T): string | null => ENTRIES[r.char]?.radical ?? r.components?.[0] ?? null;

  // Frekuensi komponen di set yang sedang ditampilkan.
  const freq = new Map<string, number>();
  for (const r of rows) for (const p of compOf(r)) freq.set(p, (freq.get(p) ?? 0) + 1);
  const keys = [...freq.entries()].filter(([, n]) => n >= 2).map(([k]) => k);

  const byStrokesJa = (a: T, b: T) =>
    (a.strokes ?? 99) - (b.strokes ?? 99) || a.char.localeCompare(b.char, "ja");
  const families: StudyGroup<T>[] = keys.map((key) => {
    const members = rows.filter((r) => compOf(r).includes(key));
    const primary = members.filter((r) => r.char === key || primaryOf(r) === key);
    const secondary = members.filter((r) => !primary.includes(r));
    return {
      key,
      label: `Pola ${radicalLabel(key)}`,
      hint: `${members.length} kanji memuat pola ini — hafal satu bentuk, sisanya lebih mudah.`,
      rows: [...primary.sort(byStrokesJa), ...secondary.sort(byStrokesJa)],
    };
  });
  families.sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key, "ja"));

  const placed = new Set(families.flatMap((f) => f.rows));
  const singles = rows.filter((r) => !placed.has(r));
  if (singles.length) {
    families.push({
      key: "__single",
      label: "Belum punya keluarga",
      hint: "Komponen belum dipetakan, atau belum muncul di kanji lain pada level ini.",
      rows: byStrokes(singles),
    });
  }
  return families;
}

/* ── Pencarian kanji ──────────────────────────────────────────────────────
 * Satu kotak cari harus bisa menerima 4 jenis input: karakter kanji, arti
 * Indonesia, kana, dan romaji. Romaji diturunkan dari bacaan (Hepburn
 * sederhana) supaya user yang mengetik di keyboard Latin tetap dapat hasil.
 * matcha: tanpa romaji, "gakkou" tak match apa pun — user harus hafal kana.
 */

/** Hiragana → romaji Hepburn sederhana (cukup untuk pencarian, bukan furigana). */
const ROMAJI_TABLE: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゔ: "vu",
};

/** Yōon: kana i-kolom + ゃ/ゅ/ょ kecil = satu bunyi (きゃ → kya). */
const YOON: Record<string, [string, string, string]> = {
  き: ["kya", "kyu", "kyo"], ぎ: ["gya", "gyu", "gyo"],
  し: ["sha", "shu", "sho"], じ: ["ja", "ju", "jo"],
  ち: ["cha", "chu", "cho"],
  に: ["nya", "nyu", "nyo"], ひ: ["hya", "hyu", "hyo"],
  び: ["bya", "byu", "byo"], ぴ: ["pya", "pyu", "pyo"],
  み: ["mya", "myu", "myo"], り: ["rya", "ryu", "ryo"],
};
const SMALL_YOON = ["ゃ", "ゅ", "ょ"];

export function kanaToRomaji(kana: string): string {
  const chars = [...toHiragana(kana)];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const next = chars[i + 1];
    if (c === "っ") {
      // Sokuon: gandakan konsonan berikutnya (がっこう → gakkou).
      const after = ROMAJI_TABLE[next ?? ""] ?? "";
      if (!after) continue;
      out += after.startsWith("ch") ? "t" : after[0];
      continue;
    }
    if (c === "ー") {
      out += out.slice(-1);
      continue;
    }
    const yoonIdx = next ? SMALL_YOON.indexOf(next) : -1;
    const yoon = YOON[c];
    if (yoon && yoonIdx >= 0) {
      out += yoon[yoonIdx];
      i++;
      continue;
    }
    out += ROMAJI_TABLE[c] ?? c;
  }
  return out;
}

export type KanjiSearchRow = {
  char: string;
  meaningId: string;
  readings?: readonly string[];
};

/** Buang notasi KANJIDIC (titik/strip), NFKC, dan samakan katakana → hiragana. */
export function normalizeQuery(raw: string): string {
  return toHiragana(raw.trim().toLowerCase().normalize("NFKC").replace(/[.\-\s]/g, ""));
}

/** Cocokkan satu baris kanji dengan kata kunci (char / arti / kana / romaji). */
export function matchesKanji(row: KanjiSearchRow, rawQuery: string): boolean {
  const q = normalizeQuery(rawQuery);
  if (!q) return true;
  if (row.char === q) return true;
  if (row.meaningId.toLowerCase().includes(q)) return true;
  return (row.readings ?? []).some((reading) => {
    const kana = normalizeQuery(reading);
    return kana.includes(q) || kanaToRomaji(kana).includes(q);
  });
}

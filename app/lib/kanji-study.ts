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

/**
 * Kelompokkan per radikal (pola bentuk). Keluarga >=2 tampil dulu, urut
 * jumlah anggota; sisanya digabung supaya tidak jadi puluhan section.
 */
export function groupByRadical<T extends { char: string; strokes?: number }>(
  rows: T[],
): StudyGroup<T>[] {
  const buckets = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const row of rows) {
    const radical = ENTRIES[row.char]?.radical;
    if (!radical) {
      // Level lain belum punya kurasi radikal — jangan bikin grup "Radikal ?".
      unassigned.push(row);
      continue;
    }
    const list = buckets.get(radical) ?? [];
    list.push(row);
    buckets.set(radical, list);
  }
  const families = [...buckets.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ja"));
  const groups: StudyGroup<T>[] = families.map(([radical, list]) => ({
    key: radical,
    label: `Radikal ${radicalLabel(radical)}`,
    hint: `${list.length} kanji memakai radikal ini — hafal satu pola, sisanya lebih mudah.`,
    rows: byStrokes(list),
  }));
  const singles = [
    ...[...buckets.values()].filter((list) => list.length === 1).flatMap((list) => list),
    ...unassigned,
  ];
  if (singles.length) {
    groups.push({
      key: "__single",
      label: "Belum punya keluarga",
      hint: "Radikal belum dipetakan, atau belum muncul di kanji lain pada level ini.",
      rows: byStrokes(singles),
    });
  }
  return groups;
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

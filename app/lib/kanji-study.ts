import study from "../../data/kanji-study-n5.json";

/**
 * Urutan belajar N5 + notasi bacaan KANJIDIC.
 *
 * Tema & urutan = kurasi di data/kanji-study-n5.json (bukan API — tak ada
 * sumber publik yang menyediakan urutan/tema JLPT). Radikal = data resmi
 * kanji-levels.json; dipakai untuk mode "pola" (kanji berbagi radikal).
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

const ENTRIES = study.kanji as Record<string, StudyEntry>;
const THEMES = [...(study.themes as StudyTheme[])].sort((a, b) => a.order - b.order);

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

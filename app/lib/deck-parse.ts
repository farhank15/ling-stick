/** Parse TSV/CSV klien untuk impor deck — murni, testable, tanpa dep. */

export function parseTable(raw: string): string[][] {
  const lines = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  // Deteksi delimiter dari baris pertama: tab menang, koma fallback.
  const head = lines[0]!;
  const delim = head.includes("\t") ? "\t" : ",";
  return lines.map((l) => (delim === "\t" ? l.split("\t") : l.split(",").map((c) => c.trim())));
}

export type ColMap = "skip" | "text" | "reading" | "meaningId" | "type" | "level" | "extra";

/** Tebakan mapping awal: kolom JP/kana pertama → text, dst. */
export function guessMap(rows: string[][]): ColMap[] {
  const first = rows[0] ?? [];
  let meaningSet = false;
  return first.map((cell, i) => {
    if (i === 0) return "text";
    if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(cell))
      return /[\u4e00-\u9faf]/.test(first[0] ?? "") ? "reading" : "text";
    if (!meaningSet) {
      meaningSet = true;
      return "meaningId";
    }
    return "extra";
  });
}

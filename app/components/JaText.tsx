import { useState } from "react";
import { Type } from "lucide-react";

/**
 * JaText — cara tampilin kata/kalimat Jepang di seluruh app (BLUEPRINT mode JA):
 * - Kanji dapat furigana hiragana REDUP di atasnya (ruby per-run, bukan flat).
 * - Kana murni (hiragana/katakana) TANPA furigana — gak dikasih apa-apa.
 * - Romaji disembunyikan di-balik icon toggle: klik → muncul di bawah, default hidden.
 * - Arti Indonesia dirender pemanggil (di bawah komponen ini) biar fleksibel.
 * Fallback aman: teks Latin/kosong dirender polos; kalau alignment furigana
 * gak cocok, seluruh reading ditampilkan redup di atas teks (tetap kebaca).
 */

const KANJI_RE = /[\u4e00-\u9faf\u3005\u3007]/;
const KANA_RE = /[\u3040-\u30ff]/;

/** Ada kana/kanji di teks? */
export function hasJa(text: string | null | undefined): boolean {
  return Boolean(text && (KANA_RE.test(text) || KANJI_RE.test(text)));
}

/** Pisah reading gabungan "かな (romaji)" → { kana, romaji }. Format kana doang juga bisa. */
export function splitReading(reading: string | null | undefined): { kana: string; romaji: string } {
  const s = (reading ?? "").trim();
  if (!s) return { kana: "", romaji: "" };
  const m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { kana: m[1]!.trim(), romaji: m[2]!.trim() };
  // Reading Latin murni (bukan kana) dianggap romaji.
  if (!hasJa(s)) return { kana: "", romaji: s };
  return { kana: s, romaji: "" };
}

export type JaSegment = { base: string; ruby?: string };

/**
 * Petakan furigana per-run: kanji run dapat potongan kana dari reading,
 * kana di teks dikonsumsi langsung dari reading (harus cocok berurutan).
 * Gak cocok → fallback: satu run dengan seluruh reading di atas.
 */
export function buildRuby(text: string, reading: string | null | undefined): JaSegment[] {
  const { kana } = splitReading(reading);
  if (!hasJa(text) || !kana) return [{ base: text }];
  // Harus hanya terdiri dari kanji/kana (tanpa latin/tanda aneh) biar alignment bisa dipercaya.
  for (const ch of text) {
    if (!KANJI_RE.test(ch) && !KANA_RE.test(ch)) return [{ base: text, ruby: kana }];
  }

  // Parse jadi run kanji & run kana.
  const runs: { kind: "kanji" | "kana"; text: string }[] = [];
  for (const ch of text) {
    const kind = KANJI_RE.test(ch) ? "kanji" : "kana";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += ch;
    else runs.push({ kind, text: ch });
  }

  const segments: JaSegment[] = [];
  let rp = 0; // pointer di reading
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (run.kind === "kanji") {
      // Run terakhir → sisanya; kalau ada run kana berikutnya → potong di kana pertama run itu.
      const nextKanaRun = runs.slice(i + 1).find((r) => r.kind === "kana");
      let end = kana.length;
      if (nextKanaRun) {
        const idx = kana.indexOf(nextKanaRun.text[0]!, rp);
        if (idx === -1) return [{ base: text, ruby: kana }];
        end = idx;
      }
      segments.push({ base: run.text, ruby: kana.slice(rp, end) });
      rp = end;
    } else {
      for (const ch of run.text) {
        if (kana[rp] !== ch) return [{ base: text, ruby: kana }];
        segments.push({ base: ch });
        rp += 1;
      }
    }
  }
  return segments;
}

type JaTextProps = {
  text: string;
  /** kana, atau gabungan "かな (romaji)" — format dari wordbank/seed. */
  reading?: string | null;
  /** Override romaji (mis. dari GenResult.romaji terpisah). */
  romaji?: string | null;
  /** Class untuk teks utama (ukuran/weight). */
  className?: string;
  /** Class baris romaji yang muncul saat toggle dinyalain. */
  romajiClassName?: string;
  /** Romaji langsung kelihatan? Default hidden (belajar baca dulu). */
  defaultShowRomaji?: boolean;
  /** Icon toggle romaji ditampilin? Matikan di baris list yang padat (mis. list Bank)
   *  biar gak penuh icon — pasang versi ber-icon di area detail. Default true. */
  romajiToggle?: boolean;
};

export function JaText({
  text,
  reading,
  romaji: romajiProp,
  className = "",
  romajiClassName = "text-xs font-normal text-zinc-400 dark:text-zinc-500",
  defaultShowRomaji = false,
  romajiToggle = true,
}: JaTextProps) {
  const [showRomaji, setShowRomaji] = useState(defaultShowRomaji);
  const { kana, romaji: romajiFromReading } = splitReading(reading);
  const romaji = (romajiProp || romajiFromReading || "").trim();

  // Bukan teks Jepang → polos aja (komponen ini aman buat EN juga).
  if (!hasJa(text)) return <span className={className}>{text}</span>;

  const segments = buildRuby(text, kana);
  return (
    <span className="inline-block align-middle">
      <span className="inline-flex flex-wrap items-end gap-x-0.5 leading-tight">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex flex-col items-center">
            {s.ruby ? (
              <span
                aria-hidden
                className="text-[0.52em] font-normal leading-none text-zinc-400 dark:text-zinc-500"
              >
                {s.ruby}
              </span>
            ) : null}
            <span>{s.base}</span>
          </span>
        ))}
      </span>
      {romaji && romajiToggle ? (
        <>
          <button
            type="button"
            className="ml-1 inline-flex shrink-0 rounded p-0.5 align-middle text-zinc-300 opacity-80 hover:bg-zinc-100 hover:text-teal-600 hover:opacity-100 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-teal-400"
            title={showRomaji ? "Sembunyikan romaji" : "Tampilkan romaji"}
            aria-label={showRomaji ? "Sembunyikan romaji" : "Tampilkan romaji"}
            onClick={(e) => {
              e.stopPropagation();
              setShowRomaji((v) => !v);
            }}
          >
            <Type className="h-3 w-3" strokeWidth={2} />
          </button>
          {showRomaji ? <span className={`block ${romajiClassName}`}>{romaji}</span> : null}
        </>
      ) : null}
    </span>
  );
}

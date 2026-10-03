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
 * Petakan furigana PER-RUN: kanji run dapat potongan kana dari reading di atasnya;
 * kana yang ada DI TEKS udah bisa dibaca sendiri → TANPA ruby (jangan dikasih
 * hiragana di atas hiragana). Tanda baca/karakter aneh di-skip dua sisi.
 * Alignment gagal → POLOS tanpa ruby (lebih baik kehilangan furigana daripada
 * satu gumpalan hiragana ngumpul di atas).
 */
export function buildRuby(text: string, reading: string | null | undefined): JaSegment[] {
  const { kana } = splitReading(reading);
  if (!hasJa(text) || !kana) return [{ base: text }];
  // Kalau teks = kana murni (tanpa kanji), gak perlu furigana sama sekali.
  if (!KANJI_RE.test(text)) return [{ base: text }];

  // Teks dipecah per run kanji / run non-kanji (kana, tanda baca, latin, dsb).
  const runs: { kind: "kanji" | "other"; text: string }[] = [];
  for (const ch of text) {
    const kind = KANJI_RE.test(ch) ? "kanji" : "other";
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.text += ch;
    else runs.push({ kind, text: ch });
  }

  // Karakter kana yang BISA dipakai alignment (bukan tanda baca/pemisah).
  const isAlignable = (ch: string) => KANA_RE.test(ch) && !/[\u3000-\u303f\u30fb\u30fc\uff01-\uff65]/.test(ch);

  const segments: JaSegment[] = [];
  let rp = 0; // pointer di reading
  let ok = true;
  for (let i = 0; i < runs.length && ok; i++) {
    const run = runs[i]!;
    if (run.kind === "kanji") {
      // Batas run kanji: kana alignable pertama di reading setelah posisi sekarang.
      let end = kana.length;
      for (let j = i + 1; j < runs.length; j++) {
        const nx = runs[j]!;
        if (nx.kind === "kanji") continue;
        const probe = [...nx.text].find(isAlignable);
        if (probe) {
          const idx = kana.indexOf(probe, rp);
          if (idx === -1) {
            ok = false;
            break;
          }
          end = idx;
        }
        break;
      }
      if (!ok) break;
      let ruby = kana.slice(rp, end);
      // Tanda baca di tepi ruby bukan bagian bacaan kanji (itu punya run sendiri di teks) — buang.
      let sIdx = 0;
      let eIdx = ruby.length - 1;
      while (sIdx <= eIdx && !isAlignable(ruby[sIdx]!)) sIdx++;
      while (eIdx >= sIdx && !isAlignable(ruby[eIdx]!)) eIdx--;
      ruby = sIdx <= eIdx ? ruby.slice(sIdx, eIdx + 1) : "";
      segments.push({ base: run.text, ruby: ruby || undefined });
      rp = end;
    } else {
      // Run non-kanji: konsumsi kana yang cocok dari reading, skip tanda baca.
      for (const ch of run.text) {
        if (!isAlignable(ch)) {
          segments.push({ base: ch });
          continue;
        }
        // Kana di teks bisa skip beberapa karakter non-alignable di reading.
        while (rp < kana.length && !isAlignable(kana[rp]!)) rp++;
        if (kana[rp] !== ch) {
          // Sisa run kana setelah gagal → polos aja (gak usah nebak-nebakan).
          ok = false;
          break;
        }
        segments.push({ base: ch });
        rp += 1;
      }
    }
  }
  if (!ok) return [{ base: text }];
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
  /** Class khusus run yang mengandung kanji (mis. hijau di halaman Reading). */
  kanjiClassName?: string;
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
  kanjiClassName,
  romajiClassName = "text-xs font-normal text-zinc-400 dark:text-zinc-500",
  defaultShowRomaji = false,
  romajiToggle = true,
}: JaTextProps) {
  const [showRomaji, setShowRomaji] = useState(defaultShowRomaji);
  const { kana, romaji: romajiFromReading } = splitReading(reading);
  const romaji = (romajiProp || romajiFromReading || "").trim();

  // Bukan teks Jepang → polos aja (komponen ini aman buat EN juga).
  if (!hasJa(text)) return <span className={className}>{text}</span>;

  let segments = buildRuby(text, kana);
  // Fallback TANPA ruby (tanpa bacaan / alignment gagal): pecah per run kanji
  // vs non-kanji biar cuma run kanji yang hijau — JANGAN satu gumpalan hijau.
  // matcha: contoh tanpa kana tampil "ijo semua" (satu segmen isi kanji).
  if (segments.length === 1 && !segments[0]!.ruby) {
    const runs: JaSegment[] = [];
    for (const ch of segments[0]!.base) {
      const isKanji = /[\u4e00-\u9faf\u3005\u3007]/.test(ch);
      const last = runs[runs.length - 1];
      const lastIsKanji = last ? /[\u4e00-\u9faf\u3005\u3007]/.test(last.base[0]!) : null;
      if (last && lastIsKanji === isKanji) last.base += ch;
      else runs.push({ base: ch });
    }
    if (runs.length > 1) segments = runs;
  }
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
            <span className={kanjiClassName && /[\u4e00-\u9faf\u3005\u3007]/.test(s.base) ? kanjiClassName : undefined}>
              {s.base}
            </span>
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

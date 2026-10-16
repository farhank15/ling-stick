import type { ReactNode } from "react";
import { JaText, hasJa } from "./JaText";

/**
 * Pola tulisan Jepang dari Ling: 漢字（かな）atau 漢字（かな・romaji),
 * versi ASCII: 漢字(かな) / 漢字(かな, romaji). Lihat CHAT_SYSTEM_JA.
 * Di-render via JaText: kanji hijau + furigana hiragana + toggle romaji —
 * format yang sama dengan kartu/flashcard di seluruh app.
 */
const JA_RE = /([^\s*`_()（）[\]]+?)[(（]([\u3040-\u30ffー]+)(?:[・,]\s*([a-zāīūēōâîûêô ]+))?[)）]/g;

/** Bungkus run kana/kanji telanjang (di luar pola 漢字（かな）) dengan treatment
 *  konsisten: teal + semibold + sedikit lebih besar dari Latin sekitarnya.
 *  Riset: glif CJK mengisi em-square penuh sementara Latin menyisakan ruang
 *  ascender/descender → kana seukuran teks terlihat kecil & tenggelam.
 *  matcha: は/が/わ sewarna-seukuran teks Indonesia = susah scan. */
const BARE_JP_RE = /([\u3040-\u30ff\u4e00-\u9fafー々]+)/g;

function bareJp(text: string, keyPrefix: string): ReactNode[] {
  if (!hasJa(text)) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  BARE_JP_RE.lastIndex = 0;
  while ((m = BARE_JP_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span
        key={`${keyPrefix}-j${i++}`}
        className="jp-token font-semibold text-teal-700 dark:text-teal-300"
      >
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function jaNodes(text: string, keyPrefix: string): ReactNode[] {
  if (!hasJa(text)) return [text];
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  JA_RE.lastIndex = 0;
  while ((m = JA_RE.exec(text)) !== null) {
    if (m.index > last) out.push(...bareJp(text.slice(last, m.index), `${keyPrefix}-t${i}`));
    const word = m[1]!;
    const kana = m[2]!;
    const romaji = (m[3] ?? "").trim();
    out.push(
      <JaText
        key={`${keyPrefix}-ja${i++}`}
        text={word}
        reading={romaji ? `${kana} (${romaji})` : kana}
        kanjiClassName="text-teal-700 dark:text-teal-400"
        romajiToggle={Boolean(romaji)}
      />,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...bareJp(text.slice(last), `${keyPrefix}-t${i}`));
  return out;
}

/** Parse inline markdown (bold/italic/code/stabilo) jadi ReactNode[] — aman, tanpa HTML injection.
 *  Stabilo `==teks==` = sorot amber untuk MAKSIMAL 1 frasa kunci per blok (von Restorff:
 *  1 isolate per layar; Dunlosky: highlight massal ≈ tak berguna). */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(==([^=]+)==)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...jaNodes(text.slice(last, m.index), `${keyPrefix}-t${i}`));
    if (m[2] !== undefined) {
      out.push(
        <mark
          key={`${keyPrefix}-${i++}`}
          className="rounded-sm bg-amber-200/80 px-0.5 font-semibold text-zinc-900 dark:bg-amber-400/25 dark:text-amber-100"
        >
          {jaNodes(m[2], `${keyPrefix}-h${i}`)}
        </mark>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-${i++}`} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {jaNodes(m[4], `${keyPrefix}-b${i}`)}
        </strong>,
      );
    } else if (m[6] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-${i++}`} className="italic text-zinc-600 dark:text-zinc-400">
          {jaNodes(m[6], `${keyPrefix}-e${i}`)}
        </em>,
      );
    } else if (m[8] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-${i++}`}
          className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-800"
        >
          {m[8]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...jaNodes(text.slice(last), `${keyPrefix}-t${i}`));
  return out;
}

/**
 * Markdown mini untuk bubble chat Ling.
 * Support: "### heading", "- " / "* " bullet, "1. " / "2) " numbered, **bold**, *italic*, `code`,
 * ==stabilo== (maks 1 frasa kunci per blok),
 * plus pola Jepang 漢字（かな）/ 漢字（かな・romaji) → JaText (kanji hijau + furigana + toggle romaji).
 * Struktur dibangun sebagai elemen React (bukan HTML string) → aman & styling konsisten.
 */
export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const { ordered, items } = list;
    const Tag = ordered ? "ol" : "ul";
    // Suffix "-list": baris non-list sesudah list mem-flush + render bloknya
    // sendiri dengan key baris yang sama → duplikat ("b5" ganda).
    // matcha: key duplikat bikin anak React ke-skip.
    const listKey = `${key}-list`;
    blocks.push(
      <Tag
        key={listKey}
        className={`my-1 space-y-1 pl-1 ${ordered ? "list-none" : "list-none"}`}
      >
        {items.map((it, idx) => (
          <li key={idx} className="flex gap-2">
            <span
              className={`shrink-0 select-none text-zinc-400 dark:text-zinc-500 ${
                ordered ? "font-medium tabular-nums" : ""
              }`}
            >
              {ordered ? `${idx + 1}.` : "•"}
            </span>
            <span className="min-w-0">{inline(it, `${listKey}-${idx}`)}</span>
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const key = `b${i}`;

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);

    if (bullet) {
      if (!list || list.ordered) {
        flushList(key);
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      return;
    }
    if (numbered) {
      if (!list || !list.ordered) {
        flushList(key);
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[2]);
      return;
    }
    flushList(key);

    if (heading) {
      blocks.push(
        <p key={key} className="mt-2 mb-1 text-[13px] font-bold uppercase tracking-wide text-zinc-500 first:mt-0 dark:text-zinc-400">
          {inline(heading[1], key)}
        </p>,
      );
    } else if (line.trim() === "") {
      blocks.push(<div key={key} className="h-2" />);
    } else {
      blocks.push(<p key={key} className="my-0.5 first:mt-0 last:mb-0">{inline(line, key)}</p>);
    }
  });
  flushList("tail");

  return <div className={`space-y-0.5 text-sm leading-relaxed ${className ?? ""}`}>{blocks}</div>;
}

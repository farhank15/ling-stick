import type { ReactNode } from "react";

/** Parse inline markdown (bold/italic/code) jadi ReactNode[] — aman, tanpa HTML injection. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      out.push(
        <strong key={`${keyPrefix}-${i++}`} className="font-semibold text-zinc-900 dark:text-zinc-100">
          {m[2]}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      out.push(
        <em key={`${keyPrefix}-${i++}`} className="italic text-zinc-600 dark:text-zinc-400">
          {m[4]}
        </em>,
      );
    } else if (m[6] !== undefined) {
      out.push(
        <code
          key={`${keyPrefix}-${i++}`}
          className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-800"
        >
          {m[6]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Markdown mini untuk bubble chat Ling.
 * Support: "### heading", "- " / "* " bullet, "1. " / "2) " numbered, **bold**, *italic*, `code`.
 * Struktur dibangun sebagai elemen React (bukan HTML string) → aman & styling konsisten.
 */
export function MarkdownLite({ text }: { text: string }) {
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

  return <div className="space-y-0.5 text-sm leading-relaxed">{blocks}</div>;
}

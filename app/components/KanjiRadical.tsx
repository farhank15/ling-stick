import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Cari kanji via tap komponen visual (KRADFILE, EDRDG) — fallback kalau coretan
 * tak dikenali. Kanji harus memuat SEMUA komponen terpilih.
 */
export function KanjiRadical({ onPick }: { onPick: (char: string) => void }) {
  const [krad, setKrad] = useState<Record<string, string[]> | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void (async () => {
      try {
        const mod = await import("../../data/kanji-krad.json");
        setKrad(mod.default as Record<string, string[]>);
      } catch {
        /* diam */
      }
    })();
  }, []);

  const rads = useMemo(() => {
    if (!krad) return [];
    const freq = new Map<string, number>();
    for (const parts of Object.values(krad)) {
      for (const p of parts) freq.set(p, (freq.get(p) ?? 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  }, [krad]);

  const hits = useMemo(() => {
    if (!krad || sel.length === 0) return [];
    const out: string[] = [];
    for (const [ch, parts] of Object.entries(krad)) {
      if (sel.every((s) => parts.includes(s))) {
        out.push(ch);
        if (out.length >= 40) break;
      }
    }
    return out;
  }, [krad, sel]);

  if (!krad) return null;
  return (
    <div className="space-y-2">
      <p className="label">…atau tap bagian kanjinya ({sel.length} dipilih)</p>
      {sel.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sel.map((s) => (
            <button
              key={s}
              className="chip chip-active min-h-8 px-2.5 text-sm"
              onClick={() => setSel((v) => v.filter((x) => x !== s))}
            >
              {s} ✕
            </button>
          ))}
          <button className="chip min-h-8 px-2.5 text-[11px]" onClick={() => setSel([])}>
            Reset
          </button>
        </div>
      ) : null}
      <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1">
          {rads.map((r) => (
            <button
              key={r}
              className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-1.5 text-lg ${
                sel.includes(r)
                  ? "border-teal-500 bg-teal-50 dark:bg-teal-950"
                  : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
              onClick={() => setSel((v) => (v.includes(r) ? v.filter((x) => x !== r) : [...v, r].slice(0, 4)))}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {sel.length > 0 ? (
        hits.length > 0 ? (
          <div className="grid grid-cols-5 gap-1.5">
            {hits.map((h) => (
              <button key={h} className="btn-secondary justify-center py-2 text-2xl" onClick={() => onPick(h)}>
                {h}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-400">Tak ada kanji memuat semua itu — kurangi pilihan.</p>
        )
      ) : null}
    </div>
  );
}

import type { MetaFunction } from "react-router";
import { useState } from "react";
import { useToast } from "~/components/Toast";

export const handle = { title: "Mode nonton" };
export const meta: MetaFunction = () => [{ title: "Mode nonton — LingStick" }];

type Expr = {
  text: string;
  type: string;
  register: string;
  meaning_id: string;
  sentence_en: string;
};

const MAX = 3000;

export default function Extract() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exprs, setFetched] = useState<Expr[]>([]);
  const [exists, setExists] = useState<boolean[]>([]);
  const [busy, setBusyExtract] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  // Otomatis centang yang BARU aja — yang udah di Library tidak dicentang
  // (tetap bisa dicentang manual kalau mau nambah contoh).
  const selectNew = () => {
    const n = new Set<number>();
    exprs.forEach((_, i) => {
      if (!exists[i]) n.add(i);
    });
    setSelected(n);
  };

  const newCount = exprs.filter((_, i) => !exists[i]).length;

  const saveOne = async (e: Expr) => {
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: e.text,
        type: normalizeType(e.type),
        register: normalizeRegister(e.register),
        meaningId: e.meaning_id,
        source: "Ekstrak teks",
        confidence: "medium",
        examples: [
          {
            register: "neutral",
            en: e.sentence_en,
            idText: "(kalimat asli tempat ketemu)",
            isContext: true,
          },
        ],
      }),
    });
  };

  const saveSelected = async () => {
    for (const i of selected) {
      await saveOne(exprs[i]);
    }
    setSelected(new Set());
    setText("");
    toast(`${selected.size} ekspresi tersimpan ke Library`);
  };

  // Form ekstrak: textarea + tombol sempit tengah di desktop.
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Tempel subtitle / chat / komen Reddit / artikel (maks {MAX} karakter). AI nandain
        idiom, slang, reaksi & phrasal verb yang menarik.
      </p>

      <textarea
        className="input min-h-40"
        value={text}
        maxLength={MAX}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste teks di sini…"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {text.length}/{MAX}
        </span>
        <button
          className="btn-primary"
          type="button"
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusyExtract(true);
            try {
              const res = await fetch("/api/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: text.trim() }),
              });
              const data = await res.json();
              if (!res.ok) setExtractError(data.error ?? "Ekstraksi gagal");
              else {
                setExtractError(null);
                const list = (data.expressions ?? []) as Expr[];
                const ex = (data.exists ?? []) as boolean[];
                setFetched(list);
                setExists(list.map((_, i) => Boolean(ex[i])));
                // Langsung centang yang baru — user tinggal Simpan.
                const n = new Set<number>();
                list.forEach((_, i) => {
                  if (!ex[i]) n.add(i);
                });
                setSelected(n);
              }
            } catch {
              setExtractError("Server nggak merespons");
            } finally {
              setBusyExtract(false);
            }
          }}
        >
          {busy ? "Mencari…" : "Ekstrak ekspresi"}
        </button>
      </div>

      {extractError ? (
        <p className="card text-sm text-red-600 dark:text-red-400">{extractError}</p>
      ) : null}

      {exprs.length > 0 ? (
        <>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-zinc-500">
              {newCount > 0 ? (
                <><span className="font-semibold text-teal-700 dark:text-teal-300">{newCount} baru</span> · {exprs.length - newCount} udah di Library</>
              ) : (
                "Semuanya udah ada di Library — mantap!"
              )}
            </p>
            {newCount > 0 && newCount !== selected.size ? (
              <button className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-300" onClick={selectNew}>
                Pilih yang baru aja
              </button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {exprs.map((e, i) => (
              <li key={`${e.text}-${i}`} className={`card ${exists[i] ? "opacity-70" : ""}`}>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 accent-teal-600"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold wrap-break-words">{e.text}</span>
                      {exists[i] ? (
                        <span className="badge bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                          di Library
                        </span>
                      ) : (
                        <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          baru
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-400">
                      {e.type} · {e.register}
                    </span>
                    <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                      {e.meaning_id}
                    </span>
                    <span className="block text-xs wrap-break-words italic text-zinc-400">“{e.sentence_en}”</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="fixed inset-x-0 bottom-14 z-10 mx-auto w-full max-w-2xl border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <button className="btn-primary w-full" disabled={selected.size === 0} onClick={() => void saveSelected()}>
              Simpan {selected.size} ekspresi
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function normalizeType(t: string): string {
  const ok = ["word", "phrasal_verb", "idiom", "collocation", "slang", "reaction", "sentence"];
  const v = t.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ok.includes(v) ? v : "word";
}

function normalizeRegister(r: string): string {
  const ok = ["formal", "neutral", "informal", "slang"];
  const v = r.trim().toLowerCase();
  return ok.includes(v) ? v : "neutral";
}

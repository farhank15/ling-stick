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
  const [busy, setBusyExtract] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

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

  return (
    <div className="space-y-4">
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
                setFetched(data.expressions ?? []);
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
          <ul className="space-y-2">
            {exprs.map((e, i) => (
              <li key={`${e.text}-${i}`} className="card">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-teal-600"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold">{e.text}</span>
                    <span className="badge ml-1.5 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {e.register}
                    </span>
                    <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                      {e.meaning_id}
                    </span>
                    <span className="block text-xs italic text-zinc-400">“{e.sentence_en}”</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-md border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
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

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bookmark, CheckCircle2, ClipboardPaste, Lightbulb, Loader2 } from "lucide-react";
import { useToast } from "~/components/Toast";

type GenExample = { register: string; en: string; id: string };
type GenSense = { label: string; examples: GenExample[] };
type GenResult = {
  headword: string;
  reading?: string; // JA: kana
  romaji?: string; // JA: hepburn
  type: string;
  register: string;
  meaning_id: string;
  senses: GenSense[];
  unnatural_registers: string[];
  alternatives: { text: string; register?: string; nuance_id?: string; use_when_id?: string }[];
  notes_id?: string;
  confidence: string;
};

const REGISTER_TABS = [
  { key: "casual", label: "Santai" },
  { key: "neutral", label: "Umum" },
  { key: "formal", label: "Formal" },
] as const;

const TYPE_LABELS: Record<string, string> = {
  word: "kata",
  phrasal_verb: "phrasal verb",
  idiom: "idiom",
  collocation: "collocation",
  slang: "slang",
  reaction: "reaksi",
  sentence: "kalimat",
};

/** Formulir Tambah: ketik → generate makna & contoh → pilih → simpan. */
export function Capture() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenResult | null>(null);
  const [cached, setCached] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [senseTab, setSenseTab] = useState<Record<number, string>>({});
  const [source, setSource] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: number; addedToExisting: boolean } | null>(null);
  const [manual, setManual] = useState({ meaning: "", en: "", id: "", register: "neutral" });

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // Autocomplete (debounced)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 2 || result) {
      setSuggestions([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(text.trim())}`);
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [text, result]);

  const generate = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setShowSuggest(false);
    setLoading(true);
    setError(null);
    setResult(null);
    setDegraded(false);
    setDuplicateOf(null);
    setSaved(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generate gagal");
        setDegraded(true);
        setDuplicateOf(data.duplicateOf ?? null);
        return;
      }
      setResult(data.result);
      setCached(data.cached);
      setDuplicateOf(data.duplicateOf ?? null);
      const all = new Set<string>();
      data.result.senses.forEach((s: GenSense, si: number) =>
        s.examples.forEach((_: GenExample, ei: number) => all.add(`${si}-${ei}`)),
      );
      setSelected(all);
      setSenseTab(
        Object.fromEntries(data.result.senses.map((_: GenSense, i: number) => [i, "casual"])),
      );
    } catch {
      setError("Tidak bisa menghubungi server");
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(
    async (addToExisting?: number) => {
      const t = (result?.headword || text).trim();
      if (!t) return;
      setSaving(true);
      setError(null);
      try {
        const examples: {
          senseLabel?: string;
          register: string;
          en: string;
          idText: string;
          isContext?: boolean;
        }[] = result
          ? result.senses.flatMap((s, si) =>
              s.examples
                .map((ex, ei) => ({ ex, key: `${si}-${ei}` }))
                .filter(({ key }) => selected.has(key))
                .map(({ ex }) => ({
                  senseLabel: s.label,
                  register: ex.register,
                  en: ex.en,
                  idText: ex.id,
                })),
            )
          : manual.en.trim() && manual.id.trim()
            ? [{ register: manual.register, en: manual.en, idText: manual.id }]
            : [];
        if (context.trim()) {
          examples.push({
            register: "neutral",
            en: context.trim(),
            idText: "(kalimat asli dari sumber)",
            isContext: true,
          });
        }
        const body = {
          text: t,
          type: result?.type ?? "word",
          register: result?.register ?? "neutral",
          reading: result?.reading || undefined,
          meaningId: result?.meaning_id ?? manual.meaning,
          notesId: result?.notes_id ?? "",
          source: source.trim(),
          confidence: result?.confidence ?? "low",
          examples,
          alternatives: result?.alternatives.map((a) => ({
            text: a.text,
            register: a.register,
            nuanceId: a.nuance_id,
            useWhenId: a.use_when_id,
          })),
          addExamplesTo: addToExisting,
        };
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          id?: number;
          addedToExisting?: boolean;
          error?: string;
          duplicateOf?: number;
        };
        if (res.status === 409 && data.duplicateOf && !addToExisting) {
          setDuplicateOf(data.duplicateOf);
          setError("Sudah ada di Library — tambah kalimat baru ke item itu?");
          return;
        }
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Gagal menyimpan");
          return;
        }
        setSaved({ id: data.id ?? 0, addedToExisting: Boolean(data.addedToExisting) });
        toast(data.addedToExisting ? "Kalimat baru ditambahkan" : "Tersimpan! Kartu review dibuat");
        setText("");
        setResult(null);
        setSource("");
        setContext("");
        setManual({ meaning: "", en: "", id: "", register: "neutral" });
        setDuplicateOf(null);
      } catch {
        setError("Tidak bisa menghubungi server");
      } finally {
        setSaving(false);
      }
    },
    [result, text, selected, source, context, manual],
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section className="space-y-4">
      {/* Input besar + suggestion */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate(text);
        }}
      >
        <div className="relative">
          <input
            className="input min-h-14 text-lg font-medium"
            placeholder="Ketik kata / frasa baru…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setShowSuggest(true);
              setSaved(null);
            }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          />
          {showSuggest && suggestions.length > 0 && !result ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    onMouseDown={() => {
                      setText(s);
                      void generate(s);
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-primary flex-1" type="submit" disabled={loading || !text.trim()}>
            {loading ? "Menyusun…" : "Cari makna & contoh"}
          </button>
          <Link to="/extract" className="btn-secondary" title="Mode nonton: ekstrak dari teks">
            <ClipboardPaste className="h-4 w-4" strokeWidth={1.75} /> Tempel teks
          </Link>
        </div>
      </form>

      {loading ? <SkeletonCard /> : null}

      {saved ? (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-300">
          <CheckCircle2 className="mr-1 inline h-4 w-4" />
          {saved.addedToExisting
            ? "Kalimat baru ditambahkan ke item yang sudah ada. "
            : "Tersimpan! Kartu review dibuat (due hari ini). "}
          <Link to={`/library/${saved.id}`} className="font-medium underline">
            Lihat item
          </Link>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
          {duplicateOf ? (
            <button
              className="mt-2 block font-medium underline"
              onClick={() => void save(duplicateOf)}
            >
              Tambah kalimat baru ke item yang ada
            </button>
          ) : null}
        </div>
      ) : null}

      {degraded && !result ? (
        <div className="card space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            AI lagi bermasalah — isi manual dulu aja, nanti bisa diedit.
          </p>
          <input
            className="input"
            placeholder="Arti (Indonesia)"
            value={manual.meaning}
            onChange={(e) => setManual({ ...manual, meaning: e.target.value })}
          />
          <input
            className="input"
            placeholder="Contoh kalimat EN (opsional)"
            value={manual.en}
            onChange={(e) => setManual({ ...manual, en: e.target.value })}
          />
          <input
            className="input"
            placeholder="Terjemahan ID (opsional)"
            value={manual.id}
            onChange={(e) => setManual({ ...manual, id: e.target.value })}
          />
          <select
            className="input"
            value={manual.register}
            onChange={(e) => setManual({ ...manual, register: e.target.value })}
          >
            <option value="neutral">Register: netral</option>
            <option value="casual">Register: santai</option>
            <option value="formal">Register: formal</option>
          </select>
          <button
            className="btn-primary"
            disabled={saving || !manual.meaning.trim()}
            onClick={() => void save()}
          >
            {saving ? "Menyimpan…" : "Simpan ke Library"}
          </button>
        </div>
      ) : null}

      {result ? (
        <div ref={resultRef} className="space-y-4">
          <div className="card">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold">{result.headword}</h2>
              <div className="flex shrink-0 flex-wrap gap-1">
                <span className="badge bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {TYPE_LABELS[result.type] ?? result.type}
                </span>
                <span className="badge bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
                  {result.register}
                </span>
                {result.confidence === "low" ? (
                  <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                    conf. rendah
                  </span>
                ) : null}
                {cached ? (
                  <span className="badge bg-zinc-100 text-zinc-400 dark:bg-zinc-800">cache</span>
                ) : null}
              </div>
            </div>
            {/* JA: kana redup di bawah kanji — bantu baca tanpa nimpa */}
            {result.reading ? (
              <p className="mt-0.5 text-sm text-zinc-400 dark:text-zinc-500">
                {result.reading}
                {result.romaji ? <span className="ml-1.5 text-xs">({result.romaji})</span> : null}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{result.meaning_id}</p>
            {result.notes_id ? (
              <p className="mt-2 text-xs italic text-zinc-500">
                <Lightbulb className="mr-1 inline h-3.5 w-3.5" /> {result.notes_id}
              </p>
            ) : null}
            {/* Simpan: icon di kartu hasil (bukan bar fixed di bawah yang nimpa navbar) */}
            <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
              <span className="text-xs text-zinc-500">{selected.size} kalimat dipilih</span>
              <button
                className="btn-ghost min-h-9 min-w-9 px-2"
                disabled={saving || selected.size === 0}
                onClick={() => void save()}
                title="Simpan ke Library"
                aria-label="Simpan ke Library"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bookmark className="h-4 w-4 text-teal-600 dark:text-teal-400" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {result.senses.map((sense, si) => {
            const tab = senseTab[si] ?? "casual";
            const exs = sense.examples.filter((e) => e.register === tab);
            const unnatural = exs.length === 0;
            return (
              <div key={si} className="card">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{sense.label}</p>
                  <span className="label">
                    makna {result.senses.length > 1 ? si + 1 : ""}
                  </span>
                </div>
                <div className="mb-3 flex gap-1.5">
                  {REGISTER_TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setSenseTab({ ...senseTab, [si]: t.key })}
                      className={`chip flex-1 justify-center ${tab === t.key ? "chip-active" : ""}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {unnatural ? (
                  <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-500">
                    — jarang dipakai di register ini, jadi nggak ada contoh —
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {exs.map((ex) => {
                      const key = `${si}-${sense.examples.indexOf(ex)}`;
                      return (
                        <li key={key}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-teal-600"
                              checked={selected.has(key)}
                              onChange={() => toggle(key)}
                            />
                            <span>
                              <span className="block text-sm">{ex.en}</span>
                              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                                {ex.id}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {result.alternatives.length > 0 ? (
            <div className="card">
              <p className="label mb-2">Cara lain ngomong</p>
              <ul className="space-y-1.5">
                {result.alternatives.map((a) => (
                  <li key={a.text} className="text-sm">
                    <span className="font-medium">{a.text}</span>
                    {a.register ? (
                      <span className="badge ml-1.5 bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                        {a.register}
                      </span>
                    ) : null}
                    {a.nuance_id ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {a.nuance_id}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2">
            <input
              className="input"
              placeholder="Sumber (mis. Netflix — Ozark S2) — opsional"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <textarea
              className="input min-h-16"
              placeholder="Kalimat asli tempat ketemu (opsional)"
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>
        </div>
      ) : null}

    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="h-5 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="h-16 rounded bg-zinc-100 dark:bg-zinc-800/60" />
    </div>
  );
}

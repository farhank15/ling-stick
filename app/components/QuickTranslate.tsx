import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeftRight, Languages, Loader2, Volume2, X } from "lucide-react";
import { ttsLang } from "~/lib/utils.shared";

type UsageResult = { pronunciation: string; examples: { en: string; id: string }[] };

/**
 * Terjemah cepat di dashboard: auto-translate 0.8s, swap ala DeepL, tombol clear,
 * cara baca auto-tampil + tombol suara untuk hasil EN, link ke halaman Terjemah bawa teks.
 */
export function QuickTranslate() {
  const [text, setText] = useState("");
  const [from, setFrom] = useState<"en" | "id">("en");
  const [result, setResult] = useState<{ translation: string } | null>(null);
  const [pron, setPron] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const pronKey = useRef("");

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const t = text.trim();
    if (t.length < 2) {
      setResult(null);
      setPron(null);
      setError(null);
      setBusy(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      const mySeq = ++seq.current;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: t.slice(0, 1000),
            from,
            to: from === "en" ? "id" : "en",
            style: "fluid",
            prefer: "llm",
          }),
        });
        const data = await res.json();
        if (seq.current !== mySeq) return;
        if (!res.ok) {
          setError(data.error ?? "Gagal menerjemahkan");
          setResult(null);
        } else {
          setResult(data);
          setPron(null);
        }
      } catch {
        if (seq.current === mySeq) {
          setError("Server nggak merespons");
          setResult(null);
        }
      } finally {
        if (seq.current === mySeq) setBusy(false);
      }
    }, 800);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [text, from]);

  const swap = () => {
    const prev = result?.translation?.trim();
    setFrom(from === "en" ? "id" : "en");
    setText(prev && prev.length <= 1000 ? prev : "");
    setResult(null);
    setPron(null);
    setError(null);
  };

  const clear = () => {
    setText("");
    setResult(null);
    setPron(null);
    setError(null);
  };

  const shown = result && !busy ? result.translation : null;

  // Cara baca dimuat OTOMATIS untuk teks di sisi Inggris — tanpa klik.
  // Dipicu saat hasil terjemahan muncul supaya tidak fetch di tiap ketikan.
  const englishSide = from === "en" ? text.trim() : shown?.trim() ?? "";
  useEffect(() => {
    if (!shown) return;
    const english = (from === "en" ? text : shown).trim();
    if (!english) return;
    const key = `${from}:${english.slice(0, 300)}`;
    if (pronKey.current === key) return;
    pronKey.current = key;
    setPron(null);
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/usage-examples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: english.slice(0, 300),
            direction: from === "en" ? "en2id" : "id2en",
          }),
        });
        const data = await res.json();
        if (alive && data.result?.pronunciation) setPron(data.result.pronunciation);
      } catch {
        /* diam — cara baca bersifat opsional */
      }
    })();
    return () => {
      alive = false;
    };
  }, [shown, from, text]);

  const speak = (s: string, lang?: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(s);
    u.lang = lang ?? ttsLang(s);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label inline-flex items-center gap-1.5">
          <Languages className="h-3.5 w-3.5" /> Terjemah cepat
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => from !== "en" && swap()}
            className={`chip min-h-7 px-2.5 text-[11px] ${from === "en" ? "chip-active" : ""}`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={swap}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            title="Balik arah — terjemahan ikut pindah ke input"
            aria-label="Balik arah"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => from !== "id" && swap()}
            className={`chip min-h-7 px-2.5 text-[11px] ${from === "id" ? "chip-active" : ""}`}
          >
            ID
          </button>
        </div>
      </div>
      <div className="relative">
        <textarea
          className="input-area min-h-20 pr-10"
          placeholder={
            from === "en"
              ? "Tulis bahasa Inggris… berhenti ngetik = auto translate"
              : "Tulis bahasa Indonesia… berhenti ngetik = auto translate"
          }
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
        />
        {text ? (
          <button
            className="absolute top-2.5 right-2.5 rounded-full p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-600 dark:hover:bg-zinc-800"
            onClick={clear}
            title="Bersihkan"
            aria-label="Bersihkan"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {busy ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menerjemahkan…
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      {shown ? (
        <div className="mt-2 rounded-2xl border border-teal-200/70 bg-teal-50/50 p-3 dark:border-teal-900/60 dark:bg-teal-950/30">
          <p className="whitespace-pre-wrap text-sm">{shown}</p>
          {englishSide ? (
            <div className="mt-1 flex min-h-5 items-center gap-1.5">
              {pron ? (
                <>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{pron}</span>
                  <button
                    className="rounded-full p-0.5"
                    onClick={() => speak(englishSide)}
                    title="Dengarkan"
                    aria-label="Dengarkan"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-zinc-400">memuat cara baca…</span>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <Link
        to={`/translate${text.trim() ? `?text=${encodeURIComponent(text.trim().slice(0, 2000))}&from=${from}` : ""}`}
        className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
      >
        Terjemah lengkap (gaya, contoh, simpan) →
      </Link>
    </section>
  );
}

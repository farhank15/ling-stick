import type { MetaFunction } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  Copy,
  Loader2,
  Volume2,
  X,
} from "lucide-react";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Terjemah — LingStick" }];
export const handle = { title: "Terjemah" };

type UsageResult = { pronunciation: string; examples: { en: string; id: string }[] };

/** Preset gaya bahasa — dialek/level formalitas diteruskan ke LLM. */
const STYLE_PRESETS: { key: "gaul" | "umum" | "formal"; style: "fluid" | "faithful" | "creative"; tone: string; label: string }[] = [
  { key: "gaul", style: "creative", tone: "casual, slangy, like texting a close friend", label: "Gaul" },
  { key: "umum", style: "fluid", tone: "", label: "Umum" },
  { key: "formal", style: "faithful", tone: "polite and professional", label: "Formal" },
];

export default function Translate() {
  const toast = useToast();
  const [params] = useSearchParams();

  const [text, setText] = useState(() => (params.get("text") ?? "").slice(0, 2000));
  const [from, setFrom] = useState<"en" | "id">(() => (params.get("from") === "id" ? "id" : "en"));
  const [preset, setPreset] = useState<"gaul" | "umum" | "formal">("umum");
  const [result, setResult] = useState<{ translation: string } | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const seq = useRef(0);

  const active = STYLE_PRESETS.find((p) => p.key === preset)!;

  useEffect(() => {
    const t = text.trim();
    const mySeq = ++seq.current;
    if (t.length < 2) {
      setResult(null);
      setUsage(null);
      return;
    }
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: t.slice(0, 2000),
            from,
            to: from === "en" ? "id" : "en",
            style: active.style,
            tone: active.tone || undefined,
            prefer: "llm",
          }),
        });
        const data = await res.json();
        if (seq.current !== mySeq) return;
        if (!res.ok) {
          toast(data.error ?? "Gagal menerjemahkan");
          setResult(null);
        } else {
          setResult(data);
          setSaved(false);
          setUsage(null);
        }
      } catch {
        if (seq.current === mySeq) toast("Server nggak merespons");
      } finally {
        if (seq.current === mySeq) setBusy(false);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [text, from, preset, toast, active.style, active.tone]);

  const swapTo = (target: "en" | "id") => {
    if (target === from) return;
    const prev = result?.translation?.trim();
    setFrom(target);
    setText(prev && prev.length <= 2000 ? prev : "");
    setResult(null);
    setUsage(null);
    setSaved(false);
  };

  const clearAll = () => {
    setText("");
    setResult(null);
    setUsage(null);
    setSaved(false);
  };

  const loadUsage = async () => {
    if (usageBusy || !result) return;
    setUsageBusy(true);
    try {
      const res = await fetch("/api/usage-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim().slice(0, 300),
          direction: from === "en" ? "en2id" : "id2en",
        }),
      });
      const data = await res.json();
      if (data.result) setUsage(data.result);
      else toast(data.error ?? "Gagal memuat contoh");
    } catch {
      toast("Gagal memuat contoh");
    } finally {
      setUsageBusy(false);
    }
  };

  const speak = (s: string, lang: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(s);
    u.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const saveAsItem = async () => {
    if (!result || saved) return;
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim().slice(0, 120),
        type: "sentence",
        register: "neutral",
        meaningId: result.translation.slice(0, 300),
        source: "Terjemah",
        confidence: "medium",
        examples: [{ register: "neutral", en: text.trim(), idText: result.translation }],
      }),
    });
    const data = await res.json();
    if (data.ok || data.existed) {
      setSaved(true);
      toast(data.existed ? "Sudah ada di Library" : "Tersimpan ke Library");
    } else {
      toast(data.error ?? "Gagal menyimpan");
    }
  };

  const translatedToEn = from === "id"; // hasil di sisi EN kalau arah ID→EN

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="card space-y-3">
        <div className="flex items-center gap-1.5">
          <button
            className={`chip flex-1 justify-center ${from === "en" ? "chip-active" : ""}`}
            onClick={() => swapTo("en")}
          >
            EN
          </button>
          <button
            className="btn-ghost shrink-0 rounded-full px-2"
            onClick={() => swapTo(from === "en" ? "id" : "en")}
            title="Balik arah — terjemahan ikut pindah ke input"
            aria-label="Balik arah"
          >
            <ArrowLeftRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            className={`chip flex-1 justify-center ${from === "id" ? "chip-active" : ""}`}
            onClick={() => swapTo("id")}
          >
            ID
          </button>
        </div>
        <div className="relative">
          <textarea
            className="input min-h-24 pr-10 text-[15px]"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              from === "en"
                ? "Tulis bahasa Inggris… berhenti ngetik = auto translate"
                : "Tulis bahasa Indonesia… berhenti ngetik = auto translate"
            }
          />
          {text ? (
            <button
              className="absolute top-2 right-2 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              onClick={clearAll}
              title="Bersihkan semua"
              aria-label="Bersihkan semua"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STYLE_PRESETS.map((p) => (
              <button
                key={p.key}
                className={`chip min-h-7 px-2.5 text-[11px] ${preset === p.key ? "chip-active" : ""}`}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-zinc-400">{text.length}/2000</span>
        </div>
      </div>

      {/* Hasil */}
      {result ? (
        <div className="card">
          {busy ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menerjemahkan…
            </p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-xl leading-relaxed font-medium">
                {result.translation}
              </p>
              <div className="mt-3 flex items-center gap-1 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                <button
                  className="btn-ghost min-h-9 px-2.5"
                  onClick={() => speak(result.translation, from === "en" ? "id-ID" : "en-US")}
                  title="Dengarkan"
                  aria-label="Dengarkan"
                >
                  <Volume2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  className="btn-ghost min-h-9 px-2.5"
                  onClick={() => {
                    void navigator.clipboard.writeText(result.translation);
                    toast("Disalin");
                  }}
                  title="Salin"
                  aria-label="Salin"
                >
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <span className="flex-1" />
                <button
                  className="btn-secondary min-h-9 gap-1.5 px-3 text-xs"
                  onClick={() => void saveAsItem()}
                  disabled={saved}
                  title="Simpan ke Library"
                >
                  {saved ? (
                    <>
                      <BookmarkCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Tersimpan
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" /> Simpan
                    </>
                  )}
                </button>
              </div>

              {/* Cara baca + contoh penggunaan (AI) */}
              <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                {usage ? (
                  <div className="space-y-3">
                    <div>
                      <p className="label mb-1">Cara baca</p>
                      <p className="inline-flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                        {usage.pronunciation}
                        <button
                          onClick={() => speak(usage.pronunciation, "en-US")}
                          title="Dengarkan cara baca"
                          aria-label="Dengarkan cara baca"
                        >
                          <Volume2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        </button>
                      </p>
                    </div>
                    <div>
                      <p className="label mb-1">Contoh penggunaan</p>
                      <ul className="space-y-2">
                        {usage.examples.map((ex, i) => (
                          <li key={i} className="text-sm">
                            <span className="block text-zinc-800 dark:text-zinc-200">{ex.en}</span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                              {ex.id}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-secondary w-full text-xs"
                    onClick={() => void loadUsage()}
                    disabled={usageBusy}
                  >
                    {usageBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Menyusun contoh…
                      </>
                    ) : (
                      "Contoh cara pakai & cara baca (AI)"
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      <QuotaNote />
    </div>
  );
}

function QuotaNote() {
  const [quota, setQuota] = useState<{ used: number; limit: number; configured: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/lara")
      .then((r) => r.json())
      .then(setQuota)
      .catch(() => {});
  }, []);
  if (!quota) return null;
  return (
    <p className="text-center text-[11px] text-zinc-400">
      Kuota Lara: {quota.used.toLocaleString("id-ID")}/{quota.limit.toLocaleString("id-ID")} karakter
      {quota.configured ? "" : " · fallback LLM"}
    </p>
  );
}

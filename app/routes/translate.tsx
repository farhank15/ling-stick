import type { MetaFunction } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import {
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  Copy,
  Loader2,
  Volume2,
  X,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { JaText, hasJa } from "~/components/JaText";
import { Highlight } from "~/components/Highlight";
import { useToast } from "~/components/Toast";
import { ttsLang } from "~/lib/utils.shared";
import { SpeakButton } from "~/components/SpeakButton";

export const meta: MetaFunction = () => [{ title: "Terjemah — LingStick" }];
export const handle = { title: "Terjemah" };

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  return { lang: await getTargetLang() };
}

type UsageExample = { en: string; id: string; kana?: string | null; romaji?: string | null };
type UsageResult = { pronunciation: string; examples: UsageExample[] };

/** Gaya bahasa: seberapa idiomatis vs setia teks.
 * - Santai/Natural (default): seperti penutur asli sehari-hari — idiom yang
 *   umum dipakai (EN "don't drag me into this", JA bentuk natural casual).
 * - Formal: sopan/profesional (EN business, JA keigo desu/masu + sonkeigo).
 * - Literal: setia struktur kalimat sumber (buat belajar, lihat cara susunnya).
 * matcha: kategori gaul/umum tidak petakan ke JA; anime terlalu spesifik —
 * yang dipakai orang sehari-hari = natural vs formal vs literal. */
const STYLE_PRESETS: { key: "santai" | "formal" | "literal"; style: "fluid" | "faithful" | "faithful"; tone: string; label: string }[] = [
  { key: "santai", style: "fluid", tone: "natural everyday language as native speakers actually say it, including common idioms", label: "Santai" },
  { key: "formal", style: "faithful", tone: "polite and professional; for Japanese use keigo (desu/masu form, sonkeigo/kenjougo where fitting)", label: "Formal" },
  { key: "literal", style: "faithful", tone: "literal and faithful to the source sentence structure, minimal rephrasing, even if slightly stiff", label: "Literal" },
];

export default function Translate() {
  const toast = useToast();
  const { lang } = useLoaderData<typeof loader>();
  const ja = lang === "ja";
  const [params] = useSearchParams();

  const [text, setText] = useState(() => (params.get("text") ?? "").slice(0, 2000));
  const [from, setFrom] = useState<"en" | "id" | "ja">(() => {
    const p = params.get("from");
    if (p === "id") return "id";
    if (p === "ja" && ja) return "ja";
    return ja ? "ja" : "en";
  });
  const [preset, setPreset] = useState<"santai" | "formal" | "literal">("santai");
  const [result, setResult] = useState<{ translation: string; via?: string; cached?: boolean; note?: string } | null>(null);
  const [usage, setUsage] = useState<UsageResult | null>(null);
  const [usageBusy, setUsageBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
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
      translatedText.current = t;
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: t.slice(0, 2000),
            from,
            to: from === "ja" ? "id" : from === "en" ? "id" : ja ? "ja" : "en",
            style: active.style,
            tone: active.tone || undefined,
            prefer: "lara",
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

  const swapTo = (target: "en" | "id" | "ja") => {
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

  // Cara baca + contoh dimuat OTOMATIS begitu hasil terjemahan muncul — tanpa klik.
  // matcha: deps dulu [result, from, text] → tiap ketikan (result lama!) fetch baru
  // pakai teks mentah → request saling bunuh (alive=false semua), spinner nyangkut
  // + contoh/suara telat atau untuk teks yang salah. Sekarang: cuma jalan saat
  // result settle, pakai teks yang BENERAN diterjemahkan (snapshot ref).
  const usageKey = useRef("");
  const translatedText = useRef("");
  const usageSeq = useRef(0);
  useEffect(() => {
    if (!result || busy) return;
    const foreign = (from === "id" ? (result.translation ?? "") : translatedText.current || text).trim();
    if (!foreign) return;
    const key = `${from}:${ja ? "ja" : "en"}:${foreign.slice(0, 300)}`;
    if (usageKey.current === key) return;
    usageKey.current = key;
    const mySeq = ++usageSeq.current;
    setUsageBusy(true);
    void (async () => {
      try {
        const res = await fetch("/api/usage-examples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: foreign.slice(0, 300),
            direction: from === "ja" ? "ja2id" : from === "en" ? "en2id" : ja ? "id2ja" : "id2en",
          }),
        });
        const data = await res.json();
        if (usageSeq.current === mySeq && data.result) setUsage(data.result);
      } catch {
        /* diam — cara baca bersifat opsional */
      } finally {
        if (usageSeq.current === mySeq) setUsageBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, from, busy, ja]);

  const speak = (s: string, lang?: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(s);
    u.lang = lang ?? ttsLang(s);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const saveAsItem = async () => {
    if (!result || saved || saving) return;
    setSaving(true);
    try {
      const src = text.trim();
      // Contoh selalu disimpan dengan arah yang benar:
      // en = sisi bahasa Inggris, idText = sisi Indonesia (dulu en selalu teks input,
      // jadi kalau translate ID→EN kolomnya kebalik).
      const en = from === "en" ? src : (result.translation ?? "").trim();
      const idText = from === "en" ? (result.translation ?? "").trim() : src;
      // Pasangan terjemahan + SEMUA contoh generate ikut tersimpan (dulu cuma
      // pasangan). Contoh JA dilipat romaji bank-style ("kalimat\nromaji") biar
      // baris romaji tetap tampil di Library. Dedup biar gak dobel.
      // matcha: tabel examples gak punya kolom kana → furigana contoh JA hasil
      // simpan belum bisa dipertahankan (perlu migrasi skema); romaji aman.
      const seen = new Set<string>();
      const pushEx = (enText: string, idLine: string, kana: string | null) => {
        const e = enText.trim().slice(0, 300);
        const key = e.toLowerCase();
        if (!e || !idLine.trim() || seen.has(key)) return null;
        seen.add(key);
        return { register: "neutral", en: e, idText: idLine.trim().slice(0, 300), kana };
      };
      const examples = [
        en ? pushEx(en, idText, null) : null,
        ...(usage?.examples ?? []).map((u) =>
          pushEx(
            u.romaji ? `${u.en.trim()}\n${u.romaji.trim()}` : u.en,
            u.id,
            u.kana ?? null,
          ),
        ),
      ].filter((e): e is { register: string; en: string; idText: string; kana: string | null } => e !== null);
      // Headword JA (input JP / hasil JP) dapat reading dari pronunciation
      // "かな (romaji)" biar di Library ada furigana + toggle romaji.
      const jaSide = hasJa(src) ? src : hasJa(result.translation ?? "") ? (result.translation ?? "") : "";
      const payload = {
        text: src.slice(0, 120),
        type: "sentence",
        register: "neutral",
        meaningId: (result.translation ?? "").slice(0, 300),
        source: "Terjemah",
        confidence: "medium",
        reading: jaSide && usage?.pronunciation ? usage.pronunciation : undefined,
        examples,
      };
      let res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data = await res.json();
      // Teks pernah disimpan? Jangan buang contohnya — tambahkan ke item lama.
      if (res.status === 409 && data.duplicateOf) {
        res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, addExamplesTo: String(data.duplicateOf) }),
        });
        data = await res.json();
      }
      if (data.ok) {
        setSaved(true);
        toast(
          data.addedToExisting
            ? "Teks udah ada di Library — contoh ditambahkan"
            : "Tersimpan ke Library",
        );
      } else {
        toast(data.error ?? "Gagal menyimpan");
      }
    } catch {
      toast("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  // Teks di sisi bahasa target (EN/JP): input atau hasil terjemahan.
  const foreignSide = from === "id" ? result?.translation?.trim() ?? "" : text.trim();
  // Kata yang disorot di contoh EN: kata yang diterjemahkan (sisi asing).
  // matcha: contoh EN polos total — kata yang dicari tidak hijau.
  const highlightWord = from === "en" ? text.trim() : ja ? "" : (result?.translation ?? "").trim();

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="card space-y-3">
        <div className="flex items-center gap-1.5">
          {ja ? (
            <button
              className={`chip flex-1 justify-center ${from === "ja" ? "chip-active" : ""}`}
              onClick={() => swapTo("ja")}
            >
              日本語
            </button>
          ) : (
            <button
              className={`chip flex-1 justify-center ${from === "en" ? "chip-active" : ""}`}
              onClick={() => swapTo("en")}
            >
              EN
            </button>
          )}
          <button
            className="btn-ghost shrink-0 rounded-full px-2"
            onClick={() => swapTo(from === "id" ? (ja ? "ja" : "en") : "id")}
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
            className="input-area min-h-28 pr-10"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              from === "ja"
                ? "Tulis bahasa Jepang… berhenti ngetik = auto translate"
                : from === "en"
                  ? "Tulis bahasa Inggris… berhenti ngetik = auto translate"
                  : "Tulis bahasa Indonesia… berhenti ngetik = auto translate"
            }
          />
          {text ? (
            <button
              className="absolute top-2.5 right-2.5 rounded-full p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-600 dark:hover:bg-zinc-800"
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
      {/* Status loading yang jelas: skeleton kartu + tahapan (bukan layar kosong) */}
      {!result && busy ? (
        <div className="card space-y-3">
          <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menerjemahkan… (AI, bisa 2–5 detik)
          </p>
          <div className="h-6 w-3/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
      ) : null}

      {result ? (
        <div className="card">
          {busy ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Menerjemahkan ulang…
            </p>
          ) : (
            <>
              {hasJa(result.translation ?? "") ? (
                /* JP: kanji hijau + furigana (kana dari pronunciation "かな (romaji)"
                   yang dimuat otomatis) + romaji di-balik icon toggle */
                <div className="text-xl leading-relaxed font-medium">
                  <JaText
                    text={result.translation}
                    reading={usage?.pronunciation ?? undefined}
                    kanjiClassName="text-teal-700 dark:text-teal-400"
                    className="text-xl font-medium"
                  />
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-xl leading-relaxed font-medium">
                  {result.translation}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-1.5">
                {hasJa(result.translation ?? "") ? (
                  <SpeakButton
                    text={result.translation}
                    buttonClassName="rounded-lg p-1 text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950"
                  />
                ) : null}
                {/* Mesin penerjemah: Lara (hemat kuota AI) atau fallback AI */}
                <span
                  className={`badge text-[10px] ${
                    result.via === "lara"
                      ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                  title={result.note ?? undefined}
                >
                  {result.via === "lara" ? "via Lara" : "via AI"}
                  {result.cached ? " · cache" : ""}
                </span>
                {result.note ? (
                  <span className="text-[10px] text-zinc-400">Lara gagal: {result.note}</span>
                ) : null}
              </div>
              {/* Cara baca — auto-tampil buat teks bahasa target (EN/JP) */}
              {foreignSide && !hasJa(foreignSide) ? (
                <div className="mt-2 flex min-h-6 items-center gap-1.5">
                  {usage ? (
                    <>
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        {usage.pronunciation}
                      </span>
                      <SpeakButton
                        text={foreignSide}
                        buttonClassName="rounded-full p-0.5"
                        className="h-4 w-4 text-teal-600 dark:text-teal-400"
                      />
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> memuat cara baca…
                    </span>
                  )}
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-1 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
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
                  disabled={saved || saving}
                  title="Simpan ke Library"
                >
                  {saved ? (
                    <>
                      <BookmarkCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" /> Tersimpan
                    </>
                  ) : saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…
                    </>
                  ) : (
                    <>
                      <Bookmark className="h-4 w-4" /> Simpan
                    </>
                  )}
                </button>
              </div>

              {/* Contoh penggunaan — ikut termuat otomatis */}
              {usage?.examples.length ? (
                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <p className="label mb-1">Contoh penggunaan</p>
                  <ul className="space-y-2">
                    {usage.examples.map((ex, i) => (
                      <li key={i} className="text-sm">
                        {hasJa(ex.en) ? (
                          /* JP: format sama — kanji hijau + furigana kana + romaji toggle */
                          <span className="block text-zinc-800 dark:text-zinc-200">
                            <JaText
                              text={ex.en}
                              reading={ex.kana ?? undefined}
                              romaji={ex.romaji ?? undefined}
                              kanjiClassName="text-teal-700 dark:text-teal-400"
                              className="text-sm"
                            />
                          </span>
                        ) : (
                          <span className="block text-zinc-800 dark:text-zinc-200">
                            <Highlight text={ex.en} highlight={highlightWord} />
                          </span>
                        )}
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{ex.id}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
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

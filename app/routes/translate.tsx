import type { MetaFunction } from "react-router";
import { useEffect, useRef, useState } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import {
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  Copy,
  Loader2,
  PenTool,
  Volume2,
  X,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { JaText, hasJa } from "~/components/JaText";
import { Highlight } from "~/components/Highlight";
import { KanjiDraw, type DrawStroke } from "~/components/KanjiDraw";
import { KanjiRadical } from "~/components/KanjiRadical";
import { KanjiSheet } from '~/components/KanjiSheet';
import { buildRefPatternsAll, recognize, type KanjiPattern, type Stroke } from "~/lib/kanji-match2";
import type { KanjiDetail } from "~/lib/kanji.server";
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

  // Cara baca + contoh: di-fetch LANGSUNG bareng hasil translate (paralel di
  // dalam handler yang sama), bukan efek terpisah yang nunggu serial.
  // matcha: dulu efek [result,busy] = translate selesai → baru mulai contoh
  // (2 round-trip AI beruntun). Sekarang 1x nunggu untuk dua-duanya.
  const usageKey = useRef("");
  const usageSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetchUsage = (foreignText: string, dir: string, signal: AbortSignal) => {
    const foreign = foreignText.trim();
    if (!foreign) return;
    const key = `${dir}:${foreign.slice(0, 300)}`;
    if (usageKey.current === key) return;
    usageKey.current = key;
    const mySeq = ++usageSeq.current;
    setUsageBusy(true);
    void (async () => {
      try {
        const res = await fetch("/api/usage-examples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: foreign.slice(0, 300), direction: dir }),
          signal,
        });
        const data = await res.json();
        if (usageSeq.current === mySeq && data.result) setUsage(data.result);
      } catch {
        /* abort / gagal diam — cara baca bersifat opsional */
      } finally {
        if (usageSeq.current === mySeq) setUsageBusy(false);
      }
    })();
  };

  // Mode JA = MANUAL: ngetik hiragana lambat + jeda = auto-fire berkali-kali
  // di tengah komposisi IME → boros kuota Lara/LLM. EN/ID tetap auto.
  // matcha: tiap jeda >500ms = 1 translate + 1 usage sia-sia.
  const composingRef = useRef(false);
  const [compTick, setCompTick] = useState(0);

  const doTranslate = async (t: string, mySeq: number, ctrl: AbortController) => {
    setBusy(true);
    try {
      const to = from === "ja" ? "id" : from === "en" ? "id" : ja ? "ja" : "en";
      const dir = from === "ja" ? "ja2id" : from === "en" ? "en2id" : ja ? "id2ja" : "id2en";
      // Contoh + cara baca butuh sisi asing: kalau from=id itu HASIL translate
      // (belum ada → nunggu), kalau from=en/ja itu INPUT (udah ada → paralel).
      if (from !== "id") fetchUsage(t, dir, ctrl.signal);
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: t.slice(0, 2000),
          from,
          to,
          style: active.style,
          tone: active.tone || undefined,
          prefer: "lara",
        }),
        signal: ctrl.signal,
      });
      const data = await res.json();
      if (seq.current !== mySeq) return;
      if (!res.ok) {
        toast(data.error ?? "Gagal menerjemahkan");
        setResult(null);
      } else {
        setResult(data);
        setSaved(false);
        // Jangan null-kan usage kalau key-nya udah cocok (paralel menang) —
        // dulu setUsage(null) + reset key bikin fetch ulang sia-sia tiap hasil.
        const finalKey = `${dir}:${(from === "id" ? (data.translation ?? "") : t).slice(0, 300)}`;
        if (usageKey.current !== finalKey) {
          setUsage(null);
          if (from === "id") fetchUsage(data.translation ?? "", dir, ctrl.signal);
        }
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (seq.current === mySeq) toast("Server nggak merespons");
    } finally {
      if (seq.current === mySeq) setBusy(false);
    }
  };

  // ── Mode kanji (coret → kenali → analisis → simpan) ──
  const [drawTab, setDrawTab] = useState<"teks" | "kanji">("teks");
  const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
  const [cands, setCands] = useState<{ char: string; score: number }[]>([]);
  const [candBusy, setCandBusy] = useState(false);
  const [selDetail, setSelDetail] = useState<KanjiDetail | null>(null);
  const [selRefLevel, setSelRefLevel] = useState<number | null>(null);
  const [savingKanji, setSavingKanji] = useState(false);
  const [savedKanji, setSavedKanji] = useState<string | null>(null);
  const refPatternsRef = useRef<KanjiPattern[] | null>(null);

  // Kenali 400ms setelah pena diangkat (debounce) — refPatterns lazy-load sekali.
  useEffect(() => {
    if (drawTab !== "kanji" || drawStrokes.length === 0) {
      setCands([]);
      setCandBusy(false);
      return;
    }
    setCandBusy(true);
    const t = setTimeout(async () => {
      try {
        if (!refPatternsRef.current) {
          // Semua kanji KanjiVG (2380). Dulu cuma 638 (N5-N3), jadi kanji
          // N2/N1 tidak pernah muncul sebagai kandidat.
          refPatternsRef.current = await buildRefPatternsAll();
        }
        setCands(recognize(drawStrokes, refPatternsRef.current, 24));
      } catch {
        /* data gagal muat — diam */
      } finally {
        setCandBusy(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [drawStrokes, drawTab]);

  const pickKanji = async (char: string) => {
    setSelDetail(null);
    setSavedKanji(null);
    setSelRefLevel(null);
    try {
      const r = await fetch(`/api/kanji?detail=${encodeURIComponent(char)}`);
      const d = await r.json();
      if (d.detail) {
        setSelRefLevel(d.detail.jlpt);
        setSelDetail(d.detail as KanjiDetail);
        return;
      }
      // Fallback: kanji tidak di DB (template N5-N3, DB cuma N5) → bangun detail minimal dari template + kanjiapi.dev
      const mod = await import("../../data/kanji-strokes.json");
      const tpl = (mod.default as unknown as Record<string, Stroke[]>)[char];
      if (tpl) {
        const strokes = tpl.length;
        // Coba ambil dari kanjiapi.dev (public, no key)
        let meaningId = "";
        let on: { text: string; primary: boolean }[] = [];
        let kun: { text: string; primary: boolean }[] = [];
        let grade: number | null = null;
        let freq: number | null = null;
        let jlpt: number | null = null;
        try {
          const api = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
          if (api.ok) {
            const j = await api.json();
            meaningId = j.meanings?.join(", ") ?? "";
            on = (j.on_readings ?? []).map((r: string, i: number) => ({ text: r, primary: i === 0 }));
            kun = (j.kun_readings ?? []).map((r: string, i: number) => ({ text: r, primary: i === 0 }));
            grade = j.grade ?? null;
            freq = j.freq ?? null;
            jlpt = j.jlpt ?? null;
          }
        } catch {
          /* offline / gagal — pakai data minimal */
        }
        if (!meaningId) meaningId = `(kanji U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(5, "0")})`;
        setSelDetail({
          char,
          meaningId,
          strokes,
          grade,
          freq,
          jlpt,
          svg: null,
          on,
          kun,
          components: [],
          vocab: [],
        } as KanjiDetail);
      } else {
        toast("Kanji tak dikenal");
      }
    } catch {
      toast("Gagal muat detail kanji");
    }
  };

  const saveKanji = async () => {
    if (!selDetail || savingKanji) return;
    setSavingKanji(true);
    try {
      const r = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selDetail.char,
          type: "kanji",
          meaningId: selDetail.meaningId,
          reading: selDetail.on[0]?.text ?? selDetail.kun[0]?.text ?? null,
          source: "draw",
          examples: selDetail.vocab.slice(0, 2).map((v) => ({
            en: v.word,
            idText: v.gloss,
            kana: v.reading,
          })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.reference) {
        let lv = '';
        if (d.jlpt) lv = ' N' + d.jlpt;
        toast('Kanji ini sudah ada di referensi' + lv);
      } else if (r.status === 409 || d.duplicateOf) {
        toast("Kanji ini sudah ada di Library");
      } else if (d.ok ?? r.ok) {
        setSavedKanji(selDetail.char);
        toast("Kanji tersimpan — cek Simpanan di Aksara");
      } else {
        throw new Error(d.error ?? "Gagal menyimpan");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSavingKanji(false);
    }
  };

  // Tombol manual (mode JA): tembak sekali, batalkan request lama.
  const runManual = () => {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    const mySeq = ++seq.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Reset kunci contoh — preset/style baru = fetch ulang, bukan skip.
    // matcha: usageKey basi → contoh tak pernah muncul lagi setelah ganti preset.
    usageKey.current = "";
    void doTranslate(t, mySeq, ctrl);
  };

  useEffect(() => {
    const t = text.trim();
    const mySeq = ++seq.current;
    // Batalkan request lama tiap input/gaya berubah — biar request basi mati
    // di jaringan, bukan cuma diabaikan. matcha: tanpa abort, typo-fix = 2
    // translate + 2 usage jalan bareng, spinner rebutan + hasil telat.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (t.length < 2) {
      setResult(null);
      setUsage(null);
      setBusy(false);
      setUsageBusy(false);
      return;
    }
    if (from === "ja") {
      // Manual: hasil lama (arah lain / teks lama) dibersihkan tiap ketikan.
      setResult(null);
      setUsage(null);
      setBusy(false);
      setUsageBusy(false);
      return;
    }
    if (composingRef.current) return; // IME masih composing → tunggu selesai
    const timer = setTimeout(() => void doTranslate(t, mySeq, ctrl), 500);
    return () => {
      clearTimeout(timer);
    };
  }, [text, from, preset, toast, active.style, active.tone, ja, compTick]);

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
      {/* Mode: teks vs coret kanji (hanya di mode JA) */}
      {ja ? (
        <div className="flex gap-1.5">
          <button
            className={`chip flex-1 justify-center ${drawTab === "teks" ? "chip-active" : ""}`}
            onClick={() => setDrawTab("teks")}
            aria-pressed={drawTab === "teks"}
          >
            Teks
          </button>
          <button
            className={`chip flex-1 justify-center ${drawTab === "kanji" ? "chip-active" : ""}`}
            onClick={() => setDrawTab("kanji")}
            aria-pressed={drawTab === "kanji"}
            title="Coret kanji yang tak bisa diketik"
          >
            <PenTool className="h-4 w-4" /> Kanji
          </button>
        </div>
      ) : null}
      {drawTab === "kanji" ? (
        <div className="card space-y-3">
          <div>
            <p className="font-semibold">Coret kanjinya</p>
            <p className="text-xs text-zinc-500">
              Ketemu kanji baru di anime/papan? Tulis di sini — urutan gores tak harus benar.
            </p>
          </div>
          <KanjiDraw
            onChange={(s) => {
              setDrawStrokes(s);
              setSelDetail(null);
            }}
          />
          {candBusy ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengenali…
            </p>
          ) : null}
          {cands.length > 0 ? (
            <div>
              <p className="label mb-1.5">Tap yang benar ({cands.length} kandidat)</p>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
                {cands.map((c) => (
                  <button
                    key={c.char}
                    className={`btn-secondary justify-center py-2.5 text-2xl ${
                      selDetail?.char === c.char ? "!border-teal-500 !bg-teal-50 dark:!bg-teal-950" : ""
                    }`}
                    onClick={() => void pickKanji(c.char)}
                  >
                    {c.char}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">
                Tak ada yang benar? Kurangi/tambah gores, atau gambar lebih besar.
              </p>
            </div>
          ) : null}
          {selDetail ? (
            <KanjiSheet detail={selDetail} onClose={() => setSelDetail(null)} onEnriched={setSelDetail}>
              {selRefLevel ? (
                <div className='space-y-2'>
                  <p className='text-xs text-muted'>
                    Kanji ini sudah ada di referensi N{selRefLevel}. Tidak perlu disimpan lagi.
                  </p>
                  <a
                    href={'/aksara?script=kanji&level=N' + selRefLevel}
                    className='btn-secondary w-full'
                    onClick={() => setSelDetail(null)}
                  >
                    Buka di Aksara
                  </a>
                </div>
              ) : (
                <button
                  className='btn-primary w-full'
                  disabled={savingKanji || savedKanji === selDetail.char}
                  onClick={() => void saveKanji()}
                >
                  {savedKanji === selDetail.char ? (
                    <>
                      <BookmarkCheck className='h-4 w-4' /> Tersimpan
                    </>
                  ) : (
                    <>
                      <Bookmark className='h-4 w-4' /> Simpan ke list kanji
                    </>
                  )}
                </button>
              )}
            </KanjiSheet>
          ) : null}
          <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <KanjiRadical onPick={(c) => void pickKanji(c)} />
          </div>
          <p className="text-[11px] text-zinc-400">
            Data: KanjiVG (CC BY-SA 3.0) + KRADFILE (EDRDG) · coretan: 2380 kanji (N5–N1).
          </p>
        </div>
      ) : (
      <>
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
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              setCompTick((n) => n + 1);
            }}
            onKeyDown={(e) => {
              if (from === "ja" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) runManual();
            }}
            placeholder={
              from === "ja"
                ? "Tulis bahasa Jepang… lalu tekan Terjemahkan (Ctrl+Enter)"
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
        {from === "ja" ? (
          <button
            className="btn-primary w-full"
            disabled={busy || text.trim().length < 2}
            onClick={runManual}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Menerjemahkan…
              </>
            ) : (
              "Terjemahkan"
            )}
          </button>
        ) : null}
      </div>

      </>)}
      {drawTab === "teks" ? (<>
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

      </>) : null}

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

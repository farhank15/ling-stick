import type { MetaFunction } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Type,
  Volume2,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { ttsLang } from "~/lib/utils.shared";
import { JaText, hasJa, splitReading } from "~/components/JaText";
import { useToast } from "~/components/Toast";

function speak(s: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(s);
  u.lang = lang ?? ttsLang(s);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export const meta: MetaFunction = () => [{ title: "Bank Kata — LingStick" }];
// ownHeader: halaman punya header sendiri (judul + stat) — jangan dirender dobel oleh layout.
export const handle = { title: "Bank Kata", ownHeader: true };

type BankExample = { en: string; id: string };
type Entry = {
  id: number;
  text: string;
  type: string;
  register: string;
  cefr: string;
  meaningId: string;
  useWhenId: string | null;
  examples: BankExample[];
  status: "new" | "learning" | "known";
  itemId: number | null;
  reading?: string | null; // JA: kana (+ romaji)
};
type Stats = {
  byLevel: Record<string, number>;
  total: number;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const LEVELS_JA = ["N5", "N4", "N3", "N2", "N1"] as const;

const LEVEL_STYLE: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  A2: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  B1: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  B2: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  C1: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  C2: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  N5: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  N4: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  N3: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  N2: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  N1: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const LEVEL_ACTIVE: Record<string, string> = {
  A1: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
  A2: "border-teal-500 bg-teal-50 dark:bg-teal-950/60",
  B1: "border-sky-500 bg-sky-50 dark:bg-sky-950/60",
  B2: "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60",
  C1: "border-violet-500 bg-violet-50 dark:bg-violet-950/60",
  C2: "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
  N5: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
  N4: "border-teal-500 bg-teal-50 dark:bg-teal-950/60",
  N3: "border-sky-500 bg-sky-50 dark:bg-sky-950/60",
  N2: "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60",
  N1: "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
};

const ACTION_LABEL: Record<string, string> = {
  learn: "Masuk Library — siap dilatihan",
  know: "Ditandai sudah tahu",
};

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  // Level label ikut bahasa target: CEFR (EN) atau JLPT (JA).
  return { lang: await getTargetLang() };
}

export default function BankPage() {
  const { lang } = useLoaderData<typeof loader>();
  // Level ikut bahasa target: CEFR (EN) / JLPT (JA). Default gen: tengah level list.
  const LEVEL_TABS = lang === "ja" ? LEVELS_JA : LEVELS;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [level, setLevel] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showRomajiId, setShowRomajiId] = useState<number | null>(null); // toggle romaji di detail
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [genLevel, setGenLevel] = useState<string>(lang === "ja" ? "N4" : "B1");
  const [genCount, setGenCount] = useState(10);
  const [genTopic, setGenTopic] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const toast = useToast();

  // Swipe kiri/kanan per kartu
  const [dragId, setDragId] = useState<number | null>(null);
  const [drag, setDrag] = useState(0);
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);
  /** Kartu yang sedang/udah diproses — guard spam-swipe & dobel-tap. */
  const processedIds = useRef<Set<number>>(new Set());

  const refresh = useCallback(async (nextLevel: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextLevel !== "all") params.set("cefr", nextLevel);
      const r = await fetch(`/api/bank?${params.toString()}`);
      const d = await r.json();
      setEntries(d.entries ?? []);
      setStats(d.stats ? { byLevel: d.stats.byLevel ?? {}, total: d.stats.total ?? 0 } : null);
    } catch {
      /* biarkan data lama */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh("all");
  }, [refresh]);

  /** Aksi sukses → entri langsung hilang dari bank (udah pindah ke Library / ditandai tahu).
   * Optimistic: UI update instan, request jalan di belakang — spam-swipe aman. */
  const setStatus = async (id: number, action: "learn" | "know") => {
    if (processedIds.current.has(id)) return;
    processedIds.current.add(id);
    const done = entries.find((e) => e.id === id);
    setEntries((list) => list.filter((e) => e.id !== id));
    setStats((s) =>
      s
        ? {
            total: Math.max(0, s.total - 1),
            byLevel: done
              ? { ...s.byLevel, [done.cefr]: Math.max(0, (s.byLevel[done.cefr] ?? 1) - 1) }
              : s.byLevel,
          }
        : s,
    );
    navigator.vibrate?.(15);
    toast(ACTION_LABEL[action]);
    try {
      const r = await fetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Gagal menyimpan");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan — status dipulihkan");
      processedIds.current.delete(id);
      refresh(level); // pulihkan sesuai state server
    }
  };

  const generate = async () => {
    setGenBusy(true);
    try {
      const r = await fetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", level: genLevel, count: genCount, topic: genTopic }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Generate gagal");
      toast(`${d.added} kata baru masuk bank${d.skipped ? ` (${d.skipped} duplikat dilewati)` : ""}`);
      setGenOpen(false);
      refresh(genLevel);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generate gagal");
    } finally {
      setGenBusy(false);
    }
  };

  /* ── Swipe handlers ── */
  const onSwipeStart = (id: number, clientX: number) => {
    dragStartX.current = clientX;
    dragging.current = true;
    moved.current = false;
    setDragId(id);
    setDrag(0);
  };
  const onSwipeMove = (clientX: number) => {
    if (!dragging.current) return;
    const dx = clientX - dragStartX.current;
    if (Math.abs(dx) > 6) moved.current = true;
    setDrag(dx);
  };
  const onSwipeEnd = (id: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = drag;
    setDrag(0);
    setDragId(null);
    if (processedIds.current.has(id)) return; // udah diproses — abaikan spam
    if (dx < -90) {
      void setStatus(id, "learn");
    } else if (dx > 90) {
      void setStatus(id, "know");
    }
  };

  const visible = entries.filter((e) =>
    query.trim() ? e.text.toLowerCase().includes(query.trim().toLowerCase()) : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Bank Kata</h1>
          <p className="text-xs text-zinc-500">
            {stats
              ? `${stats.total} kata siap dipelajari`
              : `Katalog kosakata per level ${lang === "ja" ? "JLPT" : "CEFR"}`}
          </p>
        </div>
        <button className="btn-primary gap-1.5 text-sm" onClick={() => setGenOpen((o) => !o)}>
          <Plus className="h-4 w-4" /> Tambah
        </button>
      </div>

      {genOpen ? (
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <p className="text-sm font-semibold">Generate kata baru (AI)</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LEVEL_TABS.map((l) => (
              <button
                key={l}
                onClick={() => setGenLevel(l)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  genLevel === l
                    ? `${LEVEL_ACTIVE[l]} text-zinc-900 dark:text-white`
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[5, 10, 15, 20].map((n) => (
              <button
                key={n}
                onClick={() => setGenCount(n)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  genCount === n
                    ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                {n} kata
              </button>
            ))}
          </div>
          <input
            className="input-area text-sm"
            placeholder="Tema (opsional) — mis. travel, kantor, meme"
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
          />
          <button className="btn-primary w-full gap-1.5" disabled={genBusy} onClick={generate}>
            {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {genBusy ? "Lagi generate…" : "Generate via AI"}
          </button>
        </div>
      ) : null}

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button
          onClick={() => {
            setLevel("all");
            refresh("all");
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            level === "all"
              ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
              : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          }`}
        >
          Semua
          <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {stats?.total ?? "…"}
          </span>
        </button>
        {LEVEL_TABS.map((l) => (
          <button
            key={l}
            onClick={() => {
              setLevel(l);
              refresh(l);
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              level === l
                ? `${LEVEL_ACTIVE[l]} text-zinc-900 dark:text-white`
                : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            }`}
          >
            {l}
            <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {stats?.byLevel?.[l] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          className="input-area pl-9 text-sm"
          placeholder="Cari kata di bank…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse space-y-2 p-4">
              <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800/60" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center">
          <BookMarked className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
          <p className="mt-3 font-medium">Bank masih kosong di filter ini</p>
          <p className="mt-1 text-sm text-zinc-500">
            Pakai tombol Tambah buat generate kata baru via AI.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((e) => {
              const isOpen = expanded === e.id;
              const isDrag = dragId === e.id;
              const dx = isDrag ? drag : 0;
              return (
                <li key={e.id} className="relative">
                  {/* Overlay swipe */}
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center rounded-2xl border-2 border-teal-400 bg-teal-50/95 px-4 dark:bg-teal-950/90"
                    style={{ opacity: dx < -10 ? Math.min(1, -dx / 90) : 0 }}
                  >
                    <span className="rounded-lg bg-teal-600 px-2 py-1 text-[10px] font-bold text-white">
                      MAU DIPELAJARI
                    </span>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end rounded-2xl border-2 border-zinc-400 bg-zinc-100/95 px-4 dark:bg-zinc-800/90"
                    style={{ opacity: dx > 10 ? Math.min(1, dx / 90) : 0 }}
                  >
                    <span className="rounded-lg bg-zinc-600 px-2 py-1 text-[10px] font-bold text-white">
                      SUDAH TAHU
                    </span>
                  </div>

                  <div
                    className="card cursor-pointer select-none overflow-hidden transition-transform"
                    style={{
                      transform: `translateX(${dx}px) rotate(${dx / 40}deg)`,
                      transition: dragging.current && isDrag ? "none" : "transform 160ms ease",
                    }}
                    onTouchStart={(ev) => onSwipeStart(e.id, ev.touches[0].clientX)}
                    onTouchMove={(ev) => onSwipeMove(ev.touches[0].clientX)}
                    onTouchEnd={() => onSwipeEnd(e.id)}
                  >
                    {/* div (bukan button) biar toggle romaji di JaText bisa jadi button di dalamnya */}
                    <div
                      role="button"
                      tabIndex={0}
                      className="flex w-full cursor-pointer items-center gap-2 p-4 text-left"
                      onClick={() => {
                        if (moved.current) return;
                        setExpanded(isOpen ? null : e.id);
                      }}
                    >
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_STYLE[e.cefr] ?? ""}`}
                      >
                        {e.cefr}
                      </span>
                      <span className="min-w-0 flex-1">
                        {hasJa(e.text) ? (
                          /* JA: kanji + furigana redup di atas. Tanpa icon toggle di sini
                             — baris list harus bersih; romaji di-toggle di detail. */
                          <span className="block font-semibold">
                            <JaText text={e.text} reading={e.reading} romajiToggle={false} className="font-semibold" />
                          </span>
                        ) : (
                          <span className="block truncate font-semibold">{e.text}</span>
                        )}
                        <span className="block truncate text-xs text-zinc-500">{e.meaningId}</span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </div>

                    {isOpen ? (
                      <div className="space-y-3 border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
                        {/* JA: cara baca + toggle romaji (icon T di sini, bukan di tiap baris list) */}
                        {e.reading
                          ? (() => {
                              const { kana, romaji } = splitReading(e.reading);
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                  <span className="text-zinc-400 dark:text-zinc-500">{kana || e.reading}</span>
                                  {romaji ? (
                                    <>
                                      <button
                                        className="inline-flex items-center gap-0.5 rounded p-0.5 text-zinc-300 hover:bg-zinc-100 hover:text-teal-600 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-teal-400"
                                        title={showRomajiId === e.id ? "Sembunyikan romaji" : "Tampilkan romaji"}
                                        aria-label={showRomajiId === e.id ? "Sembunyikan romaji" : "Tampilkan romaji"}
                                        onClick={() => setShowRomajiId(showRomajiId === e.id ? null : e.id)}
                                      >
                                        <Type className="h-3 w-3" strokeWidth={2} />
                                      </button>
                                      {showRomajiId === e.id ? (
                                        <span className="text-zinc-400 dark:text-zinc-500">({romaji})</span>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              );
                            })()
                          : null}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                          <span className="badge bg-zinc-100 dark:bg-zinc-800">{e.type}</span>
                          <span className="badge bg-zinc-100 dark:bg-zinc-800">{e.register}</span>
                          {e.useWhenId ? <span className="italic">{e.useWhenId}</span> : null}
                        </div>
                        {e.examples.length > 0 ? (
                          <ul className="space-y-2">
                            {e.examples.map((ex, i) => {
                              const jpLine = ex.en.split("\n")[0] ?? ex.en;
                              const romajiLine = ex.en.includes("\n") ? ex.en.split("\n").slice(1).join(" ") : null;
                              return (
                              <li key={i} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                                <div className="flex items-start gap-2">
                                  <div className="min-w-0 flex-1">
                                    {hasJa(jpLine) ? (
                                      /* JA: kalimat + furigana; romaji (baris ke-2) di-balik toggle */
                                      <JaText
                                        text={jpLine}
                                        romaji={romajiLine}
                                        className="text-sm font-medium"
                                      />
                                    ) : (
                                      <p className="whitespace-pre-line text-sm font-medium">{ex.en}</p>
                                    )}
                                  </div>
                                  <button
                                    className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
                                    title="Dengarkan"
                                    onClick={() => speak(jpLine)}
                                  >
                                    <Volume2 className="h-4 w-4" />
                                  </button>
                                </div>
                                <p className="mt-0.5 text-xs text-zinc-500">{ex.id}</p>
                              </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        <div className="flex gap-2 pt-1">
                          <button
                            className="btn-primary flex-1 gap-1.5 text-sm"
                            onClick={() => setStatus(e.id, "learn")}
                          >
                            <Layers className="h-4 w-4" />
                            Mau dipelajari
                          </button>
                          <button
                            className="btn-secondary flex-1 gap-1.5 text-sm"
                            onClick={() => setStatus(e.id, "know")}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Sudah tahu
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-center text-xs text-zinc-400">
            Swipe kiri = mau dipelajari · Swipe kanan = sudah tahu. Kata yang diproses otomatis
            keluar dari bank.
          </p>
        </>
      )}
    </div>
  );
}

import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigation, useRevalidator, useSearchParams } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, Circle, Loader2, Search, Trash2, Volume2 } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getFacetCounts, listItems } from "~/lib/items.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { SpeakButton } from "~/components/SpeakButton";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Library — LingStick" }];

import { ttsLang } from "~/lib/utils.shared";

function speak(text: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang ?? ttsLang(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
export const handle = { title: "Library" };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";
  const [rows, facets] = await Promise.all([
    listItems({
      q: url.searchParams.get("q") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      register: url.searchParams.get("register") ?? undefined,
      status,
      limit: 200,
    }),
    getFacetCounts(status),
  ]);
  return { rows, facets };
}

/** Filter baris chip — scroll horizontal, tanpa dropdown. */
const TYPE_CHIPS = [
  { v: "", label: "Semua" },
  { v: "word", label: "Kata" },
  { v: "phrasal_verb", label: "Phrasal" },
  { v: "idiom", label: "Idiom" },
  { v: "collocation", label: "Colloc" },
  { v: "slang", label: "Slang" },
  { v: "reaction", label: "Reaksi" },
  { v: "sentence", label: "Kalimat" },
];
const REGISTER_CHIPS = [
  { v: "", label: "Semua" },
  { v: "formal", label: "Formal" },
  { v: "neutral", label: "Netral" },
  { v: "informal", label: "Informal" },
  { v: "slang", label: "Slang" },
];

/** Tab status — satu-satunya filter baris: bersih, nggak tumpang tindih. */
const STATUS_TABS = [
  { v: "", label: "Belajar" },
  { v: "known", label: "Hafal" },
  { v: "all", label: "Semua" },
];

export default function Library() {
  const { rows, facets } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = params.get("q") ?? "";
  const type = params.get("type") ?? "";
  const register = params.get("register") ?? "";
  const status = params.get("status") ?? "";

  // Search di-debounce 400ms — dulu tiap ketikan = 1 request server (berat).
  const [qInput, setQInput] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qInput !== q) setParam("q", qInput);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  const nav = useNavigation();
  const searching = nav.state !== "idle";

  // Total dalam tab aktif (tanpa filter tipe/register) — buat chip "Semua".
  const totalInStatus = useMemo(
    () => Object.values(facets.byType).reduce((a, b) => a + b, 0),
    [facets.byType],
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { preventScrollReset: true });
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async (action: "known" | "learning" | "delete") => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          action === "delete"
            ? `${selected.size} item dihapus`
            : action === "known"
              ? `${selected.size} item ditandai hafal`
              : `${selected.size} item dipelajari lagi`,
        );
        setSelected(new Set());
        setConfirmDelete(false);
        setParams(params, { preventScrollReset: true });
      } else {
        toast("Gagal: " + (data.error ?? "?"));
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setSelected(new Set());
  }, [q, type, register, status]);

  /* ── Swipe kartu: kanan = hafal, kiri = pelajari lagi ── */
  const revalidator = useRevalidator();
  const [swipeId, setSwipeId] = useState<number | null>(null);
  const [swipeDx, setSwipeDx] = useState(0);
  const swipeStartX = useRef(0);
  const swiping = useRef(false);
  const swipeMoved = useRef(false);

  const swipeCommit = async (id: number, action: "known" | "learning") => {
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, action }),
      });
      if (!res.ok) throw new Error();
      toast(action === "known" ? "Ditandai hafal" : "Dipelajari lagi");
      navigator.vibrate?.(15);
      revalidator.revalidate();
    } catch {
      toast("Gagal menyimpan");
    }
  };

  const onRowSwipeStart = (id: number, clientX: number) => {
    swipeStartX.current = clientX;
    swiping.current = true;
    swipeMoved.current = false;
    setSwipeId(id);
    setSwipeDx(0);
  };
  const onRowSwipeMove = (clientX: number) => {
    if (!swiping.current) return;
    const dx = clientX - swipeStartX.current;
    if (Math.abs(dx) > 6) swipeMoved.current = true;
    setSwipeDx(dx);
  };
  const onRowSwipeEnd = (id: number) => {
    if (!swiping.current) return;
    swiping.current = false;
    const dx = swipeDx;
    setSwipeDx(0);
    setSwipeId(null);
    if (dx > 90) void swipeCommit(id, "known");
    else if (dx < -90) void swipeCommit(id, "learning");
  };

  return (
    <div className="space-y-3">
      {/* Toolbar sticky: search + tab + chip filter — nggak ikut ke-scroll */}
      <div className="sticky top-13 z-20 -mx-4 space-y-2 bg-zinc-50 px-4 pb-2 pt-1 dark:bg-zinc-950">
      {/* Search */}
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className="input pl-9 pr-9"
            type="search"
            placeholder="Cari kata / arti…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          {searching ? (
            <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-teal-600" />
          ) : null}
        </div>
      </form>

      {/* Tab status — segmented control full width (Belajar | Hafal | Semua) */}
      <div className="grid w-full grid-cols-3 rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-900">
        {STATUS_TABS.map((t) => (
          <Link
            key={`tab-${t.v}`}
            to={buildUrl(params, "status", t.v)}
            className={`rounded-lg px-2.5 py-1.5 text-center text-xs font-medium transition-colors ${
              status === t.v
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Filter tipe + register — satu baris chip, scroll horizontal, ada count */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
        {TYPE_CHIPS.map((c) => {
          const n = c.v === "" ? totalInStatus : facets.byType[c.v] ?? 0;
          return (
            <button
              key={`t-${c.v}`}
              className={`chip min-h-8 shrink-0 gap-1 px-2.5 text-[11px] ${type === c.v ? "chip-active" : ""}`}
              onClick={() => setParam("type", c.v)}
            >
              {c.label}
              {n > 0 ? (
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    type === c.v
                      ? "bg-white/20 dark:bg-black/20"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
        <span className="mx-1 w-px shrink-0 self-stretch bg-zinc-200 dark:bg-zinc-800" />
        {REGISTER_CHIPS.map((c) => {
          const n = c.v === "" ? totalInStatus : facets.byRegister[c.v] ?? 0;
          return (
            <button
              key={`r-${c.v}`}
              className={`chip min-h-8 shrink-0 gap-1 px-2.5 text-[11px] ${register === c.v ? "chip-active" : ""}`}
              onClick={() => setParam("register", c.v)}
            >
              {c.label}
              {n > 0 ? (
                <span
                  className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                    register === c.v
                      ? "bg-white/20 dark:bg-black/20"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

        {/* Aksi massal — nempel di bawah chip filter, warna menyatu dgn tema */}
        {selected.size > 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-teal-600 px-3 py-2 text-sm text-white">
            <span className="font-medium">{selected.size} dipilih</span>
            <button
              className="ml-auto rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-medium hover:bg-white/25"
              disabled={busy}
              onClick={() => void bulk("known")}
            >
              <BadgeCheck className="mr-1 inline h-3.5 w-3.5" /> Hafal
            </button>
            <button
              className="rounded-lg bg-white/15 px-2.5 py-1.5 text-xs font-medium hover:bg-white/25"
              disabled={busy}
              onClick={() => void bulk("learning")}
            >
              Ulang
            </button>
            <button
              className="rounded-lg bg-red-500/90 px-2.5 py-1.5 text-xs font-medium hover:bg-red-500"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Hapus
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Hapus item terpilih?"
        message={`${selected.size} item beserta kartu reviewnya akan dihapus permanen.`}
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          {q || type || register || status
            ? "Nggak ada yang cocok."
            : "Belum ada item. Mulai dari tab Tambah!"}
        </p>
      ) : (
        // Desktop: 2 kolom (satu lajur di 5xl = baris melar).
        <ul className="grid gap-2 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="relative">
              {/* Checkbox lingkaran — TANPA z-index, biar gak nembus di atas toolbar
                  sticky saat scroll (posisi absolute sudah di atas konten kartu). */}
              <button
                className="absolute top-4 left-3 text-zinc-300 hover:text-teal-600 dark:text-zinc-600"
                onClick={() => toggle(r.id)}
                aria-label="Pilih item"
              >
                {selected.has(r.id) ? (
                  <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </button>
              {/* Overlay swipe */}
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center rounded-xl border-2 border-amber-400 bg-amber-50/95 px-4 dark:bg-amber-950/90"
                style={{ opacity: swipeId === r.id && swipeDx < -10 ? Math.min(1, -swipeDx / 90) : 0 }}
              >
                <span className="rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-bold text-white">
                  PELAJARI LAGI
                </span>
              </div>
              <div
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end rounded-xl border-2 border-teal-400 bg-teal-50/95 px-4 dark:bg-teal-950/90"
                style={{ opacity: swipeId === r.id && swipeDx > 10 ? Math.min(1, swipeDx / 90) : 0 }}
              >
                <span className="rounded-lg bg-teal-600 px-2 py-1 text-[10px] font-bold text-white">
                  HAFAL
                </span>
              </div>
              {/* Speaker kata — di luar Link biar gak nested interactive */}
              <SpeakButton
                text={r.text}
                buttonClassName="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-100 hover:text-teal-600 dark:text-zinc-600 dark:hover:bg-zinc-800"
                title="Cara baca"
              />
              <Link
                to={`/library/${r.id}`}
                onClick={(e) => {
                  if (swipeMoved.current) e.preventDefault();
                }}
                style={{
                  transform: swipeId === r.id ? `translateX(${swipeDx}px)` : undefined,
                  transition: swiping.current && swipeId === r.id ? "none" : "transform 160ms ease",
                }}
                className="card block py-3 pr-11 pl-10 transition-colors hover:border-teal-500 dark:hover:border-teal-500"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.text}</span>
                  {r.status === "known" ? (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                  ) : null}
                </div>
                {r.meaningId ? (
                  <p className="mt-0.5 line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {r.meaningId}
                  </p>
                ) : null}
                {r.firstExampleEn ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400 dark:text-zinc-500">
                    “{r.firstExampleEn}”
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildUrl(params: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  const qs = next.toString();
  return `/library${qs ? `?${qs}` : ""}`;
}

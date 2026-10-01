import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CheckCircle2, Circle, Search, Trash2 } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getFacetCounts, listItems } from "~/lib/items.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Library — LingStick" }];
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

  return (
    <div className="space-y-3">
      {/* Toolbar sticky: search + tab + chip filter — nggak ikut ke-scroll */}
      <div className="sticky top-[52px] z-20 -mx-4 space-y-2 bg-zinc-50 px-4 pb-2 pt-1 dark:bg-zinc-950">
      {/* Search */}
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className="input pl-9"
            type="search"
            placeholder="Cari kata / arti…"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>
      </form>

      {/* Tab status + dropdown filter — minimalis */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {STATUS_TABS.map((t) => (
            <Link
              key={`tab-${t.v}`}
              to={buildUrl(params, "status", t.v)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                status === t.v
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
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

      </div>

      {/* Aksi massal */}
      {selected.size > 0 ? (
        <div className="sticky top-16 z-10 flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
          <span className="font-medium">{selected.size} dipilih</span>
          <button className="btn-secondary ml-auto min-h-9" disabled={busy} onClick={() => void bulk("known")}>
            <BadgeCheck className="h-4 w-4" /> Hafal
          </button>
          <button className="btn-secondary min-h-9" disabled={busy} onClick={() => void bulk("learning")}>
            Ulang
          </button>
          <button
            className="btn-danger min-h-9"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" /> Hapus
          </button>
        </div>
      ) : null}

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
        <ul className="space-y-2">
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
              <Link
                to={`/library/${r.id}`}
                className="card block py-3 pl-10 transition-colors hover:border-teal-500 dark:hover:border-teal-500"
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

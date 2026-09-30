import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, CheckSquare, ChevronDown, Search, Square, Trash2 } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { listItems } from "~/lib/items.server";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Library — LingStick" }];
export const handle = { title: "Library" };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const rows = await listItems({
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    register: url.searchParams.get("register") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: 200,
  });
  return { rows };
}

const TYPES = [
  { v: "", label: "Semua tipe" },
  { v: "word", label: "Kata" },
  { v: "phrasal_verb", label: "Phrasal verb" },
  { v: "idiom", label: "Idiom" },
  { v: "collocation", label: "Collocation" },
  { v: "slang", label: "Slang" },
  { v: "reaction", label: "Reaksi" },
  { v: "sentence", label: "Kalimat" },
];

const REGISTERS = [
  { v: "", label: "Semua register" },
  { v: "formal", label: "Formal" },
  { v: "neutral", label: "Netral" },
  { v: "informal", label: "Informal" },
  { v: "slang", label: "Slang" },
];

/** Tab status — default "Belajar" (learning saja), "Semua" = learning+hafal. */
const STATUS_TABS = [
  { v: "", label: "Belajar" },
  { v: "known", label: "Hafal" },
  { v: "all", label: "Semua" },
];

export default function Library() {
  const { rows } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = params.get("q") ?? "";
  const type = params.get("type") ?? "";
  const register = params.get("register") ?? "";
  const status = params.get("status") ?? "";

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
        <span className="flex-1" />
        <FilterDropdown
          label={TYPES.find((t) => t.v === type)?.label ?? "Tipe"}
          active={Boolean(type)}
          options={TYPES}
          onPick={(v) => setParam("type", v)}
        />
        <FilterDropdown
          label={REGISTERS.find((r) => r.v === register)?.label ?? "Register"}
          active={Boolean(register)}
          options={REGISTERS}
          onPick={(v) => setParam("register", v)}
        />
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
              <button
                className="absolute top-4 left-3 z-10 text-zinc-400 hover:text-teal-600"
                onClick={() => toggle(r.id)}
                aria-label="Pilih item"
              >
                {selected.has(r.id) ? (
                  <CheckSquare className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                ) : (
                  <Square className="h-5 w-5" />
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

function FilterDropdown({
  label,
  active,
  options,
  onPick,
}: {
  label: string;
  active: boolean;
  options: { v: string; label: string }[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className={`chip min-h-9 gap-1 ${active ? "chip-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            {options.map((o) => (
              <button
                key={o.v}
                className={`block w-full px-3.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  o.v === "" ? "border-t border-zinc-100 text-zinc-500 dark:border-zinc-800" : ""
                }`}
                onClick={() => {
                  onPick(o.v);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
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

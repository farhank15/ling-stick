import type { MetaFunction } from "react-router";
import { useCallback, useEffect, useState } from "react";
import {
  BookMarked,
  CheckCircle2,
  ChevronDown,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Volume2,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { useToast } from "~/components/Toast";

function speak(s: string, lang = "en-US") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(s);
  u.lang = lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export const meta: MetaFunction = () => [{ title: "Bank Kata — LingStick" }];
export const handle = { title: "Bank Kata" };

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
};
type Stats = {
  byLevel: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
  learning: number;
  known: number;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const LEVEL_STYLE: Record<string, string> = {
  A1: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  A2: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  B1: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  B2: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  C1: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  C2: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const LEVEL_ACTIVE: Record<string, string> = {
  A1: "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60",
  A2: "border-teal-500 bg-teal-50 dark:bg-teal-950/60",
  B1: "border-sky-500 bg-sky-50 dark:bg-sky-950/60",
  B2: "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60",
  C1: "border-violet-500 bg-violet-50 dark:bg-violet-950/60",
  C2: "border-rose-500 bg-rose-50 dark:bg-rose-950/60",
};

const STATUS_BADGE: Record<Entry["status"], { label: string; cls: string } | null> = {
  learning: {
    label: "Dipelajari",
    cls: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  },
  known: {
    label: "Sudah tahu",
    cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
  new: null,
};

const ACTION_LABEL: Record<string, string> = {
  learn: "Masuk daftar pelajari",
  know: "Ditandai sudah tahu",
  reset: "Status direset",
};

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  return null;
}

export default function BankPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [level, setLevel] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [genLevel, setGenLevel] = useState("B1");
  const [genCount, setGenCount] = useState(10);
  const [genTopic, setGenTopic] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async (nextLevel: string, nextStatus: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextLevel !== "all") params.set("cefr", nextLevel);
      if (nextStatus !== "all") params.set("status", nextStatus);
      const r = await fetch(`/api/bank?${params.toString()}`);
      const d = await r.json();
      setEntries(d.entries ?? []);
      setStats(d.stats ?? null);
    } catch {
      /* biarkan data lama */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh("all", "all");
  }, [refresh]);

  const setStatus = async (id: number, action: "learn" | "know" | "reset") => {
    setBusyId(id);
    try {
      const r = await fetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Gagal menyimpan");
      setEntries((list) =>
        list.map((e) =>
          e.id === id
            ? {
                ...e,
                status: action === "learn" ? ("learning" as const) : action === "know" ? ("known" as const) : ("new" as const),
              }
            : e,
        ),
      );
      setStats((s) =>
        s
          ? {
              ...s,
              learning:
                action === "learn"
                  ? s.learning + 1
                  : action === "know" && s.learning > 0
                    ? s.learning - 1
                    : s.learning,
              known:
                action === "know"
                  ? s.known + 1
                  : action === "learn" && s.known > 0
                    ? s.known - 1
                    : s.known,
            }
          : s,
      );
      toast(ACTION_LABEL[action]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusyId(null);
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
      refresh(genLevel, statusFilter);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generate gagal");
    } finally {
      setGenBusy(false);
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
              ? `${stats.total} kata · ${stats.learning} dipelajari · ${stats.known} sudah tahu`
              : "Katalog kosakata per level CEFR"}
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
            {LEVELS.map((l) => (
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
            refresh("all", statusFilter);
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
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => {
              setLevel(l);
              refresh(l, statusFilter);
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

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className="input-area pl-9 text-sm"
            placeholder="Cari kata di bank…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input-area w-32 text-xs"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            refresh(level, e.target.value);
          }}
        >
          <option value="all">Semua status</option>
          <option value="new">Baru</option>
          <option value="learning">Dipelajari</option>
          <option value="known">Sudah tahu</option>
        </select>
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
        <ul className="space-y-2">
          {visible.map((e) => {
            const isOpen = expanded === e.id;
            const badge = STATUS_BADGE[e.status];
            return (
              <li key={e.id} className="card overflow-hidden">
                <button
                  className="flex w-full items-center gap-2 p-4 text-left"
                  onClick={() => setExpanded(isOpen ? null : e.id)}
                >
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_STYLE[e.cefr] ?? ""}`}
                  >
                    {e.cefr}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.text}</span>
                    <span className="block truncate text-xs text-zinc-500">{e.meaningId}</span>
                  </span>
                  {badge ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen ? (
                  <div className="space-y-3 border-t border-zinc-100 px-4 pb-4 pt-3 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className="badge bg-zinc-100 dark:bg-zinc-800">{e.type}</span>
                      <span className="badge bg-zinc-100 dark:bg-zinc-800">{e.register}</span>
                      {e.useWhenId ? <span className="italic">{e.useWhenId}</span> : null}
                    </div>
                    {e.examples.length > 0 ? (
                      <ul className="space-y-2">
                        {e.examples.map((ex, i) => (
                          <li key={i} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
                            <div className="flex items-start gap-2">
                              <p className="flex-1 text-sm font-medium">{ex.en}</p>
                              <button
                                className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700"
                                title="Dengarkan"
                                onClick={() => speak(ex.en)}
                              >
                                <Volume2 className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="mt-0.5 text-xs text-zinc-500">{ex.id}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex gap-2 pt-1">
                      {e.status !== "learning" ? (
                        <button
                          className="btn-primary flex-1 gap-1.5 text-sm"
                          disabled={busyId === e.id}
                          onClick={() => setStatus(e.id, "learn")}
                        >
                          {busyId === e.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Layers className="h-4 w-4" />
                          )}
                          Mau dipelajari
                        </button>
                      ) : (
                        <button className="btn-secondary flex-1 gap-1.5 text-sm" disabled>
                          <CheckCircle2 className="h-4 w-4" /> Sedang dipelajari
                        </button>
                      )}
                      {e.status !== "known" ? (
                        <button
                          className="btn-secondary flex-1 gap-1.5 text-sm"
                          disabled={busyId === e.id}
                          onClick={() => setStatus(e.id, "know")}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Sudah tahu
                        </button>
                      ) : (
                        <button
                          className="btn-secondary flex-1 gap-1.5 text-sm"
                          disabled={busyId === e.id}
                          onClick={() => setStatus(e.id, "reset")}
                        >
                          <RotateCcw className="h-4 w-4" /> Reset
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

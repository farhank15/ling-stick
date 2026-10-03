import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { CircleCheck, CircleX, Download, FileUp, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, useFetcher, useLoaderData, useNavigation } from "react-router";
import { useToast } from "~/components/Toast";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { llmUsage } from "~/lib/db/schema";
import { env } from "~/lib/env.server";
import { getTargetLang, setTargetLang, isTargetLang, type TargetLang } from "~/lib/lang.server";
import { laraStatus } from "~/lib/lara.server";
import { getNewCardsPerDay, setNewCardsPerDay, NEW_CARDS_MIN, NEW_CARDS_MAX } from "~/lib/prefs.server";
import { eq } from "drizzle-orm";
import { todayStr } from "~/lib/utils.shared";
import { llmConfigured } from "~/lib/llm.server";

export const meta: MetaFunction = () => [{ title: "Pengaturan — LingStick" }];
export const handle = { title: "Pengaturan" };

const LANGS: TargetLang[] = ["en", "ja"]; // bukan import — module server gak boleh nyusul ke bundle client
const LANG_META: Record<TargetLang, { label: string; desc: string }> = {
  en: { label: "English", desc: "Kosakata EN per level CEFR, TTS en-US" },
  ja: { label: "日本語", desc: "Kana, kanji & tata bahasa per level JLPT, TTS ja-JP" },
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  // Paralel — hemat 1 round-trip Turso (dulu berurutan).
  const [[usage], lara, targetLang] = await Promise.all([
    db.select().from(llmUsage).where(eq(llmUsage.day, todayStr())).limit(1),
    laraStatus(),
    getTargetLang(),
  ]);
  return {
    lara,
    targetLang,
    llmCallsToday: usage?.calls ?? 0,
    llmLimit: env.DAILY_LLM_CALL_LIMIT,
    llmConfigured: llmConfigured(),
    groqConfigured: Boolean(env.GROQ_API_KEY),
    groqModel: env.GROQ_MODEL,
    poolsideConfigured: Boolean(env.POOLSIDE_API_KEY && env.POOLSIDE_MODEL),
    poolsideModel: env.POOLSIDE_MODEL || "(belum diset)",
    baseUrl: env.GROQ_BASE_URL,
    newCardsPerDay: await getNewCardsPerDay(),
    newCardsMin: NEW_CARDS_MIN,
    newCardsMax: NEW_CARDS_MAX,
  };
}

/** POST action — ganti bahasa target aktif (en/ja) / simpan preferensi review. */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as { lang?: string; newCardsPerDay?: number };

  if (typeof body.newCardsPerDay === "number") {
    const saved = await setNewCardsPerDay(body.newCardsPerDay);
    return Response.json({ ok: true, newCardsPerDay: saved });
  }

  if (!isTargetLang(body.lang)) {
    return Response.json({ ok: false, error: "Bahasa tidak dikenal" }, { status: 400 });
  }
  await setTargetLang(body.lang);
  return Response.json({ ok: true, lang: body.lang });
}

type Stats = {
  byStatus: { learning: number; known: number; archived: number; total: number };
  last7: { day: string; total: number }[];
  llm7: { day: string; calls: number }[];
  quiz: { day: string; title: string; total: number; done: number; correct: number; completed: number }[];
  streak: number;
  lara: { used: number; limit: number; remaining: number };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Statistik dimuat via API (query berat) — tampilkan skeleton biar gak kerasa kosong.
  const [statsLoading, setStatsLoading] = useState(true);
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const doImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const out = await res.json();
      if (out.ok) {
        const s = out.stats as {
          itemsAdded: number;
          itemsSkipped: number;
          examplesAdded: number;
          exploreAdded: number;
        };
        toast(
          `Import ok: +${s.itemsAdded} item (${s.itemsSkipped} sudah ada), +${s.examplesAdded} contoh, +${s.exploreAdded} explore`,
        );
      } else {
        toast(out.error ?? "Import gagal");
      }
    } catch {
      toast("File nggak valid — harus JSON backup LingStick");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Skeleton statistik — bloknya di paling atas, jadi harus ada feedback sejak awal */}
      {statsLoading ? (
        <div className="card animate-pulse space-y-3" aria-hidden>
          <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
            ))}
          </div>
          <div className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800/60" />
        </div>
      ) : stats ? (
        <StatsSection stats={stats} />
      ) : null}
      <LangPicker current={data.targetLang} />

      <section className="card space-y-1.5">
        <h2 className="label">LLM</h2>
        <Row k="Status" v={data.llmConfigured ? "terkonfigurasi" : "belum diset"} ok={data.llmConfigured} />
        <Row
          k="Utama — Groq"
          v={data.groqConfigured ? data.groqModel : "belum diset (fallback aktif)"}
          ok={data.groqConfigured}
        />
        <Row
          k="Fallback — Poolside"
          v={data.poolsideConfigured ? data.poolsideModel : "belum diset"}
          ok={data.poolsideConfigured}
        />
        <Row k="Urutan" v="Groq → Poolside (retry 1x per provider)" />
        <Row k="Panggilan hari ini" v={`${data.llmCallsToday} / ${data.llmLimit}`} />
        <p className="pt-1 text-[11px] text-zinc-400">
          Daftar model: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">GET /api/models</code>
        </p>
      </section>

      <section className="card space-y-1.5">
        <h2 className="label">Lara Translate</h2>
        <Row
          k="Status"
          v={data.lara.configured ? "terkonfigurasi" : "belum diset (fallback LLM)"}
          ok={data.lara.configured}
        />
        <Row
          k="Kuota bulan ini"
          v={`${data.lara.used.toLocaleString("id-ID")} / ${data.lara.limit.toLocaleString("id-ID")} karakter`}
        />
        <p className="text-[11px] text-zinc-400">
          Kuota reset tiap awal bulan. Halaman Terjemah pakai Lara; translate otomatis di dashboard
          pakai AI biar kuota Lara awet.
        </p>
      </section>

      <NewCardsSection initial={data.newCardsPerDay} min={data.newCardsMin} max={data.newCardsMax} />

      <section className="card space-y-2">
        <h2 className="label">Backup & restore</h2>
        <a href="/api/export" className="btn-secondary w-full" download>
          <Download className="h-4 w-4" strokeWidth={1.75} /> Export semua data (JSON)
        </a>
        <button
          className="btn-secondary w-full"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="h-4 w-4" strokeWidth={1.75} /> Import dari backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void doImport(file);
          }}
        />
        <p className="text-[11px] text-zinc-400">
          Import bersifat menambah: item yang sudah ada nggak akan ditimpa.
        </p>
      </section>

      <section className="space-y-2">
        <Form method="post">
          <button
            className="btn-danger w-full"
            type="button"
            disabled={nav.state !== "idle"}
            onClick={() => {
              fetch("/api/logout", { method: "POST" }).finally(() => {
                window.location.href = "/login";
              });
            }}
          >
            Keluar
          </button>
        </Form>
      </section>
    </div>
  );
}

/** Pemilih bahasa target (satu aktif global) — ganti di sini, seluruh app ikut. */
function LangPicker({ current }: { current: TargetLang }) {
  const fetcher = useFetcher();
  const toast = useToast();
  const busy = fetcher.state !== "idle";
  const done = (fetcher.data as { ok?: boolean } | undefined)?.ok;

  useEffect(() => {
    if (fetcher.state === "idle" && done) {
      toast("Bahasa diganti — Library, bank, quiz & statistik ikut bahasa baru");
      // Bersihin semua cache (SW + cache storage) dulu biar gak ada aset/data lama
      // yang nyangkut, baru reload — semua halaman langsung ikut bahasa baru.
      const clearAndReload = () => {
        if (typeof caches !== "undefined") {
          caches
            .keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
            .catch(() => {})
            .finally(() => window.location.reload());
        } else {
          window.location.reload();
        }
      };
      setTimeout(clearAndReload, 350); // kasih toast sempat keliatan
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, done]);

  return (
    <section className="card space-y-2">
      <h2 className="label flex items-center gap-1.5">
        <Languages className="h-3.5 w-3.5" /> Bahasa target
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={busy}
            onClick={() => fetcher.submit({ lang: l }, { method: "post", encType: "application/json" })}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition disabled:opacity-60 ${
              current === l
                ? "border-teal-500 bg-teal-50 dark:border-teal-600 dark:bg-teal-950/40"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600"
            }`}
          >
            <p className="font-semibold">{LANG_META[l].label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{LANG_META[l].desc}</p>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-400">
        Bahasa Indonesia tetap jadi bahasa penjelasan. Data bahasa lain tersimpan aman —
        balik lagi kapan pun tanpa kehilangan progres.
      </p>
    </section>
  );
}

function StatsSection({ stats }: { stats: Stats }) {
  const maxItem = Math.max(1, ...stats.last7.map((d) => d.total));
  const maxLlm = Math.max(1, ...stats.llm7.map((d) => d.calls));
  return (
    <section className="card space-y-4">
      <h2 className="label">Statistik</h2>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-zinc-50 py-3 dark:bg-zinc-800/60">
          <p className="text-xl font-bold">{stats.byStatus.learning}</p>
          <p className="text-[11px] text-zinc-500">dipelajari</p>
        </div>
        <div className="rounded-xl bg-zinc-50 py-3 dark:bg-zinc-800/60">
          <p className="text-xl font-bold">{stats.byStatus.known}</p>
          <p className="text-[11px] text-zinc-500">hafal</p>
        </div>
        <div className="rounded-xl bg-zinc-50 py-3 dark:bg-zinc-800/60">
          <p className="text-xl font-bold">{stats.streak}</p>
          <p className="text-[11px] text-zinc-500">streak latihan</p>
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Kosakata baru — 7 hari</p>
        <div className="flex h-16 items-end gap-1.5">
          {stats.last7.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-teal-500/80 dark:bg-teal-500/60"
                style={{ height: `${(d.total / maxItem) * 100}%`, minHeight: d.total ? 4 : 2 }}
                title={`${d.day}: ${d.total} item`}
              />
              <span className="text-[9px] text-zinc-400">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Panggilan LLM — 7 hari</p>
        <div className="flex h-16 items-end gap-1.5">
          {stats.llm7.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-zinc-400/80 dark:bg-zinc-600"
                style={{ height: `${(d.calls / maxLlm) * 100}%`, minHeight: d.calls ? 4 : 2 }}
                title={`${d.day}: ${d.calls} panggilan`}
              />
              <span className="text-[9px] text-zinc-400">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </div>

      {stats.quiz.length > 0 ? (
        <div>
          <p className="label mb-1.5">Latihan terakhir</p>
          <ul className="space-y-1">
            {stats.quiz.slice(0, 5).map((q, qi) => (
              <li key={`${q.day}-${q.title}-${qi}`} className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">{q.title}</span>
                <span className={q.completed ? "font-medium text-teal-700 dark:text-teal-400" : "text-zinc-400"}>
                  {q.completed ? `${q.correct}/${q.total} benar` : `${q.done}/${q.total} dijawab`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Row({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{k}</span>
      <span className="inline-flex min-w-0 items-center gap-1 font-medium" title={v}>
        {ok === undefined ? null : ok ? (
          <CircleCheck className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
        ) : (
          <CircleX className="h-4 w-4 shrink-0 text-red-500" />
        )}
        <span className="truncate">{v}</span>
      </span>
    </div>
  );
}

/** Kartu baru per hari — slider yang beneran bisa disimpen (dulu cuma teks statis). */
function NewCardsSection({ initial, min, max }: { initial: number; min: number; max: number }) {
  const toast = useToast();
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(initial);

  const save = async (n: number) => {
    if (n === savedRef.current || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCardsPerDay: n }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; newCardsPerDay?: number };
      if (!res.ok || !d.ok) throw new Error("Gagal menyimpan");
      savedRef.current = d.newCardsPerDay ?? n;
      toast(`Kartu baru/hari: ${savedRef.current}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menyimpan");
      setVal(savedRef.current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-2">
      <h2 className="label">Review</h2>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Kartu baru / hari</span>
        <span className="inline-flex items-center gap-1 font-medium">
          {saving ? <CircleCheck className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" /> : null}
          {val} kata
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={val}
        className="w-full accent-teal-600"
        aria-label="Kartu baru per hari"
        onChange={(e) => setVal(Number(e.target.value))}
        onPointerUp={() => void save(val)}
        onKeyUp={() => void save(val)}
        onBlur={() => void save(val)}
      />
      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
      <p className="text-[11px] text-zinc-400">
        Jumlah kata baru yang masuk antrian flashcard &amp; kuis tiap hari. Geser buat ngubah —
        naikin kalau mau nambah kosakata lebih cepat, turunin kalau mulai kewalahan.
      </p>
    </section>
  );
}

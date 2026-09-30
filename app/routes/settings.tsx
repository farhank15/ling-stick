import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { CircleCheck, CircleX, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Form, useLoaderData, useNavigation } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { llmUsage } from "~/lib/db/schema";
import { env } from "~/lib/env.server";
import { laraStatus } from "~/lib/lara.server";
import { eq } from "drizzle-orm";
import { todayStr } from "~/lib/utils.shared";
import { llmConfigured } from "~/lib/llm.server";

export const meta: MetaFunction = () => [{ title: "Pengaturan — LingStick" }];
export const handle = { title: "Pengaturan" };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const [usage] = await db
    .select()
    .from(llmUsage)
    .where(eq(llmUsage.day, todayStr()))
    .limit(1);
  const lara = await laraStatus();
  return {
    lara,
    llmCallsToday: usage?.calls ?? 0,
    llmLimit: env.DAILY_LLM_CALL_LIMIT,
    llmConfigured: llmConfigured(),
    groqConfigured: Boolean(env.GROQ_API_KEY),
    groqModel: env.GROQ_MODEL,
    poolsideConfigured: Boolean(env.POOLSIDE_API_KEY && env.POOLSIDE_MODEL),
    poolsideModel: env.POOLSIDE_MODEL || "(belum diset)",
    baseUrl: env.GROQ_BASE_URL,
    newCardsPerDay: env.NEW_CARDS_PER_DAY,
  };
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
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {stats ? <StatsSection stats={stats} /> : null}      <section className="card space-y-1.5">
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
      </section>

      <section className="card space-y-1.5">
        <h2 className="label">Review</h2>
        <Row k="Kartu baru / hari" v={String(data.newCardsPerDay)} />
      </section>

      <section className="space-y-2">
        <a href="/api/export" className="btn-secondary w-full" download>
          <Download className="h-4 w-4" strokeWidth={1.75} /> Export backup (JSON)
        </a>
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
            {stats.quiz.slice(0, 5).map((q) => (
              <li key={q.day} className="flex items-center justify-between text-sm">
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

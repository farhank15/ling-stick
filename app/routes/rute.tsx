import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { Check, ChevronLeft, ChevronRight, Lock, Play, Trophy } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getRouteMap } from "~/lib/route.progress";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Rute Belajar — LingStick" }];
export const handle = { title: "Rute" };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const map = await getRouteMap();
  const segParam = Number(url.searchParams.get("seg"));
  const seg = map.segments.includes(segParam)
    ? segParam
    : (map.next ? map.next.step.segment : (map.segments[0] ?? 1));
  return { map, seg };
}

const LEVEL_CLS: Record<string, string> = {
  N5: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  N4: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  N3: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  N2: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  N1: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export default function Rute() {
  const { map, seg } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  void params;

  if (map.lang !== "ja") {
    return (
      <div className="py-16 text-center">
        <p className="mt-3 font-medium">Rute baru tersedia untuk bahasa Jepang</p>
        <p className="mt-1 text-sm text-zinc-500">
          Ganti ke 日本語 lewat toggle EN/あ di header atas.
        </p>
      </div>
    );
  }

  const steps = map.steps.filter((s) => s.step.segment === seg);
  const exam = map.exams.find((e) => e.segment === seg);
  const doneCount = steps.filter((s) => s.state === "passed").length;
  const segIdx = map.segments.indexOf(seg);
  const prevSeg = map.segments[segIdx - 1];
  const nextSeg = map.segments[segIdx + 1];

  const startExam = async () => {
    try {
      const r = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "route-exam", segment: seg }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal mulai ujian");
      navigate(`/review?mode=route&setId=${d.setId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal mulai ujian");
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold">Segmen {seg} · N5 Dasar</p>
            <p className="text-xs text-muted">
              {doneCount}/{steps.length} step lulus · XP {map.xp}/{map.totalXp}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {prevSeg !== undefined ? (
              <Link to={`/rute?seg=${prevSeg}`} prefetch="intent" className="btn-ghost p-2" aria-label="Segmen sebelumnya">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            ) : null}
            {nextSeg !== undefined ? (
              <Link to={`/rute?seg=${nextSeg}`} prefetch="intent" className="btn-ghost p-2" aria-label="Segmen berikut">
                <ChevronRight className="h-5 w-5" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
          <div
            className="h-full rounded-full bg-teal-600 transition-all dark:bg-teal-500"
            style={{ width: `${(doneCount / Math.max(1, steps.length)) * 100}%` }}
          />
        </div>
      </div>

      <ol className="relative space-y-3">
        {steps.map((s, i) => {
          const locked = s.state === "locked";
          const current = s.state === "available" || s.state === "in_progress";
          const passed = s.state === "passed";
          const isLast = i === steps.length - 1 && !exam;
          return (
            <li key={s.step.step_id} className="relative flex gap-3">
              <div className="flex flex-col items-center" aria-hidden>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    if (locked) {
                      toast(`Selesaikan Step ${s.step.order - 1} dulu buat buka ini`);
                      return;
                    }
                    navigate(`/rute/${s.step.step_id}`);
                  }}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed ${
                    passed
                      ? "border-teal-600 bg-teal-500 text-white"
                      : current
                        ? "animate-pulse border-teal-600 bg-white text-teal-700 dark:bg-zinc-900 dark:text-teal-300"
                        : s.state === "in_progress"
                          ? "border-amber-500 bg-white text-amber-600 dark:bg-zinc-900"
                          : "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                  }`}
                  title={locked ? `Selesaikan Step ${s.step.order - 1} dulu` : `${s.step.order}. ${s.step.title_id}`}
                  aria-label={locked ? `Terkunci: ${s.step.title_id}` : `${s.step.title_id} (${s.state})`}
                >
                  {passed ? <Check className="h-5 w-5" strokeWidth={2.5} /> : locked ? <Lock className="h-4 w-4" /> : <Play className="h-5 w-5" />}
                </button>
                {!isLast ? (
                  <div className="mt-1 w-0.5 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                ) : null}
              </div>

              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (locked) {
                    toast(`Selesaikan Step ${s.step.order - 1} dulu buat buka ini`);
                    return;
                  }
                  navigate(`/rute/${s.step.step_id}`);
                }}
                className="card flex min-h-11 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:border-teal-500 disabled:cursor-not-allowed disabled:opacity-70"
                aria-label={locked ? `Terkunci: ${s.step.title_id}` : `Buka ${s.step.title_id}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold leading-snug">{s.step.order}. {s.step.title_id}</p>
                  <p className="mt-0.5 text-xs text-muted">~{s.step.est_minutes} mnt</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`badge font-bold ${LEVEL_CLS[s.step.level] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                    {s.step.level}
                  </span>
                  {passed ? <Check className="h-4 w-4 text-teal-600 dark:text-teal-400" /> : null}
                </div>
              </button>
            </li>
          );
        })}

        {exam ? (
          <li className="relative flex gap-3">
            <div className="flex flex-col items-center" aria-hidden>
              <button
                type="button"
                disabled={exam.state !== "available"}
                onClick={() => {
                  if (exam.state !== "available") {
                    toast(exam.state === "passed" ? "Segmen ini sudah lulus!" : "Luluskan semua step segmen ini dulu");
                    return;
                  }
                  void startExam();
                }}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-4 shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed ${
                  exam.state === "passed"
                    ? "border-amber-500 bg-amber-400 text-white"
                    : exam.state === "available"
                      ? "animate-pulse border-amber-500 bg-white text-amber-600 dark:bg-zinc-900"
                      : "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                }`}
                title={exam.state === "available" ? `Ujian Segmen ${seg}` : exam.state === "passed" ? "Lulus!" : "Luluskan semua step dulu"}
                aria-label={`Ujian segmen ${seg} (${exam.state})`}
              >
                <Trophy className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              disabled={exam.state !== "available"}
              onClick={() => {
                if (exam.state !== "available") {
                  toast(exam.state === "passed" ? "Segmen ini sudah lulus!" : "Luluskan semua step segmen ini dulu");
                  return;
                }
                void startExam();
              }}
              className="card flex min-h-11 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label={`Ujian segmen ${seg}`}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold leading-snug">Ujian Segmen {seg}</p>
                <p className="mt-0.5 text-xs text-muted">{exam.state === "passed" ? "Lulus" : "Kumpulkan semua step dulu"}</p>
              </div>
              <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
            </button>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

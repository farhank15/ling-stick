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

/** Posisi node sinusoidal — S-curve ala peta game. */
function nodeXY(i: number) {
  return { x: 180 + 110 * Math.sin(i * 0.85), y: i * 96 + 48 };
}

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
  const n = steps.length + 1; // + exam chest
  const H = n * 96 + 48;
  const pts = steps.map((_, i) => nodeXY(i));
  pts.push(nodeXY(steps.length));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y}`).join(" ");
  // Segmen progres (teal) hanya antar node yang passed.
  const states = [...steps.map((s) => s.state), exam?.state ?? "locked"];
  const progSegs: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    if (states[i] === "passed" && states[i + 1] === "passed") {
      progSegs.push(`M${pts[i]!.x.toFixed(1)},${pts[i]!.y} L${pts[i + 1]!.x.toFixed(1)},${pts[i + 1]!.y}`);
    }
  }
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
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="card space-y-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold">Segmen {seg} · N5 Dasar</p>
            <p className="text-xs text-zinc-500">
              {doneCount}/{steps.length} step lulus · XP {map.xp}/{map.totalXp}
            </p>
          </div>
          <div className="flex gap-1">
            {prevSeg !== undefined ? (
              <Link to={`/rute?seg=${prevSeg}`} className="btn-ghost p-2" aria-label="Segmen sebelumnya">
                <ChevronLeft className="h-5 w-5" />
              </Link>
            ) : null}
            {nextSeg !== undefined ? (
              <Link to={`/rute?seg=${nextSeg}`} className="btn-ghost p-2" aria-label="Segmen berikut">
                <ChevronRight className="h-5 w-5" />
              </Link>
            ) : null}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-teal-600 transition-all dark:bg-teal-500"
            style={{ width: `${(doneCount / Math.max(1, steps.length)) * 100}%` }}
          />
        </div>
      </div>

      {/* Peta: spine SVG dekoratif + node button HTML (a11y + dark mode mudah). */}
      <div className="relative mx-auto w-full max-w-sm" style={{ height: H }}>
        <svg viewBox={`0 0 360 ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={line} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-zinc-200 dark:stroke-zinc-800" />
          {progSegs.map((d, i) => (
            <path key={i} d={d} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-teal-500" />
          ))}
        </svg>
        {steps.map((s, i) => {
          const p = pts[i]!;
          const locked = s.state === "locked";
          const current = s.state === "available" || s.state === "in_progress";
          const passed = s.state === "passed";
          return (
            <div
              key={s.step.step_id}
              className="absolute flex flex-col items-center"
              style={{ left: `${(p.x / 360) * 100}%`, top: p.y, transform: "translate(-50%, -50%)" }}
            >
              <button
                className={`flex h-14 w-14 items-center justify-center rounded-full border-4 shadow-md transition-transform active:scale-95 ${
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
                onClick={() => {
                  if (locked) {
                    toast(`Selesaikan Step ${s.step.order - 1} dulu buat buka ini`);
                    return;
                  }
                  navigate(`/rute/${s.step.step_id}`);
                }}
              >
                {passed ? (
                  <Check className="h-6 w-6" strokeWidth={2.5} />
                ) : locked ? (
                  <Lock className="h-5 w-5" />
                ) : (
                  <Play className="h-6 w-6" />
                )}
              </button>
              <span className={`mt-1 max-w-24 text-center text-[10px] font-medium leading-tight ${locked ? "text-zinc-400" : ""}`}>
                {s.step.order}. {s.step.title_id}
              </span>
            </div>
          );
        })}
        {/* Chest ujian segmen */}
        {exam ? (
          <div
            className="absolute flex flex-col items-center"
            style={{ left: `${(pts[steps.length]!.x / 360) * 100}%`, top: pts[steps.length]!.y, transform: "translate(-50%, -50%)" }}
          >
            <button
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border-4 shadow-md transition-transform active:scale-95 ${
                exam.state === "passed"
                  ? "border-amber-500 bg-amber-400 text-white"
                  : exam.state === "available"
                    ? "animate-pulse border-amber-500 bg-white text-amber-600 dark:bg-zinc-900"
                    : "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
              }`}
              title={exam.state === "available" ? `Ujian Segmen ${seg}` : exam.state === "passed" ? "Lulus!" : "Luluskan semua step dulu"}
              aria-label={`Ujian segmen ${seg} (${exam.state})`}
              onClick={() => {
                if (exam.state !== "available") {
                  toast(exam.state === "passed" ? "Segmen ini sudah lulus!" : "Luluskan semua step segmen ini dulu");
                  return;
                }
                void startExam();
              }}
            >
              <Trophy className="h-6 w-6" />
            </button>
            <span className="mt-1 text-center text-[10px] font-medium">Ujian S{seg}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

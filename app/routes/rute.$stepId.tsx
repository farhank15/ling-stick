import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getRouteMap } from "~/lib/route.progress";
import { JaText, hasJa } from "~/components/JaText";
import { MarkdownLite } from "~/components/MarkdownLite";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Step Rute — LingStick" }];

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const map = await getRouteMap();
  const stepId = params.stepId ?? "";
  const found = map.steps.find((s) => s.step.step_id === stepId) ?? null;
  const exam = map.exams.find((e) => `exam-${e.segment}` === stepId) ?? null;
  return { step: found?.step ?? null, state: found?.state ?? null, grade: found?.grade ?? null, setId: found?.setId ?? null, exam };
}

export default function RuteStep() {
  const { step, state, grade, exam } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  void exam;

  if (!step) {
    return (
      <div className="py-16 text-center">
        <p className="mt-3 font-medium">Step tidak ada</p>
        <Link to="/rute" className="btn-secondary mt-6">
          Kembali ke Rute
        </Link>
      </div>
    );
  }

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "route-start", stepId: step.step_id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal mulai latihan");
      navigate(`/review?mode=route&setId=${d.setId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal mulai latihan");
      setBusy(false);
    }
  };

  const locked = state === "locked";
  const passed = state === "passed";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/rute" className="btn-ghost px-2" aria-label="Kembali ke Rute">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Step {step.order} · {step.level} · ~{step.est_minutes} mnt
          </p>
          <h1 className="truncate text-xl font-bold tracking-tight">{step.title_id}</h1>
        </div>
        {passed ? (
          <span className="badge inline-flex shrink-0 items-center gap-1 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <BadgeCheck className="h-3.5 w-3.5" /> Lulus{grade !== null ? ` ${grade}%` : ""}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="badge bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{step.pattern}</span>
        <span className="badge bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{step.level}</span>
      </div>

      <div className="card space-y-2 p-4">
        <p className="label">Tujuan</p>
        <ul className="space-y-1 text-sm">
          {step.objectives.map((o, i) => (
            <li key={i} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
              {o}
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-2 p-4">
        <p className="label">Penjelasan</p>
        <MarkdownLite text={step.explanation_id} />
        {step.formation ? (
          <p className="rounded-xl bg-zinc-50 px-3 py-2 font-mono text-xs dark:bg-zinc-800/60">{step.formation}</p>
        ) : null}
      </div>

      <div className="card space-y-3 p-4">
        <p className="label">Contoh ({step.examples.length})</p>
        {step.examples.map((ex, i) => (
          <div key={i} className="border-b border-zinc-100 pb-2 last:border-0 last:pb-0 dark:border-zinc-800">
            {hasJa(ex.jp) ? (
              <JaText
                text={ex.jp}
                reading={ex.romaji ? `${ex.kana} (${ex.romaji})` : ex.kana}
                kanjiClassName="text-teal-700 dark:text-teal-400"
                className="font-semibold"
              />
            ) : (
              <p className="font-semibold">{ex.jp}</p>
            )}
            <p className="mt-0.5 text-xs text-zinc-500">{ex.arti_id}</p>
            {ex.pola_ref ? <p className="text-[11px] text-zinc-400">{ex.pola_ref}</p> : null}
          </div>
        ))}
      </div>

      {step.pitfalls_id.length > 0 ? (
        <div className="card space-y-1 border-amber-200 p-4 dark:border-amber-900">
          <p className="label">Jebakan umum</p>
          {step.pitfalls_id.map((p, i) => (
            <p key={i} className="text-sm text-amber-800 dark:text-amber-200">• {p}</p>
          ))}
        </div>
      ) : null}

      {step.refs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {step.refs.map((r, i) => (
            <a key={i} href={r.url} target="_blank" rel="noreferrer" className="chip gap-1">
              <ExternalLink className="h-3 w-3" /> {r.label}
            </a>
          ))}
        </div>
      ) : null}

      <div className="card flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{step.cloze_items.length} soal latihan</p>
          <p className="text-xs text-zinc-500">
            Lulus butuh ≥{step.passing.grade_pct}%{grade !== null && !passed ? ` · terakhir ${grade}%` : ""}
          </p>
        </div>
        <button className="btn-primary shrink-0" disabled={busy || locked} onClick={() => void start()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : passed ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {locked ? "Terkunci" : passed ? "Ulangi" : state === "in_progress" ? "Lanjutkan" : "Mulai Latihan"}
        </button>
      </div>
      {locked ? (
        <p className="text-center text-xs text-zinc-400">Selesaikan step sebelumnya buat buka latihan ini.</p>
      ) : null}
    </div>
  );
}

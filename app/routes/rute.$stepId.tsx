import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, ExternalLink, Loader2, MessageCircleQuestion, RotateCcw, Save } from "lucide-react";
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
  const { getStepNotes } = await import("~/lib/route.progress");
  const notes = stepId ? await getStepNotes(stepId).catch(() => ({ note: "", qa: [] })) : { note: "", qa: [] };
  return { step: found?.step ?? null, state: found?.state ?? null, grade: found?.grade ?? null, setId: found?.setId ?? null, exam, notes };
}

export default function RuteStep() {
  const { step, state, grade, notes } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Tanya Ling (mentor step) — jawaban bisa disimpan ke catatan step ini.
  const [question, setQuestion] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askReply, setAskReply] = useState<string | null>(null);
  const [qaList, setQaList] = useState<{ q: string; a: string; at: number }[]>(notes.qa ?? []);
  const [note, setNote] = useState(notes.note ?? "");
  const [noteBusy, setNoteBusy] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q || askBusy || !step) return;
    setAskBusy(true);
    setAskReply(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Konteks: saya belajar pola "${step.pattern}" (${step.title_id}, ${step.level}). Pertanyaan: ${q}. Jawab singkat Bahasa Indonesia + contoh bila perlu. Tulis kata/kalimat Jepang dengan format 漢字（かな・romaji) saat pertama muncul, lalu 漢字（かな）.`,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ling gagal jawab");
      setAskReply(d.reply ?? "");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Ling gagal jawab");
    } finally {
      setAskBusy(false);
    }
  };

  const saveQA = async () => {
    const q = question.trim();
    if (!q || !askReply || !step) return;
    try {
      const r = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.step_id, qa: { q, a: askReply } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gagal simpan");
      setQaList(d.qa ?? []);
      setAskReply(null);
      setQuestion("");
      toast("Tersimpan di catatan step ini");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal simpan");
    }
  };

  const saveNote = async () => {
    if (!step || noteBusy) return;
    setNoteBusy(true);
    try {
      const r = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.step_id, note }),
      });
      if (!r.ok) throw new Error("Gagal simpan");
      toast("Catatan tersimpan");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal simpan");
    } finally {
      setNoteBusy(false);
    }
  };

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

      {/* Tanya Ling — mentor khusus step ini. Jawaban bisa disimpan. */}
      <div className="card space-y-2 p-4">
        <p className="label flex items-center gap-1.5">
          <MessageCircleQuestion className="h-3.5 w-3.5" /> Tanya Ling soal step ini
        </p>
        <div className="flex gap-2">
          <input
            className="input-area min-h-11 flex-1 py-2.5 text-sm"
            placeholder="Contoh: bedanya は dan が di kalimat negatif?"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void ask();
            }}
          />
          <button className="btn-primary shrink-0" disabled={askBusy || !question.trim()} onClick={() => void ask()}>
            {askBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tanya"}
          </button>
        </div>
        {askReply ? (
          <div className="space-y-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <MarkdownLite text={askReply} />
            <button className="btn-secondary w-full gap-1.5 text-xs" onClick={() => void saveQA()}>
              <Save className="h-3.5 w-3.5" /> Simpan jawaban ke catatan step
            </button>
          </div>
        ) : null}
        {qaList.length > 0 ? (
          <div className="space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Tersimpan ({qaList.length})
            </p>
            {qaList.map((x, i) => (
              <div key={`${x.at}-${i}`} className="space-y-1 rounded-xl border border-zinc-100 p-2.5 dark:border-zinc-800">
                <p className="text-sm font-medium">{x.q}</p>
                <div className="text-sm text-zinc-600 dark:text-zinc-300">
                  <MarkdownLite text={x.a} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Catatan bebas step ini */}
      <div className="card space-y-2 p-4">
        <p className="label">Catatanku</p>
        <textarea
          className="input-area min-h-20 text-sm"
          placeholder="Tulis ringkasan / mnemonik sendiri buat pola ini…"
          value={note}
          maxLength={5000}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn-secondary w-full gap-1.5 text-sm" disabled={noteBusy} onClick={() => void saveNote()}>
          {noteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan catatan
        </button>
      </div>
    </div>
  );
}

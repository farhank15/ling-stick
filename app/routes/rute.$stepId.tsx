import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useNavigate } from "react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, BadgeCheck, CheckCircle2, ExternalLink, Info, Loader2, MessageCircleQuestion, RotateCcw, Save, TriangleAlert } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getRouteMap } from "~/lib/route.progress";
import { MarkdownLite } from "~/components/MarkdownLite";
import { useToast } from "~/components/Toast";
import { ExampleCard } from "~/components/ExampleCard";
import { ExerciseCard } from "~/components/ExerciseCard";

export const meta: MetaFunction = () => [{ title: "Step Rute — LingStick" }];

const LEVEL_CLS: Record<string, string> = {
  N5: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  N4: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  N3: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  N2: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  N1: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function SecHead({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="label flex items-center gap-2">
      <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-teal-600/10 px-1 text-[10px] font-bold text-teal-700 dark:text-teal-300">
        {n}
      </span>
      {children}
    </p>
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const map = await getRouteMap();
  const stepId = params.stepId ?? "";
  const found = map.steps.find((s) => s.step.step_id === stepId) ?? null;
  const { getStepNotes } = await import("~/lib/route.progress");
  const notes = stepId ? await getStepNotes(stepId).catch(() => ({ note: "", qa: [] })) : { note: "", qa: [] };
  return { step: found?.step ?? null, state: found?.state ?? null, grade: found?.grade ?? null, setId: found?.setId ?? null, exam: null, notes };
}

function LessonProgress({ sections, active, progress }: { sections: { id: string; label: string }[]; active: string; progress: number }) {
  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-zinc-200/70 bg-zinc-50/90 px-4 py-2 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-2xl items-center gap-1 overflow-x-auto no-scrollbar">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              active === s.id
                ? "bg-teal-600 text-white dark:bg-teal-500"
                : "text-zinc-500 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800/70"
            }`}
            aria-current={active === s.id ? "step" : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="mx-auto mt-1.5 h-1 max-w-2xl overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
        <div className="h-full rounded-full bg-teal-600 transition-all dark:bg-teal-500" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

export default function RuteStep() {
  const { step, state, grade, notes } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const [question, setQuestion] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askReply, setAskReply] = useState<string | null>(null);
  const [qaList, setQaList] = useState<{ q: string; a: string; at: number }[]>(notes.qa ?? []);
  const [note, setNote] = useState(notes.note ?? "");
  const [noteBusy, setNoteBusy] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState("tujuan");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const total = el.offsetHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-el.getBoundingClientRect().top, 0), Math.max(total, 1));
      setProgress(total > 0 ? scrolled / total : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [step?.step_id]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [step?.step_id]);

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
          ephemeral: true,
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

  const sections = [
    { id: "tujuan", label: "Tujuan" },
    { id: "penjelasan", label: "Penjelasan" },
    { id: "contoh", label: "Contoh" },
    ...(step.pitfalls_id.length > 0 ? [{ id: "jebakan", label: "Jebakan" }] : []),
    { id: "latihan", label: "Latihan" },
  ];

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-2xl space-y-5">
      <LessonProgress sections={sections} active={active} progress={progress} />

      <div className="flex items-center gap-2">
        <Link to="/rute" className="btn-ghost shrink-0 rounded-xl px-2" aria-label="Kembali ke Rute">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Step {step.order}
            </span>
            <span className={`badge font-bold ${LEVEL_CLS[step.level] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
              {step.level}
            </span>
            <span className="text-[11px] text-zinc-400">~{step.est_minutes} mnt</span>
          </div>
          <h1 className="mt-1 text-xl font-bold leading-snug tracking-tight">{step.title_id}</h1>
        </div>
        {passed ? (
          <span className="badge inline-flex shrink-0 items-center gap-1 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <BadgeCheck className="h-3.5 w-3.5" /> Lulus{grade !== null ? ` ${grade}%` : ""}
          </span>
        ) : null}
      </div>

      <div className="rounded-2xl border border-teal-600/20 bg-teal-50/70 px-4 py-3 text-center dark:border-teal-500/20 dark:bg-teal-950/40">
        <p className="font-mono text-2xl font-bold tracking-tight text-teal-800 dark:text-teal-200">{step.pattern}</p>
      </div>

      <section id="tujuan" ref={(el) => { sectionRefs.current.tujuan = el; }} className="scroll-mt-28 space-y-3">
        <div className="card space-y-2 p-4">
          <SecHead n="01">Tujuan</SecHead>
          <ul className="space-y-1.5 text-sm leading-relaxed">
            {step.objectives.map((o, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="penjelasan" ref={(el) => { sectionRefs.current.penjelasan = el; }} className="scroll-mt-28 space-y-3">
        <div className="card space-y-2.5 p-4">
          <SecHead n="02">Penjelasan</SecHead>
          <MarkdownLite text={step.explanation_id} className="text-[15px] leading-loose" />
          {step.formation ? (
            <div>
              <p className="label mb-1">Rumus</p>
              <p className="rounded-xl border border-teal-600/25 bg-teal-50 px-3 py-2.5 font-mono text-[13px] font-semibold leading-relaxed text-teal-900 dark:border-teal-500/25 dark:bg-teal-950/50 dark:text-teal-100">{step.formation}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section id="contoh" ref={(el) => { sectionRefs.current.contoh = el; }} className="scroll-mt-28 space-y-3">
        <div className="card space-y-3 p-4">
          <SecHead n="03">Contoh ({step.examples.length}) · formal vs kasual</SecHead>
          {step.register_note_id ? (
            <p className="flex gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {step.register_note_id}
            </p>
          ) : null}
          {step.examples.map((ex, i) => (
            <ExampleCard
              key={i}
              jp={ex.jp}
              kana={ex.kana}
              romaji={ex.romaji}
              arti_id={ex.arti_id}
              pola_ref={ex.pola_ref || undefined}
              register={ex.register}
            />
          ))}
        </div>
      </section>

      {step.pitfalls_id.length > 0 ? (
        <section id="jebakan" ref={(el) => { sectionRefs.current.jebakan = el; }} className="scroll-mt-28 space-y-3">
          <div className="card space-y-1.5 border-l-4 border-l-amber-400 p-4">
            <p className="label flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
              <TriangleAlert className="h-3.5 w-3.5" /> Jebakan umum
            </p>
            {step.pitfalls_id.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-amber-800 dark:text-amber-200">• {p}</p>
            ))}
          </div>
        </section>
      ) : null}

      <section id="latihan" ref={(el) => { sectionRefs.current.latihan = el; }} className="scroll-mt-28 space-y-3">
        {step.refs.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {step.refs.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noreferrer" className="chip gap-1">
                <ExternalLink className="h-3 w-3" /> {r.label}
              </a>
            ))}
          </div>
        ) : null}

        <div className="card space-y-3 p-4">
          <SecHead n="04">Latihan ({step.cloze_items.length} soal)</SecHead>
          {step.cloze_items.map((c, i) => (
            <ExerciseCard
              key={i}
              front={c.front}
              answer={c.answer}
              distractors={c.distractors}
              kana={c.kana || undefined}
              romaji={c.romaji || undefined}
              explain_id={c.explain_id || undefined}
            />
          ))}
        </div>

        <div className="card flex items-center gap-3 border-teal-600/25 bg-teal-50/50 p-4 dark:border-teal-500/25 dark:bg-teal-950/30">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{step.cloze_items.length} soal latihan</p>
            <p className="text-xs text-zinc-500">
              Lulus butuh{" "}
              <span className="rounded-md bg-white px-1.5 py-0.5 font-bold text-teal-700 dark:bg-zinc-900 dark:text-teal-300">
                ≥{step.passing.grade_pct}%
              </span>
              {grade !== null && !passed ? ` · terakhir ${grade}%` : ""}
            </p>
          </div>
          <button className="btn-primary shrink-0" disabled={busy || locked} onClick={() => void start()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : passed ? <RotateCcw className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4 rotate-180" />}
            {locked ? "Terkunci" : passed ? "Ulangi" : state === "in_progress" ? "Lanjutkan" : "Mulai Latihan"}
          </button>
        </div>
        {locked ? (
          <p className="text-center text-xs text-zinc-400">Selesaikan step sebelumnya buat buka latihan ini.</p>
        ) : null}
      </section>

      <section className="scroll-mt-28 space-y-3">
        <div className="card space-y-2 p-4">
          <SecHead n="💬">
            <span className="flex items-center gap-1.5">
              <MessageCircleQuestion className="h-3.5 w-3.5" /> Tanya Ling soal step ini
            </span>
          </SecHead>
          <div className="flex gap-2">
            <input
              className="input-area min-h-11 flex-1 py-2.5 text-sm"
              placeholder="Contoh: bedanya は dan が di kalimat negatif?"
              value={question}
              maxLength={500}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void ask(); }}
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
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Tersimpan ({qaList.length})</p>
              {qaList.map((x, i) => (
                <div key={`${x.at}-${i}`} className="space-y-1 rounded-xl border border-zinc-100 p-2.5 dark:border-zinc-800">
                  <p className="text-sm font-medium">{x.q}</p>
                  <div className="text-sm text-zinc-600 dark:text-zinc-300"><MarkdownLite text={x.a} /></div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card space-y-2 p-4">
          <SecHead n="✎">Catatanku</SecHead>
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
      </section>
    </div>
  );
}

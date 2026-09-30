import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Ear,
  History,
  Languages,
  PartyPopper,
  Sparkles,
  XCircle,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { env } from "~/lib/env.server";

export const meta: MetaFunction = () => [{ title: "Review — LingStick" }];
export const handle = { title: "Review" };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return { dailyTarget: env.DAILY_QUIZ_SIZE };
}

type QuizQuestion = {
  itemId: number;
  type: "mcq_en_id" | "mcq_id_en" | "cloze" | "listen";
  prompt: string;
  options: string[];
  answer: string;
  meaningId: string | null;
  exampleEn: string | null;
};

type SetInfo = {
  id: number;
  day: string;
  title: string;
  total: number;
  done: number;
  correct: number;
  completed: boolean;
};

type QuizResponse = {
  set: SetInfo | null;
  questions: QuizQuestion[];
  order: number[];
};

const TYPE_META: Record<QuizQuestion["type"], { label: string; icon: typeof Ear }> = {
  mcq_en_id: { label: "Arti dari frasa", icon: Languages },
  mcq_id_en: { label: "Frasa yang tepat", icon: BookOpenCheck },
  cloze: { label: "Lengkapi kalimat", icon: Sparkles },
  listen: { label: "Cara bacanya", icon: Ear },
};

/** Acak urutan opsi SETELAH mount (anti hydration mismatch). */
function OptionList({
  options,
  answer,
  picked,
  onPick,
}: {
  options: string[];
  answer: string;
  picked: number | null;
  onPick: (i: number) => void;
}) {
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => {
    setOrder(options.map((_, i) => i).sort(() => Math.random() - 0.5));
  }, [options]);
  return (
    <div className="space-y-2">
      {order.map((origIdx) => {
        const opt = options[origIdx];
        const isAnswer = String(origIdx) === answer;
        const isPicked = picked === origIdx;
        let cls = "btn-secondary w-full justify-start text-left";
        if (picked !== null) {
          if (isAnswer)
            cls += " !border-teal-500 !bg-teal-50 !text-teal-800 dark:!bg-teal-950 dark:!text-teal-300";
          else if (isPicked)
            cls += " !border-red-300 !bg-red-50 !text-red-700 dark:!bg-red-950 dark:!text-red-300";
          else cls += " opacity-50";
        }
        return (
          <button key={origIdx} className={cls} disabled={picked !== null} onClick={() => onPick(origIdx)}>
            {opt}
            {picked !== null && isAnswer ? (
              <CheckCircle2 className="ml-auto h-4 w-4 shrink-0" />
            ) : picked !== null && isPicked ? (
              <XCircle className="ml-auto h-4 w-4 shrink-0" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default function ReviewPage() {
  const { dailyTarget } = useLoaderData<typeof loader>();

  const [data, setData] = useState<QuizResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState(0); // posisi dalam order[]
  const [picked, setPicked] = useState<number | null>(null);
  const [answeredHere, setAnsweredHere] = useState(0); // dijawab di sesi ini
  const [correctHere, setCorrectHere] = useState(0);
  const [savedDone, setSavedDone] = useState(0); // done saat halaman dibuka (resume offset)
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<
    { day: string; title: string; total: number; done: number; correct: number; completed: number }[]
  >([]);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/quiz")
      .then((r) => r.json())
      .then((d: QuizResponse) => {
        setData(d);
        setSavedDone(d.set?.done ?? 0);
        // Resume: lompat ke posisi = jumlah soal yang sudah dijawab.
        setPos(d.set?.done ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/quiz?history=1")
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => load(), [load]);

  const set = data?.set;
  const questions = data?.questions ?? [];
  const order = data?.order ?? [];

  // Kalau soal salah diselipkan, order bertambah — total mengikuti order.
  const total = order.length;
  const currentIndex = order[pos] ?? -1;
  const q = currentIndex >= 0 ? questions[currentIndex] : undefined;
  const finished = Boolean(set?.completed) || (total > 0 && pos >= total);

  const pick = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    const correct = String(i) === q.answer;
    setAnsweredHere((n) => n + 1);
    if (correct) setCorrectHere((n) => n + 1);
    void fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: currentIndex, correct }),
    });
  };

  const markKnown = () => {
    if (!q) return;
    void fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "known", itemId: q.itemId }),
    });
    // Maju tanpa mencatat jawaban (soal dianggap selesai via aksi lain);
    // paling aman: catat benar supaya progres maju.
    void fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: currentIndex, correct: true }),
    });
    setPicked(null);
    setAnsweredHere((n) => n + 1);
    setCorrectHere((n) => n + 1);
    setPos((p) => p + 1);
  };

  const next = () => {
    setPicked(null);
    setPos((p) => p + 1);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card animate-pulse space-y-2">
            <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 rounded bg-zinc-100 dark:bg-zinc-800/60" />
          </div>
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="py-16 text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Belum ada soal latihan</p>
        <p className="mt-1 text-sm text-zinc-500">
          Simpan kosakata dulu di tab Tambah — nanti otomatis dibuatkan set latihan harian
          (maks {dailyTarget} soal).
        </p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          Simpan kosakata
        </Link>
      </div>
    );
  }

  const pct = Math.round((set!.correct / Math.max(1, total)) * 100);

  if (finished) {
    return (
      <div className="py-10 text-center">
        <PartyPopper className="mx-auto h-12 w-12 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 text-lg font-bold">{set!.title} selesai!</p>
        <p className="mt-1 text-sm text-zinc-500">
          Benar {set!.correct} dari {total} soal ({pct}%)
          {answeredHere > 0 && answeredHere < set!.done
            ? ` · kamu mengerjakan ${answeredHere} soal di sesi ini`
            : ""}
        </p>
        <div className="mx-auto mt-4 h-2 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-teal-600 dark:bg-teal-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          Soal yang salah tadi udah dicatat FSRS — bakal muncul lagi di latihan berikutnya.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/" className="btn-primary">
            Kembali ke dashboard
          </Link>
          <Link to="/library" className="btn-secondary">
            Buka Library
          </Link>
        </div>
      </div>
    );
  }

  if (!q || !set) return null;
  const meta = TYPE_META[q.type];

  return (
    <div className="space-y-4">
      {/* Header set + progres tersimpan + tombol riwayat */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{set.title}</span>
          <span className="flex items-center gap-2">
            <span>
              benar {set.correct} · sisa {Math.max(0, total - set.done)}
            </span>
            <button
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Riwayat latihan"
              onClick={() => setShowHistory((s) => !s)}
            >
              <History className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </span>
        </div>
        {showHistory ? (
          <div className="mb-2 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <p className="label border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">Riwayat latihan</p>
            <ul className="max-h-56 overflow-y-auto">
              {history.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">Belum ada riwayat.</li>
              ) : (
                history.map((h) => (
                  <li key={h.day} className="flex items-center justify-between border-b border-zinc-50 px-3 py-2 text-sm last:border-0 dark:border-zinc-800/50">
                    <span>
                      <span className="block font-medium">{h.title}</span>
                      <span className="block text-[11px] text-zinc-400">{h.day}</span>
                    </span>
                    <span className={h.completed ? "font-medium text-teal-700 dark:text-teal-400" : "text-zinc-400"}>
                      {h.completed ? `${h.correct}/${h.total} benar` : `${h.done}/${h.total} dijawab`}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-teal-600 transition-all dark:bg-teal-500"
            style={{ width: `${(set.done / Math.max(1, total)) * 100}%` }}
          />
        </div>
        {savedDone > 0 && answeredHere === 0 ? (
          <p className="mt-1 text-[11px] text-teal-700 dark:text-teal-400">
            Progres kesimpen — lanjut dari soal {savedDone + 1}
          </p>
        ) : null}
      </div>

      {/* Kartu soal */}
      <div className="card">
        <span className="badge inline-flex items-center gap-1 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <meta.icon className="h-3.5 w-3.5" /> {meta.label}
        </span>

        {q.type === "mcq_en_id" ? (
          <p className="mt-3 text-center text-2xl font-bold">{q.prompt}</p>
        ) : q.type === "mcq_id_en" ? (
          <p className="mt-3 text-center text-xl font-semibold">“{q.prompt}”</p>
        ) : q.type === "cloze" ? (
          <p className="mt-3 text-center text-lg leading-relaxed">{q.prompt}</p>
        ) : (
          <>
            <p className="mt-3 text-center text-lg font-semibold tracking-wide">{q.prompt}</p>
            <p className="mt-1 text-center text-xs text-zinc-400">frasa EN yang cocok?</p>
          </>
        )}
      </div>

      <OptionList options={q.options} answer={q.answer} picked={picked} onPick={pick} />

      {picked !== null ? (
        <div className="space-y-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              String(picked) === q.answer
                ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {String(picked) === q.answer ? (
              <span className="font-medium">Benar!</span>
            ) : (
              <span>
                Jawaban yang tepat: <strong>{q.options[Number(q.answer)]}</strong>
              </span>
            )}
            {q.meaningId ? <span className="block text-xs opacity-80">{q.meaningId}</span> : null}
            {q.exampleEn ? (
              <span className="block text-xs italic opacity-70">“{q.exampleEn}”</span>
            ) : null}
          </div>
          <button className="btn-primary w-full" onClick={next}>
            Lanjut <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <button className="btn-ghost mx-auto flex w-full text-xs" onClick={markKnown}>
        <BadgeCheck className="mr-1 h-4 w-4" /> Sudah hafal — tandai & lewati
      </button>
    </div>
  );
}

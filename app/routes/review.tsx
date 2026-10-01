import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Ear,
  Eye,
  EyeOff,
  History,
  Keyboard,
  Layers,
  PartyPopper,
  Plus,
  RotateCcw,
  Repeat,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { env } from "~/lib/env.server";

export const meta: MetaFunction = () => [{ title: "Review — LingStick" }];
export const handle = { title: "Review" };

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  return { dailyTarget: env.DAILY_QUIZ_SIZE };
}

type QuestionType = "mcq_en_id" | "mcq_id_en" | "cloze" | "listen" | "typing";

type QuizQuestion = {
  itemId: number;
  bankId?: number;
  type: QuestionType;
  prompt: string;
  options: string[];
  answer: string;
  meaningId: string | null;
  exampleEn: string | null;
};

type SetInfo = {
  id: number;
  day: string;
  mode: string;
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

type FlashCard = {
  itemId: number;
  text: string;
  meaningId: string | null;
  firstEn: string | null;
  reps: number;
};

type Mode = "daily" | "flash" | "typing" | "intens";

const MODES: {
  id: Mode;
  label: string;
  icon: typeof Repeat;
  desc: string;
}[] = [
  { id: "daily", label: "Kuis Harian", icon: Repeat, desc: "Rutinitas 20 soal per hari — pilihan ganda, cloze, dengar" },
  { id: "flash", label: "Flashcard", icon: Layers, desc: "Kartu ingatan: lihat arti, nilai diri sendiri" },
  { id: "typing", label: "Latihan Ketik", icon: Keyboard, desc: "Ketik bahasa Inggrisnya dari arti Indonesia" },
  { id: "intens", label: "Intens Mingguan", icon: Zap, desc: "25 soal campuran buat mempertajam ingatan" },
];

const TYPE_META: Record<QuestionType, { label: string; icon: typeof Ear }> = {
  mcq_en_id: { label: "Arti dari frasa", icon: BookOpenCheck },
  mcq_id_en: { label: "Frasa yang tepat", icon: BookOpenCheck },
  cloze: { label: "Lengkapi kalimat", icon: Sparkles },
  listen: { label: "Cara bacanya", icon: Ear },
  typing: { label: "Ketik dalam Inggris", icon: Keyboard },
};

/** Pemilih metode (halaman depan Review). */
function ModePicker({
  onStart,
  onGenerate,
  genBusy,
  genMsg,
}: {
  onStart: (mode: Mode) => void;
  onGenerate: (mode: "typing" | "intens") => void;
  genBusy: string | null;
  genMsg: string | null;
}) {
  return (
    <div className="space-y-4">
      {genMsg ? (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-300">
          {genMsg}
        </div>
      ) : null}
      <div className="space-y-2">
        {MODES.map((m) => (
          <div key={m.id} className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <m.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{m.label}</p>
              <p className="truncate text-xs text-zinc-500">{m.desc}</p>
            </div>
            {m.id === "daily" || m.id === "flash" ? (
              <button className="btn-primary shrink-0 text-sm" onClick={() => onStart(m.id)}>
                Mulai
              </button>
              ) : (
              <button
                className="btn-secondary shrink-0 gap-1 text-sm"
                disabled={genBusy === m.id}
                onClick={() => onGenerate(m.id as "typing" | "intens")}
              >
                {genBusy === m.id ? (
                  <RotateCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Generate
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="px-1 text-center text-xs text-zinc-400">
        Generate = bikin soal tambahan baru di luar jadwal harian.
      </p>
    </div>
  );
}

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
  const [screen, setScreen] = useState<"pick" | "quiz" | "flash">("pick");
  const [mode, setMode] = useState<Mode>("daily");

  const [data, setData] = useState<QuizResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedResult, setTypedResult] = useState<null | { ok: boolean }>(null);
  const [savedDone, setSavedDone] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<
    { day: string; title: string; total: number; done: number; correct: number; completed: number }[]
  >([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  // Flashcard state
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [flashDone, setFlashDone] = useState(0);

  const load = useCallback((m: Mode) => {
    setLoading(true);
    const url = m === "daily" ? "/api/quiz" : `/api/quiz?mode=${m}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: QuizResponse) => {
        setData(d);
        setSavedDone(d.set?.done ?? 0);
        setPos(d.set?.done ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    fetch("/api/quiz?history=1")
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  }, []);

  const startQuiz = (m: Mode) => {
    setMode(m);
    setScreen("quiz");
    load(m);
  };

  const startFlash = () => {
    setMode("flash");
    setScreen("flash");
    setLoading(true);
    fetch("/api/flash")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards ?? []);
        setCardIdx(0);
        setReveal(false);
        setFlashDone(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const generateSet = async (m: "typing" | "intens") => {
    setGenBusy(m);
    setGenMsg(null);
    try {
      const r = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", mode: m, count: m === "intens" ? 25 : 15 }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || "Gagal generate");
      setGenMsg(`Set ${m === "intens" ? "intens" : "ketik"} baru siap — ${d.setId}`);
      startQuiz(m);
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : "Gagal generate");
      setGenBusy(null);
    }
  };

  const set = data?.set;
  const questions = data?.questions ?? [];
  const order = data?.order ?? [];
  const total = order.length;
  const currentIndex = order[pos] ?? -1;
  const q = currentIndex >= 0 ? questions[currentIndex] : undefined;
  const finished = Boolean(set?.completed) || (total > 0 && pos >= total);

  /** Terapkan progres terbaru dari respons server ke state UI. */
  const applyProgress = (res: {
    done?: number;
    correct?: number;
    order?: number[];
  }) => {
    if (typeof res?.done !== "number" && !Array.isArray(res?.order)) return;
    setData((d) =>
      d?.set
        ? {
            ...d,
            set: {
              ...d.set,
              done: typeof res.done === "number" ? res.done : d.set.done,
              correct: typeof res.correct === "number" ? res.correct : d.set.correct,
            },
            order: Array.isArray(res.order) ? res.order : d.order,
          }
        : d,
    );
  };

  const answer = (correct: boolean) => {
    setAnswered((n) => n + 1);
    if (correct) setCorrectHere((n) => n + 1);
    if (!q || !set) return;
    void fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId: set.id, index: currentIndex, correct, typed: mode === "typing" ? typed : undefined }),
    })
      .then((r) => r.json())
      .then(applyProgress)
      .catch(() => {});
  };

  const [answered, setAnswered] = useState(0);
  const [correctHere, setCorrectHere] = useState(0);

  const pick = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    answer(String(i) === q.answer);
  };

  const submitTyped = () => {
    if (typedResult !== null || !q) return;
    const ok = typed.trim().toLowerCase().replace(/[^a-z0-9' ]/g, "") === q.answer.replace(/[^a-z0-9' ]/g, "");
    setTypedResult({ ok });
    answer(ok);
  };

  const next = () => {
    setPicked(null);
    setTyped("");
    setTypedResult(null);
    setPos((p) => p + 1);
  };

  const rateCard = async (rating: 1 | 2 | 3 | 4) => {
    const c = cards[cardIdx];
    if (!c) return;
    setFlashDone((n) => n + 1);
    try {
      await fetch("/api/flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: c.itemId, rating }),
      });
    } catch {
      /* tetap lanjut */
    }
    if (cardIdx + 1 >= cards.length) {
      setScreen("pick");
      setGenMsg(`Flashcard selesai — ${flashDone + 1} kartu diulang FSRS`);
    } else {
      setCardIdx((i) => i + 1);
      setReveal(false);
    }
  };

  if (screen === "pick") {
    return <ModePicker onStart={startQuiz} onGenerate={generateSet} genBusy={genBusy} genMsg={genMsg} />;
  }

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

  /* ── Flashcard ── */
  if (screen === "flash") {
    const c = cards[cardIdx];
    if (!c) {
      return (
        <div className="py-16 text-center">
          <Layers className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
          <p className="mt-3 font-medium">Tidak ada kartu yang jatuh tempo</p>
          <p className="mt-1 text-sm text-zinc-500">Balik lagi nanti, atau kerjakan kuis harian dulu.</p>
          <button className="btn-secondary mt-6" onClick={() => setScreen("pick")}>
            Kembali
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Kartu {cardIdx + 1} / {cards.length}
          </span>
          <button className="btn-ghost text-xs" onClick={() => setScreen("pick")}>
            Selesai
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-teal-600 transition-all dark:bg-teal-500"
            style={{ width: `${(cardIdx / Math.max(1, cards.length)) * 100}%` }}
          />
        </div>

        <div className="card min-h-56 space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-wide text-zinc-400">
            {c.reps > 0 ? "Ulangi kartu ini" : "Kartu baru"}
          </p>
          <p className="text-2xl font-bold">{c.text}</p>
          {reveal ? (
            <div className="space-y-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <p className="text-lg text-teal-700 dark:text-teal-300">{c.meaningId}</p>
              {c.firstEn ? <p className="text-sm italic text-zinc-500">“{c.firstEn}”</p> : null}
            </div>
          ) : (
            <button className="btn-secondary mx-auto gap-1.5" onClick={() => setReveal(true)}>
              <Eye className="h-4 w-4" /> Lihat arti
            </button>
          )}
        </div>

        {reveal ? (
          <div className="space-y-2">
            <p className="text-center text-xs text-zinc-400">Seberapa pas kamu ingat?</p>
            <div className="grid grid-cols-4 gap-2">
              <button className="btn-secondary flex-col gap-1 py-3 text-xs" onClick={() => rateCard(1)}>
                <XCircle className="h-4 w-4 text-red-500" /> Lupa
              </button>
              <button className="btn-secondary flex-col gap-1 py-3 text-xs" onClick={() => rateCard(2)}>
                <RotateCcw className="h-4 w-4 text-amber-500" /> Susah
              </button>
              <button className="btn-secondary flex-col gap-1 py-3 text-xs" onClick={() => rateCard(3)}>
                <CheckCircle2 className="h-4 w-4 text-teal-600" /> Pas
              </button>
              <button className="btn-secondary flex-col gap-1 py-3 text-xs" onClick={() => rateCard(4)}>
                <Sparkles className="h-4 w-4 text-emerald-600" /> Gampang
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  /* ── Kuis ── */
  if (questions.length === 0) {
    return (
      <div className="py-16 text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Belum ada soal latihan</p>
        <p className="mt-1 text-sm text-zinc-500">
          Simpan kosakata dulu (Tambah / Bank Kata) — nanti otomatis dibuatkan set latihan
          (maks {dailyTarget} soal).
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/bank" className="btn-primary">
            Buka Bank Kata
          </Link>
          <button className="btn-secondary" onClick={() => setScreen("pick")}>
            Kembali
          </button>
        </div>
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
          {answered > 0 && answered < set!.done ? ` · kamu mengerjakan ${answered} soal di sesi ini` : ""}
        </p>
        <div className="mx-auto mt-4 h-2 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-teal-600 dark:bg-teal-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          Soal yang salah tadi udah dicatat FSRS — bakal muncul lagi di latihan berikutnya.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-primary" onClick={() => setScreen("pick")}>
            Metode lain
          </button>
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
                  <li
                    key={`${h.day}-${h.title}`}
                    className="flex items-center justify-between border-b border-zinc-50 px-3 py-2 text-sm last:border-0 dark:border-zinc-800/50"
                  >
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
        {savedDone > 0 && answered === 0 ? (
          <p className="mt-1 text-[11px] text-teal-700 dark:text-teal-400">
            Progres kesimpen — lanjut dari soal {savedDone + 1}
          </p>
        ) : null}
      </div>

      <div className="card">
        <span className="badge inline-flex items-center gap-1 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <meta.icon className="h-3.5 w-3.5" /> {meta.label}
        </span>

        {q.type === "typing" ? (
          <>
            <p className="mt-3 text-center text-xl font-semibold">“{q.prompt}”</p>
            <input
              className="input-area mt-4 text-center text-lg"
              placeholder="Ketik bahasa Inggrisnya…"
              value={typed}
              autoFocus
              disabled={typedResult !== null}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTyped();
              }}
            />
            {typedResult ? (
              <p
                className={`mt-2 text-center text-sm font-medium ${
                  typedResult.ok ? "text-teal-700 dark:text-teal-300" : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {typedResult.ok
                  ? "Tepat!"
                  : `Jawaban: ${q.answer}`}
              </p>
            ) : null}
            {typedResult ? null : (
              <button className="btn-primary mt-3 w-full" onClick={submitTyped} disabled={!typed.trim()}>
                Periksa
              </button>
            )}
          </>
        ) : q.type === "mcq_en_id" ? (
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

      {q.type === "typing" ? null : (
        <OptionList options={q.options} answer={q.answer} picked={picked} onPick={pick} />
      )}

      {picked !== null && q.type !== "typing" ? (
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
            {q.exampleEn ? <span className="block text-xs italic opacity-70">“{q.exampleEn}”</span> : null}
          </div>
          <button className="btn-primary w-full" onClick={next}>
            Lanjut <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {q.type === "typing" && typedResult ? (
        <div className="space-y-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              typedResult.ok
                ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {typedResult.ok ? (
              <span className="font-medium">Benar!</span>
            ) : (
              <span>
                Jawaban yang tepat: <strong>{q.answer}</strong>
              </span>
            )}
            {q.meaningId ? <span className="block text-xs opacity-80">{q.meaningId}</span> : null}
            {q.exampleEn ? <span className="block text-xs italic opacity-70">“{q.exampleEn}”</span> : null}
          </div>
          <button className="btn-primary w-full" onClick={next}>
            Lanjut <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {q.type !== "typing" ? (
        <button
          className="btn-ghost mx-auto flex w-full text-xs"
          onClick={() => {
            answer(true);
            next();
          }}
        >
          <BadgeCheck className="mr-1 h-4 w-4" /> Sudah hafal — tandai & lewati
        </button>
      ) : null}
    </div>
  );
}


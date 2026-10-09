import type { MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Dices,
  Ear,
  History,
  Keyboard,
  Loader2,
  Layers,
  Lightbulb,
  Mic,
  PartyPopper,
  PencilLine,
  Plus,
  Puzzle,
  RotateCcw,
  Repeat,
  Shuffle,
  Sparkles,
  Volume2,
  XCircle,
  Zap,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { env } from "~/lib/env.server";
import { getTargetLang } from "~/lib/lang.server";
import { JaText, hasJa } from "~/components/JaText";
import { MarkdownLite } from "~/components/MarkdownLite";
import { SpeakButton } from "~/components/SpeakButton";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Review — LingStick" }];
export const handle = { title: "Review" };

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  const { getStreak } = await import("~/lib/quiz.server");
  return { dailyTarget: env.DAILY_QUIZ_SIZE, lang: await getTargetLang(), streak: await getStreak() };
}

import { ttsLang } from "~/lib/utils.shared";

function speak(text: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang ?? ttsLang(text); // kana/kanji → ja-JP otomatis
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** r.json() yang aman — kalau body bukan JSON (mis. halaman error), jadi pesan jelas. */
async function safeJson<T = unknown>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(r.ok ? "Respons server nggak valid" : `Server error ${r.status}`);
  }
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
  reading?: string | null; // JA: kana (+romaji) — furigana di UI shadow
  tokens?: string[]; // JA Susun Kata: token per-kata dari segmentasi AI
  optionReadings?: (string | null)[]; // JA: reading per opsi
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
  reading?: string | null; // JA: kana di bawah kanji
  meaningId: string | null;
  notesId: string | null;
  firstEn: string | null;
  firstId: string | null;
  firstKana?: string | null; // JA: kana contoh — furigana kartu
  intervals?: { 1: string; 2: string; 3: string; 4: string } | null; // ala Anki
  reps: number;
};

type MatchPair = { itemId: number; word: string; meaning: string };

type Periodic = {
  toefl: { week: string; exists: boolean; setId: number | null; done: number; completed: boolean };
  bulanan: { month: string; available: boolean; exists: boolean; setId: number | null; done: number; completed: boolean };
};

type Mode = "daily" | "typing" | "intens" | "audio" | "scramble" | "mix" | "dikte" | "shadow" | "pola" | "salah";

const MODES: {
  id: Mode | "flash" | "match";
  label: string;
  icon: typeof Repeat;
  desc: string;
  action: "start" | "generate";
  group: "harian" | "mingguan" | "bebas";
}[] = [
  { id: "daily", group: "harian", label: "Kuis Harian", icon: Repeat, desc: "Rutinitas 20 soal per hari — campuran pilihan ganda, cloze, dengar", action: "start" },
  { id: "flash", group: "harian", label: "Flashcard", icon: Layers, desc: "Kartu ingatan yang jatuh tempo — tap flip, swipe nilai", action: "start" },
  { id: "typing", group: "bebas", label: "Latihan Ketik", icon: Keyboard, desc: "Ketik bahasa Inggrisnya dari arti Indonesia", action: "generate" },
  { id: "audio", group: "bebas", label: "Dengar", icon: Volume2, desc: "Dengarin cara bacanya, pilih arti yang tepat", action: "start" },
  { id: "scramble", group: "bebas", label: "Susun Kata", icon: Shuffle, desc: "Susun kata jadi frasa Inggris yang benar", action: "start" },
  { id: "mix", group: "bebas", label: "Campur", icon: Dices, desc: "Acak semua tipe soal — arti, ketik, dengar, susun", action: "start" },
  { id: "dikte", group: "bebas", label: "Dikte", icon: Ear, desc: "Dengarkan lalu ketik tepat seperti yang dibunyikan", action: "start" },
  { id: "shadow", group: "bebas", label: "Shadowing", icon: Mic, desc: "Dengarkan + ikuti ucapkan — latihan kelancaran", action: "start" },
  { id: "pola", group: "bebas", label: "Pola Kalimat", icon: PencilLine, desc: "Rumpang partikel & kata fungsi dari contoh nyata", action: "start" },
  { id: "salah", group: "bebas", label: "Ulas Salah", icon: RotateCcw, desc: "Ulangi yang pernah salah — 14 hari terakhir", action: "start" },
  { id: "intens", group: "mingguan", label: "Intens Mingguan", icon: Zap, desc: "25 soal campuran buat mempertajam ingatan", action: "generate" },
  { id: "match", group: "bebas", label: "Match", icon: Puzzle, desc: "Minigame: pasangkan kata dengan artinya — per ronde", action: "start" },
];

/** Override label/desc mode khusus Jepang. */
const JA_MODE_TEXT: Partial<Record<string, { label?: string; desc?: string }>> = {
  typing: { desc: "Ketik bahasa Jepangnya dari arti Indonesia" },
  scramble: { desc: "Susun token jadi kalimat Jepang yang benar" },
  mix: { desc: "Acak semua tipe soal — arti, ketik, dengar, susun" },
  dikte: { desc: "Dengarkan lalu ketik bahasa Jepangnya" },
  shadow: { desc: "Dengarkan + ikuti ucapkan — latihan kelancaran" },
  pola: { desc: "Rumpang partikel dari contoh nyata" },
  salah: { desc: "Ulangi yang pernah salah" },
};

const TYPE_META: Record<QuestionType, { label: string; icon: typeof Ear }> = {
  mcq_en_id: { label: "Arti dari frasa", icon: BookOpenCheck },
  mcq_id_en: { label: "Frasa yang tepat", icon: BookOpenCheck },
  cloze: { label: "Lengkapi kalimat", icon: Sparkles },
  listen: { label: "Cara bacanya", icon: Ear },
  typing: { label: "Ketik dalam Inggris", icon: Keyboard },
};

function normalizeAnswer(s: string): string {
  // Kana-aware: latin dilowercase + strip simbol, tapi hiragana/katakana/kanji dipertahankan.
  // matcha: JA typing ("きく") sebelumnya dinormalisasi jadi "" → selalu salah.
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(s)) {
    // Lipat katakana → hiragana biar キク == きく, buang semua whitespace.
    const folded = s.replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60),
    );
    return folded.replace(/[\s　]+/g, "").trim();
  }
  return s.toLowerCase().replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
}

/** Kartu tes periodik — TOEFL mingguan & Uji Bulanan. Border/badge warna sendiri. */
function PeriodicCard({
  kind,
  title,
  desc,
  badge,
  badgeCls,
  borderCls,
  status,
  onStart,
}: {
  kind: "toefl" | "bulanan";
  title: string;
  desc: string;
  badge: string;
  badgeCls: string;
  borderCls: string;
  status: { exists: boolean; setId: number | null; done: number; completed: boolean };
  onStart: (kind: "toefl" | "bulanan") => void;
}) {
  return (
    <div className={`card overflow-hidden border-2 ${borderCls} p-4`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeCls}`}>
          {badge}
        </span>
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{desc}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {status.completed
            ? "Selesai minggu/bulan ini — mantap"
            : status.exists
              ? `Sudah dimulai — ${status.done} soal terjawab, lanjutkan`
              : kind === "toefl"
                ? "Belum dikerjakan minggu ini"
                : "Menunggu dibuka"}
        </span>
        <button className="btn-primary shrink-0 text-sm" onClick={() => onStart(kind)}>
          {status.exists ? "Lanjutkan" : "Mulai"}
        </button>
      </div>
    </div>
  );
}

/** Pemilih metode (halaman depan Review). */
function ModePicker({
  periodic,
  onStart,
  onGenerate,
  genBusy,
  genMsg,
  genIsError,
  ja,
}: {
  periodic: Periodic | null;
  onStart: (mode: Mode | "flash" | "match" | "toefl" | "bulanan") => void;
  onGenerate: (mode: "typing" | "intens") => void;
  genBusy: string | null;
  genMsg: string | null;
  genIsError: boolean;
  ja: boolean;
}) {
  return (
    <div className="space-y-4">
      {genMsg ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            genIsError
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
              : "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
          }`}
          role={genIsError ? "alert" : "status"}
        >
          {genMsg}
        </div>
      ) : null}

      {/* Tes periodik — TOEFL mingguan & Uji Bulanan (JA: gaya JLPT) */}
      {periodic ? (
        <section className="space-y-2">
          <p className="label px-1">Tes periodik</p>
          <div className="grid gap-2 md:grid-cols-2">
          <PeriodicCard
            kind="toefl"
            title={ja ? "Tes JLPT Mingguan" : "TOEFL Test Mingguan"}
            badge="Mingguan"
            badgeCls="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
            borderCls="border-indigo-300/70 dark:border-indigo-800"
            desc={
              ja
                ? "40 soal gaya JLPT (Tata Bahasa → Kosakata → Dengar) · timer 25 menit · skor + estimasi level"
                : "40 soal · 3 section gaya TOEFL (Structure → Vocabulary → Listening) · timer 25 menit · skor + estimasi level"
            }
            status={periodic.toefl}
            onStart={onStart}
          />
          {periodic.bulanan.available ? (
            <PeriodicCard
              kind="bulanan"
              title={ja ? "JLPT Bulanan" : "Uji Bulanan"}
              badge="Bulanan"
              badgeCls="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              borderCls="border-amber-300/70 dark:border-amber-800"
              desc="50 soal campuran + menulis · ditambah tiap akhir bulan · ngukur progres total"
              status={periodic.bulanan}
              onStart={onStart}
            />
          ) : (
            <div className="card p-4 opacity-70">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Bulanan
                </span>
                <p className="font-semibold">{ja ? "JLPT Bulanan" : "Uji Bulanan"}</p>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Terbuka mulai tanggal 25 — akhir bulan, buat ngukur capaian sebulan penuh.
              </p>
            </div>
          )}
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="label px-1">Latihan harian — rutinitas inti tiap hari</p>
        <div className="grid gap-2 md:grid-cols-2">
        {MODES.filter((m) => m.group === "harian").map((m) => {
          const label = ja ? (JA_MODE_TEXT[m.id]?.label ?? m.label) : m.label;
          const desc = ja ? (JA_MODE_TEXT[m.id]?.desc ?? m.desc) : m.desc;
          return (
          <div key={m.id} className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <m.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label}</p>
              <p className="line-clamp-2 text-xs text-zinc-500">{desc}</p>
            </div>
            {m.action === "start" ? (
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
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyusun…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            )}
          </div>
          );
        })}
        </div>
      </section>

      {/* Mingguan cuma 1 kartu — full-width featured, bukan setengah grid yang mlompong.
          matcha: 1 item di grid 2 kolom = separuh kosong. */}
      <section className="space-y-2">
        <p className="label px-1">Mingguan — set berat seminggu sekali</p>
        <div className="grid gap-2">
        {MODES.filter((m) => m.group === "mingguan").map((m) => {
          const label = ja ? (JA_MODE_TEXT[m.id]?.label ?? m.label) : m.label;
          const desc = ja ? (JA_MODE_TEXT[m.id]?.desc ?? m.desc) : m.desc;
          return (
          <div key={m.id} className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <m.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label}</p>
              <p className="line-clamp-2 text-xs text-zinc-500">{desc}</p>
            </div>
            {m.action === "start" ? (
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
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyusun…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            )}
          </div>
          );
        })}
        </div>
      </section>

      {/* Bebas: 8 kartu — 2 kolom di tablet, 3 di laptop biar padat rapi.
          matcha: struktur <p> bersarang + catatan Generate dihapus — invalid HTML
          bikin label "LATIHAN BEBAS" mepet konten. */}
      <section className="space-y-2">
        <p className="label px-1">Latihan bebas — tanpa jadwal, kapan pun</p>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {MODES.filter((m) => m.group === "bebas").map((m) => {
          const label = ja ? (JA_MODE_TEXT[m.id]?.label ?? m.label) : m.label;
          const desc = ja ? (JA_MODE_TEXT[m.id]?.desc ?? m.desc) : m.desc;
          return (
          <div key={m.id} className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <m.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{label}</p>
              <p className="line-clamp-2 text-xs text-zinc-500">{desc}</p>
            </div>
            {m.action === "start" ? (
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
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyusun…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Generate
                  </>
                )}
              </button>
            )}
          </div>
          );
        })}
        </div>
      </section>

      {/* Latihan kanji multi-metode — khusus mode Jepang */}
      {ja ? (
        <Link
          to="/aksara?script=kanji"
          className="card flex items-center gap-3 p-4 transition-colors hover:border-teal-300 dark:hover:border-teal-800"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-lg font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            漢
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Latihan Kanji</p>
            <p className="line-clamp-2 text-xs text-zinc-500">
              Kenalin, pilih bacaan &amp; arti per level N5–N1 — plus tabel hiragana/katakana
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
        </Link>
      ) : null}

      {/* Latihan Reading — JA (JLPT) & EN (CEFR) */}
      <Link
        to="/reading"
        className="card flex items-center gap-3 p-4 transition-colors hover:border-teal-300 dark:hover:border-teal-800"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          <BookOpenCheck className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Reading</p>
          <p className="line-clamp-2 text-xs text-zinc-500">
            {ja
              ? "Baca berita & cerpen per level N5–N1 — kanji hijau + furigana, bisa diulang"
              : "Baca teks pendek per level CEFR A1–C2 dengan arti Indonesia"}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
      </Link>

      {/* Latihan nulis kanji/kana — khusus mode Jepang */}
      {ja ? (
      <Link
        to="/write"
        className="card flex items-center gap-3 p-4 transition-colors hover:border-teal-300 dark:hover:border-teal-800"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          <PencilLine className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Latihan Nulis</p>
          <p className="line-clamp-2 text-xs text-zinc-500">
            Coret kanji &amp; kana di canvas — panduan samar bisa dimatikan
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400" />
      </Link>
      ) : null}
    </div>
  );
}

/** Acak urutan opsi SETELAH mount (anti hydration mismatch). */
function OptionList({
  options,
  answer,
  picked,
  onPick,
  readings,
}: {
  options: string[];
  answer: string;
  picked: number | null;
  onPick: (i: number) => void;
  /** JA: reading per opsi (sejajar options) — furigana tiap opsi. */
  readings?: (string | null)[];
}) {
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => {
    setOrder(options.map((_, i) => i).sort(() => Math.random() - 0.5));
  }, [options]);
  return (
    <div className="grid gap-2 md:grid-cols-2">
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
            {hasJa(opt) ? (
              <JaText
                text={opt}
                reading={readings?.[origIdx] ?? undefined}
                kanjiClassName="text-teal-700 dark:text-teal-400"
                romajiToggle={false}
              />
            ) : (
              opt
            )}
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
  const { dailyTarget, lang, streak } = useLoaderData<typeof loader>();
  const ja = lang === "ja";
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // Mode kesimpen di URL (?mode=toefl) — refresh gak balikin ke picker.
  const urlMode = params.get("mode");
  const [screen, setScreen] = useState<"pick" | "quiz" | "flash" | "match">(
    urlMode === "flash" ? "flash" : urlMode === "match" ? "match" : urlMode ? "quiz" : "pick",
  );
  const [mode, setMode] = useState<Mode>(
    urlMode && ["daily", "typing", "intens", "audio", "scramble", "mix", "dikte", "shadow", "pola", "salah"].includes(urlMode)
      ? (urlMode as Mode)
      : "daily",
  );
  const [periodic, setPeriodic] = useState<Periodic | null>(null);

  const [data, setData] = useState<QuizResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Mulai true kalau URL bawa ?mode=… — restore antrean/soal dulu, jangan sampai
  // layar singgah di "tidak ada kartu" (kesannya keluar dari sesi).
  const [loading, setLoading] = useState(Boolean(urlMode));
  const [pos, setPos] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedResult, setTypedResult] = useState<null | { ok: boolean }>(null);
  const [answered, setAnswered] = useState(0);
  const [correctHere, setCorrectHere] = useState(0);
  const [savedDone, setSavedDone] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<
    { day: string; title: string; total: number; done: number; correct: number; completed: number }[]
  >([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  // Pesan generate terakhir itu error? (band merah vs hijau di picker)
  const genIsError = genBusy === null && genMsg !== null && !/selesai/i.test(genMsg);
  // Timer TOEFL: 25 menit — habis = tes otomatis berakhir (jawaban terkini dihitung).
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);

  // Susun Kata
  const [scrambleOrder, setScrambleOrder] = useState<number[]>([]);
  const [pickedWords, setPickedWords] = useState<number[]>([]);

  // Shadowing + mic: nilai ucapan via SpeechRecognition (transkrip vs target).
  // Waveform tidak dipakai — transkrip kata jauh lebih relevan buat skor bahasa.
  const [micBusy, setMicBusy] = useState(false);
  const [micResult, setMicResult] = useState<{ score: number; heard: string } | null>(null);

  const scoreMic = (target: string, isJa: boolean) => {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => any }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SR) {
      toast("Browser tidak mendukung nilai suara — pakai Chrome");
      return;
    }
    if (micBusy) return;
    setMicBusy(true);
    setMicResult(null);
    try {
      const rec = new SR();
      rec.lang = isJa ? "ja-JP" : "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      const stop = () => setMicBusy(false);
      rec.onend = stop;
      rec.onerror = () => {
        stop();
        toast("Mic gagal — cek izin mikrofon");
      };
      rec.onresult = (e: any) => {
        const heard = String(e.results?.[0]?.[0]?.transcript ?? "");
        // Skor = irisan kata (EN) / karakter (JA, tanpa spasi) vs target.
        const norm = (s: string) =>
          isJa ? s.replace(/[\s　、。！？「」]/g, "") : s.toLowerCase().replace(/[^a-z' ]/g, "");
        const t = norm(target);
        const h = norm(heard);
        let score: number;
        if (!t || !h) {
          score = 0;
        } else if (isJa) {
          const set = new Set([...h]);
          const hit = [...t].filter((c) => set.has(c)).length;
          score = Math.round((hit / Math.max(t.length, h.length)) * 100);
        } else {
          const tw = t.split(/\s+/).filter(Boolean);
          const hw = new Set(h.split(/\s+/).filter(Boolean));
          const hit = tw.filter((w) => hw.has(w)).length;
          score = Math.round((hit / Math.max(tw.length, 1)) * 100);
        }
        setMicResult({ score, heard });
        stop();
      };
      rec.start();
    } catch {
      setMicBusy(false);
      toast("Mic gagal dimulai");
    }
  };

  // Flashcard
  const [cards, setCards] = useState<FlashCard[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [drag, setDrag] = useState(0);
  const [flashDone, setFlashDone] = useState(0);
  const [reverse, setReverse] = useState(false); // dua arah: ID → EN
  const dragStartX = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  // Match
  const [matchRounds, setMatchRounds] = useState<MatchPair[][]>([]);
  const [matchRound, setMatchRound] = useState(0);
  const [enOrder, setEnOrder] = useState<number[]>([]);
  const [idOrder, setIdOrder] = useState<number[]>([]);
  const [selectedEn, setSelectedEn] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  const [wrongPair, setWrongPair] = useState<{ en: number | null; id: number | null }>({
    en: null,
    id: null,
  });
  // Hint: 1x per ronde — sorot satu pasangan yang benar.
  const [hintPair, setHintPair] = useState<number | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const matchResults = useRef<{ itemId: number; correct: boolean }[]>([]);
  const matchWrong = useRef<Record<number, number>>({});

  const load = useCallback((m: Mode) => {
    setLoading(true);
    setLoadError(null);
    const url = m === "daily" ? "/api/quiz" : `/api/quiz?mode=${m}`;
    fetch(url)
      .then((r) => safeJson<QuizResponse>(r))
      .then((d) => {
        setData(d);
        setSavedDone(d.set?.done ?? 0);
        setPos(d.set?.done ?? 0);
        setLoading(false);
      })
      .catch((e: Error) => {
        setLoadError(e.message);
        setLoading(false);
      });
    fetch("/api/quiz?history=1")
      .then((r) => safeJson<{ history: typeof history }>(r))
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  }, []);

  // Muat status tes periodik untuk picker.
  useEffect(() => {
    if (screen !== "pick") return;
    fetch("/api/quiz?periodic=1")
      .then((r) => safeJson<Periodic>(r))
      .then(setPeriodic)
      .catch(() => {});
  }, [screen]);

  // Restore mode quiz biasa dari URL (?mode=typing dst) — refresh gak balikin ke picker.
  useEffect(() => {
    if (screen !== "quiz" || data || !urlMode) return;
    if (["daily", "typing", "intens", "audio", "scramble", "mix", "dikte", "shadow", "pola", "salah"].includes(urlMode)) {
      load(urlMode as Mode);
      return;
    }
    if (urlMode === "toefl" || urlMode === "bulanan") return; // ditangani efek periodik
    // Param asing — bersihkan & balik picker.
    setParams({}, { preventScrollReset: true });
    setScreen("pick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore flashcard dari URL (?mode=flash) — antrean FSRS dimuat ulang.
  useEffect(() => {
    if (screen !== "flash" || urlMode !== "flash") return;
    setLoading(true);
    fetch("/api/flash")
      .then((r) => safeJson<{ cards: FlashCard[] }>(r))
      .then((d) => {
        setCards(d.cards ?? []);
        setCardIdx(0);
        setReveal(false);
        setDrag(0);
        setFlashDone(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore match dari URL (?mode=match) — ronde diacak ulang, jawaban belum terkirim gak tersimpan.
  useEffect(() => {
    if (screen !== "match" || urlMode !== "match") return;
    matchResults.current = [];
    matchWrong.current = {};
    setLoading(true);
    fetch("/api/match")
      .then((r) => safeJson<{ rounds: MatchPair[][] }>(r))
      .then((d) => {
        setMatchRounds(d.rounds ?? []);
        setMatchRound(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore tes periodik dari URL (?mode=toefl) — refresh gak balikin ke picker.
  useEffect(() => {
    if ((urlMode !== "toefl" && urlMode !== "bulanan") || screen !== "quiz" || data) return;
    setLoading(true);
    fetch(`/api/quiz?mode=${urlMode}`)
      .then((r) => safeJson<QuizResponse>(r))
      .then((d) => {
        if (!d.set) {
          setScreen("pick");
          setLoading(false);
          return;
        }
        setData(d);
        setSavedDone(d.set.done);
        setPos(d.set.done);
        setLoading(false);
      })
      .catch(() => {
        setScreen("pick");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPeriodic = (kind: "toefl" | "bulanan") => {
    setMode("daily");
    setScreen("quiz");
    setLoading(true);
    setLoadError(null);
    setParams({ mode: kind }, { preventScrollReset: true });
    fetch(`/api/quiz?mode=${kind}`)
      .then((r) => safeJson<QuizResponse>(r))
      .then((d) => {
        if (!d.set) {
          toast("Kosakata belum cukup buat tes — simpan lebih banyak kata dulu");
          setScreen("pick");
          setLoading(false);
          return;
        }
        setData(d);
        setSavedDone(d.set.done);
        setPos(d.set.done);
        setLoading(false);
      })
      .catch((e: Error) => {
        setLoadError(e.message);
        setLoading(false);
      });
  };

  const startQuiz = (m: Mode) => {
    setMode(m);
    setScreen("quiz");
    setParams({ mode: m }, { preventScrollReset: true });
    load(m);
  };

  /** Muat set spesifik by id — dipakai setelah Generate biar yang dimainkan set barunya. */
  const loadSetById = (id: number) => {
    setLoading(true);
    setLoadError(null);
    fetch(`/api/quiz?setId=${id}`)
      .then((r) => safeJson<QuizResponse>(r))
      .then((d) => {
        setData(d);
        setSavedDone(d.set?.done ?? 0);
        setPos(d.set?.done ?? 0);
        setLoading(false);
      })
      .catch((e: Error) => {
        setLoadError(e.message);
        setLoading(false);
      });
  };

  const startFlash = () => {
    setMode("daily");
    setScreen("flash");
    setParams({ mode: "flash" }, { preventScrollReset: true });
    setLoading(true);
    fetch("/api/flash")
      .then((r) => safeJson<{ cards: FlashCard[] }>(r))
      .then((d) => {
        setCards(d.cards ?? []);
        setCardIdx(0);
        setReveal(false);
        setDrag(0);
        setFlashDone(0);
        setFlashRound(1);
        shownIds.current.clear();
        requeues.current.clear();
        setLoading(false);
      })
      .catch((e: Error) => {
        toast(e.message);
        setLoading(false);
      });
  };

  const startMatch = () => {
    setScreen("match");
    setParams({ mode: "match" }, { preventScrollReset: true });
    setLoading(true);
    matchResults.current = [];
    matchWrong.current = {};
    fetch("/api/match")
      .then((r) => safeJson<{ rounds: MatchPair[][] }>(r))
      .then((d) => {
        setMatchRounds(d.rounds ?? []);
        setMatchRound(0);
        setLoading(false);
      })
      .catch((e: Error) => {
        toast(e.message);
        setLoading(false);
      });
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
      const d = await safeJson<{ ok?: boolean; setId?: number; error?: string }>(r);
      if (!r.ok || !d.ok) throw new Error(d.error || "Gagal generate");
      // Mainkan langsung set yang barusan dibuat — WAJIB pindah layar, bukan cuma load.
      setGenBusy(null);
      setMode(m);
      setScreen("quiz");
      setParams({ mode: m }, { preventScrollReset: true });
      loadSetById(d.setId!);
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
  const finished =
    timeUp || Boolean(set?.completed) || (total > 0 && pos >= total);

  /** Terapkan progres terbaru dari respons server ke state UI. */
  const applyProgress = (res: { done?: number; correct?: number; order?: number[] }) => {
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

  // Timer jalan khusus TOEFL.
  useEffect(() => {
    if (mode !== "daily" || set?.mode !== "toefl" || screen !== "quiz") return;
    setTimeLeft((t) => (t === null ? 25 * 60 : t));
  }, [mode, set?.mode, screen]);
  useEffect(() => {
    if (timeLeft === null || timeUp || finished) return;
    if (timeLeft <= 0) {
      setTimeUp(true);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, timeUp, finished]);

  const answer = (correct: boolean) => {
    setAnswered((n) => n + 1);
    if (correct) setCorrectHere((n) => n + 1);
    if (!q || !set) return;
    const typedText = mode === "typing" || mode === "scramble" ? typed : undefined;
    void fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId: set.id, index: currentIndex, pos, correct, typed: typedText }),
    })
      .then((r) => safeJson<{ done?: number; correct?: number; order?: number[] }>(r))
      .then(applyProgress)
      .catch(() => {});
  };

  const pick = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    answer(String(i) === q.answer);
  };

  // Susun Kata: susun ulang chip tiap ganti soal — JP pakai token AI, EN split spasi.
  useEffect(() => {
    if (screen !== "quiz" || mode !== "scramble" || !q) return;
    setPickedWords([]);
    const words = q.tokens && q.tokens.length >= 2 ? q.tokens : (q.answer ?? "").split(/\s+/).filter(Boolean);
    setScrambleOrder(words.map((_, i) => i).sort(() => Math.random() - 0.5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, mode, currentIndex]);

  // Dengar: otomatis bunyikan kata saat soal muncul.
  useEffect(() => {
    if (screen !== "quiz" || mode !== "audio" || !q || picked !== null) return;
    const t = setTimeout(() => speak(q.options[Number(q.answer)]), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, mode, currentIndex]);

  // Dikte + shadowing: bunyikan jawaban (kalimat/frasa) tiap ganti soal.
  useEffect(() => {
    if (screen !== "quiz" || (mode !== "dikte" && mode !== "shadow") || !q) return;
    setMicResult(null);
    if (mode === "dikte" && typedResult !== null) return;
    const t = setTimeout(() => speak(q.answer), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, mode, currentIndex]);

  const submitAnswerText = (text: string) => {
    if (typedResult !== null || !q) return;
    const ok = normalizeAnswer(text) === normalizeAnswer(q.answer);
    setTypedResult({ ok });
    setTyped(text);
    answer(ok);
  };

  const next = () => {
    setPicked(null);
    setTyped("");
    setTypedResult(null);
    setPos((p) => p + 1);
  };

  const backToPick = (msg?: string) => {
    setScreen("pick");
    setParams({}, { preventScrollReset: true });
    if (msg) setGenMsg(msg);
  };

  /* ── Flashcard actions ── */
  // Kartu habis → reshuffle + putaran baru (flashcard itu latihan TANPA
  // batas, bukan set harian; keluar hanya via tombol Selesai).
  // matcha: dulu habis = balik picker (kesannya hilang); endless + FSRS tetap
  // dicatat per rating.
  const [flashRound, setFlashRound] = useState(1);
  // ID kartu yang sudah tampil sesi ini — dikirim sebagai exclude biar putaran
  // berikutnya beda kartu + kartu baru otomatis nyelip (server fallback penuh
  // kalau habis). matcha: putaran 2+ isinya itu-itu saja.
  const shownIds = useRef<Set<number>>(new Set());
  const advanceCard = () => {
    const c = cards[cardIdx];
    if (c) shownIds.current.add(c.itemId);
    setFlashDone((n) => n + 1);
    if (cardIdx + 1 >= cards.length) {
      const exclude = [...shownIds.current].join(",");
      fetch(`/api/flash?exclude=${exclude}`)
        .then((r) => safeJson<{ cards: FlashCard[] }>(r))
        .then((d) => {
          if (d.cards && d.cards.length > 0) {
            setCards(d.cards);
          } else {
            setCards((list) => [...list].sort(() => Math.random() - 0.5));
          }
          requeues.current.clear();
          setCardIdx(0);
          setReveal(false);
          setDrag(0);
          setFlashRound((r) => {
            toast(`Putaran ${r + 1} — kartu baru`);
            return r + 1;
          });
        })
        .catch(() => {
          setCards((list) => [...list].sort(() => Math.random() - 0.5));
          setCardIdx(0);
          setReveal(false);
          setDrag(0);
          setFlashRound((r) => r + 1);
        });
    } else {
      setCardIdx((i) => i + 1);
      setReveal(false);
      setDrag(0);
    }
  };

  // Requeue sesi ala Anki: Lupa/Susah → kartu balik lagi ±5 posisi
  // (maks 2x per kartu per putaran biar sesi tidak menggembung), TAPI hanya
  // kalau cooldown FSRS-nya sudah lewat (due <= now+90s). Kalau masih cooldown,
  // kartu ditahan — sesi lanjut ke kartu lain dulu, tidak dipaksa muncul.
  // matcha: requeue buta = kartu "Susah" muncul padahal FSRS bilang 10 mnt lagi.
  const requeues = useRef(new Map<number, number>());
  const cooldowns = useRef(new Map<number, number>());
  const requeueCard = (rating: 1 | 2 | 3 | 4, due?: number) => {
    if (rating !== 1 && rating !== 2) return;
    const c = cards[cardIdx];
    if (!c) return;
    if (due && due > Date.now() + 90_000) {
      cooldowns.current.set(c.itemId, due);
      return;
    }
    const n = requeues.current.get(c.itemId) ?? 0;
    if (n >= 2) return;
    requeues.current.set(c.itemId, n + 1);
    setCards((list) => {
      const at = Math.min(list.length, cardIdx + 1 + 4 + Math.floor(Math.random() * 3));
      const next = [...list];
      next.splice(at, 0, c);
      return next;
    });
  };

  const fmtCooldown = (due: number) => {
    const m = Math.max(1, Math.round((due - Date.now()) / 60000));
    if (m < 60) return `${m} mnt lagi`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} jam lagi`;
    return `${Math.round(h / 24)} hari lagi`;
  };

  const [askBusy, setAskBusy] = useState(false);
  const [askReply, setAskReply] = useState<string | null>(null);

  const askLing = async () => {
    const c = cards[cardIdx];
    if (!c || askBusy) return;
    setAskBusy(true);
    setAskReply(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Jelaskan kata "${c.text}" (${c.meaningId ?? "tanpa arti"}) singkat: arti, kapan dipakai, 1 contoh kalimat + artinya. Bahasa Indonesia.`,
        }),
      });
      const d = await safeJson<{ ok?: boolean; reply?: string; error?: string }>(r);
      if (!r.ok) throw new Error(d.error || "Ling gagal jawab");
      setAskReply(d.reply ?? "");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Ling gagal jawab");
    } finally {
      setAskBusy(false);
    }
  };

  const saveAskToLibrary = async () => {
    const c = cards[cardIdx];
    if (!c || !askReply) return;
    try {
      const r = await fetch(`/api/items/${c.itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notesId: askReply.slice(0, 2000) }),
      });
      if (!r.ok) throw new Error("Gagal simpan");
      setCards((list) =>
        list.map((k, i) => (i === cardIdx ? { ...k, notesId: askReply.slice(0, 2000) } : k)),
      );
      toast("Penjelasan Ling tersimpan di Library");
    } catch {
      toast("Gagal simpan ke Library");
    }
  };

  const rateCard = async (rating: 1 | 2 | 3 | 4, msg?: string) => {
    const c = cards[cardIdx];
    if (!c) return;
    advanceCard();
    try {
      const r = await fetch("/api/flash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: c.itemId, rating }),
      });
      const d = await safeJson<{ ok?: boolean; due?: number }>(r);
      // Cooldown jujur: requeue lokal hanya kalau due sudah lewat.
      requeueCard(rating, d.due);
      if (msg) {
        toast(d.due && d.due > Date.now() + 90_000 ? `Dicatat — muncul lagi ${fmtCooldown(d.due)}` : msg);
      } else if (d.due && d.due > Date.now() + 90_000 && (rating === 1 || rating === 2)) {
        toast(`Muncul lagi ${fmtCooldown(d.due)} — lanjut kartu lain dulu`);
      }
    } catch {
      /* tetap lanjut */
    }
  };

  const knowCard = async () => {
    const c = cards[cardIdx];
    if (!c) return;
    advanceCard();
    try {
      await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: c.itemId, action: "known" }),
      });
      toast("Ditandai udah tahu — cek di Library");
    } catch {
      toast("Gagal menandai — coba lagi nanti");
    }
  };

  /* ── Swipe handlers (flashcard) ── */
  const onSwipeStart = (clientX: number) => {
    dragStartX.current = clientX;
    dragging.current = true;
    moved.current = false;
  };
  const onSwipeMove = (clientX: number) => {
    if (!dragging.current) return;
    const dx = clientX - dragStartX.current;
    if (Math.abs(dx) > 6) moved.current = true;
    setDrag(dx);
  };
  const onSwipeEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = drag;
    if (dx > 90) {
      navigator.vibrate?.(20);
      void knowCard();
    } else if (dx < -90) {
      navigator.vibrate?.(20);
      void rateCard(1, "Masih dipelajari — bakal muncul lagi");
    } else {
      setDrag(0);
    }
  };

  /* ── Match actions ── */
  const useHint = () => {
    const round = matchRounds[matchRound];
    if (!round || hintUsed) return;
    const remaining = round.filter((p) => !matchedIds.has(p.itemId));
    if (remaining.length <= 1) return; // 1 pasangan tersisa = sudah jelas
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    setHintPair(pick.itemId);
    setHintUsed(true);
    navigator.vibrate?.(10);
  };

  const finishMatch = async (msg: string) => {
    const results = [...matchResults.current];
    backToPick(msg);
    try {
      await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });
    } catch {
      /* progres FSRS gak kritis */
    }
  };

  const pickMeaning = (j: number) => {
    const round = matchRounds[matchRound];
    if (!round || selectedEn === null || matchedIds.has(round[j].itemId)) return;
    const enPair = round[selectedEn];
    const idPair = round[j];
    if (enPair.itemId === idPair.itemId) {
      const nextMatched = new Set(matchedIds).add(idPair.itemId);
      setMatchedIds(nextMatched);
      if (hintPair === idPair.itemId) setHintPair(null); // pasangan hint cocok
      matchResults.current.push({
        itemId: idPair.itemId,
        correct: (matchWrong.current[idPair.itemId] ?? 0) === 0,
      });
      setSelectedEn(null);
      navigator.vibrate?.(10);
      if (nextMatched.size === round.length) {
        if (matchRound + 1 >= matchRounds.length) {
          void finishMatch(
            `Match selesai — ${matchResults.current.length} pasang dimainkan`,
          );
        } else {
          setTimeout(() => setMatchRound((r) => r + 1), 450);
        }
      }
    } else {
      matchWrong.current[idPair.itemId] = (matchWrong.current[idPair.itemId] ?? 0) + 1;
      matchWrong.current[enPair.itemId] = (matchWrong.current[enPair.itemId] ?? 0) + 1;
      setWrongPair({ en: selectedEn, id: j });
      setTimeout(() => setWrongPair({ en: null, id: null }), 550);
    }
  };

  // Acak ulang tile tiap ganti ronde
  useEffect(() => {
    if (screen !== "match") return;
    const n = matchRounds[matchRound]?.length ?? 0;
    setEnOrder([...Array(n).keys()].sort(() => Math.random() - 0.5));
    setIdOrder([...Array(n).keys()].sort(() => Math.random() - 0.5));
    setSelectedEn(null);
    setMatchedIds(new Set());
    setWrongPair({ en: null, id: null });
    setHintPair(null);
    setHintUsed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, matchRound, matchRounds]);

  if (screen === "pick") {
    return (
      <div className="space-y-3">
        {/* Streak latihan harian — retensi naik kalau ada target beruntun. */}
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-lg dark:bg-amber-950">
            🔥
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {streak.days > 0 ? `${streak.days} hari beruntun` : "Mulai streak hari ini"}
            </p>
            <p className="line-clamp-2 text-xs text-zinc-500">
              {streak.todayDone
                ? "Hari ini sudah latihan — besok lanjutkan"
                : streak.days > 0
                  ? "Selesaikan 1 set biar streak tidak putus"
                  : "Selesaikan 1 set latihan apa pun"}
            </p>
          </div>
        </div>
        <ModePicker
        periodic={periodic}
        ja={ja}
        onStart={(m) =>
          m === "flash"
            ? startFlash()
            : m === "match"
              ? startMatch()
              : m === "toefl" || m === "bulanan"
                ? startPeriodic(m)
                : startQuiz(m)
        }
        onGenerate={generateSet}
        genBusy={genBusy}
        genMsg={genMsg}
        genIsError={genIsError}
      />
      </div>
    );
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
          <div className="mt-6 flex justify-center gap-2">
            <button className="btn-secondary" onClick={() => backToPick()}>
              Kembali
            </button>
            <button className="btn-primary" onClick={() => startFlash()}>
              <RotateCcw className="h-4 w-4" /> Muat ulang
            </button>
          </div>
        </div>
      );
    }
    const revealPct = Math.min(1, Math.max(0, drag / 90));
    // Sesi fokus: sempit tengah di desktop (max-w-xl), tombol w-full tetap manusiawi.
    // matcha: w-full di layar 5xl = tombol melar jelek.
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        {/* Flashcard = sesi santai tanpa target: tanpa progress bar & nomor kartu.
            matcha: bar Kartu X/Y + putaran bikin kesan kejar setoran, padahal FSRS yang ngatur. */}
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {flashDone > 0 ? `${flashDone} kartu dilatih · santai, tanpa target` : "Sesi santai · tanpa target"}
          </span>
          <span className="flex items-center gap-1">
            <button
              className="btn-ghost text-xs"
              title={ja ? "Balik arah kartu (JP→ID atau ID→JP)" : "Balik arah kartu (EN→ID atau ID→EN)"}
              onClick={() => setReverse((v) => !v)}
            >
              {ja ? (reverse ? "ID → JP" : "JP → ID") : reverse ? "ID → EN" : "EN → ID"}
            </button>
            <button className="btn-ghost text-xs" onClick={() => backToPick()}>
              Selesai
            </button>
          </span>
        </div>

        {/* Kartu interaktif di tengah */}
        <div className="flex justify-center">
          <div className="relative w-full max-w-sm">
            {/* Overlay swipe */}
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-start justify-start rounded-2xl border-2 border-red-400 bg-red-50/90 p-4 transition-opacity dark:bg-red-950/80"
              style={{ opacity: drag < -10 ? revealPct : 0 }}
            >
              <span className="rounded-lg bg-red-500 px-2 py-1 text-xs font-bold text-white">
                MASIH DIPELAJARI
              </span>
            </div>
            <div
              className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end rounded-2xl border-2 border-teal-400 bg-teal-50/90 p-4 transition-opacity dark:bg-teal-950/80"
              style={{ opacity: drag > 10 ? revealPct : 0 }}
            >
              <span className="rounded-lg bg-teal-600 px-2 py-1 text-xs font-bold text-white">
                UDAH TAHU
              </span>
            </div>

            <div
              className="card min-h-64 cursor-pointer select-none space-y-4 p-6 text-center transition-transform"
              style={{
                transform: `translateX(${drag}px) rotate(${drag / 24}deg)`,
                transition: dragging.current ? "none" : "transform 180ms ease",
              }}
              onTouchStart={(e) => onSwipeStart(e.touches[0].clientX)}
              onTouchMove={(e) => onSwipeMove(e.touches[0].clientX)}
              onTouchEnd={() => onSwipeEnd()}
              onClick={() => {
                if (moved.current) return;
                setReveal((v) => !v);
                navigator.vibrate?.(10);
              }}
            >
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                {reverse ? (ja ? "Apa bahasa Jepangnya?" : "Apa bahasa Inggrisnya?") : c.reps > 0 ? "Ulangi kartu ini" : "Kartu baru"}
              </p>
              <div className="flex items-center justify-center gap-2">
                {reverse || !hasJa(c.text) ? (
                  <p className="text-2xl font-bold">{reverse ? c.meaningId ?? "(tanpa arti)" : c.text}</p>
                ) : (
                  /* JA: kanji + furigana redup di atas, romaji di-balik icon toggle */
                  <JaText text={c.text} reading={c.reading} kanjiClassName="text-teal-700 dark:text-teal-400" className="text-2xl font-bold" />
                )}
                {!reverse ? (
                  <button
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                    title="Cara baca"
                    onClick={(e) => {
                      e.stopPropagation();
                      speak(c.text);
                    }}
                  >
                    <Volume2 className="h-5 w-5" />
                  </button>
                ) : null}
              </div>

              {reveal ? (
                <div className="space-y-3 border-t border-zinc-100 pt-4 text-left dark:border-zinc-800">
                  <div>
                    <p className="label">{reverse ? (ja ? "Jepangnya" : "Inggrisnya") : "Arti"}</p>
                    <p className="text-lg font-medium text-teal-700 dark:text-teal-300">
                      {reverse ? c.text : c.meaningId}
                    </p>
                    {reverse ? (
                      <button
                        className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-teal-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          speak(c.text);
                        }}
                      >
                        <Volume2 className="h-3.5 w-3.5" /> Dengarkan
                      </button>
                    ) : null}
                  </div>
                  {c.notesId ? (
                    <div>
                      <p className="label">Penjelasan</p>
                      {/* matcha: notesId bisa berisi markdown dari Ling (**bold**) — render, jangan mentah. */}
                      <div className="text-sm text-zinc-600 dark:text-zinc-300">
                        <MarkdownLite text={c.notesId} />
                      </div>
                    </div>
                  ) : null}
                  {c.firstEn ? (
                    <div>
                      <p className="label">Contoh</p>
                      {(() => {
                        const jpLine = hasJa(c.firstEn) ? (c.firstEn!.split("\n")[0] ?? c.firstEn!) : c.firstEn!;
                        const romajiLine = hasJa(c.firstEn) && c.firstEn!.includes("\n")
                          ? c.firstEn!.split("\n").slice(1).join(" ")
                          : null;
                        return (
                          <div className="flex items-start gap-2">
                            {hasJa(jpLine) ? (
                              <div className="flex-1">
                                <JaText
                                  text={jpLine}
                                  reading={c.firstKana ?? undefined}
                                  romaji={romajiLine}
                                  kanjiClassName="text-teal-700 dark:text-teal-400"
                                  className="text-sm font-medium"
                                />
                              </div>
                            ) : (
                              <p className="flex-1 whitespace-pre-line text-sm font-medium">{c.firstEn}</p>
                            )}
                            <button
                              className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                              onClick={(e) => {
                                e.stopPropagation();
                                speak(jpLine);
                              }}
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })()}
                      {c.firstId ? <p className="mt-0.5 text-xs text-zinc-500">{c.firstId}</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">Tap kartu buat lihat arti & contoh</p>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400">
          Swipe kiri = masih dipelajari · Swipe kanan = udah tahu
        </p>

        {/* Fallback tombol */}
        <div className="grid grid-cols-4 gap-2">
          <button className="btn-secondary flex-col gap-1 py-2.5 text-xs" onClick={() => void rateCard(1, "Masih dipelajari — bakal muncul lagi")}>
            <XCircle className="h-4 w-4 text-red-500" /> Lupa
            {cards[cardIdx]?.intervals ? (
              <span className="text-[10px] font-normal text-zinc-400">{cards[cardIdx]!.intervals![1]}</span>
            ) : null}
          </button>
          <button className="btn-secondary flex-col gap-1 py-2.5 text-xs" onClick={() => void rateCard(2)}>
            <RotateCcw className="h-4 w-4 text-amber-500" /> Susah
            {cards[cardIdx]?.intervals ? (
              <span className="text-[10px] font-normal text-zinc-400">{cards[cardIdx]!.intervals![2]}</span>
            ) : null}
          </button>
          <button className="btn-secondary flex-col gap-1 py-2.5 text-xs" onClick={() => void rateCard(3)}>
            <CheckCircle2 className="h-4 w-4 text-teal-600" /> Pas
            {cards[cardIdx]?.intervals ? (
              <span className="text-[10px] font-normal text-zinc-400">{cards[cardIdx]!.intervals![3]}</span>
            ) : null}
          </button>
          <button className="btn-secondary flex-col gap-1 py-2.5 text-xs" onClick={() => void knowCard()}>
            <BadgeCheck className="h-4 w-4 text-emerald-600" /> Tahu
            {cards[cardIdx]?.intervals ? (
              <span className="text-[10px] font-normal text-zinc-400">{cards[cardIdx]!.intervals![4]}</span>
            ) : null}
          </button>
        </div>

        {/* Tanya Ling — penjelasan AI langsung di kartu + simpan ke Library (notesId). */}
        <div className="card space-y-2 p-3">
          <button
            className="btn-secondary w-full justify-center gap-1.5 text-sm"
            disabled={askBusy}
            onClick={() => void askLing()}
          >
            {askBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Ling mikir…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Tanya Ling soal kartu ini
              </>
            )}
          </button>
          {askReply ? (
            <div className="space-y-2">
              {/* matcha: reply Ling itu markdown (**bold**, list) — render via MarkdownLite. */}
              <div className="text-zinc-700 dark:text-zinc-200">
                <MarkdownLite text={askReply} />
              </div>
              <button className="btn-primary w-full text-sm" onClick={() => void saveAskToLibrary()}>
                Simpan penjelasan ke Library
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  /* ── Match ── */
  if (screen === "match") {
    const round = matchRounds[matchRound];
    if (!round) {
      return (
        <div className="py-16 text-center">
          <Puzzle className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
          <p className="mt-3 font-medium">Butuh minimal 4 kosakata yang dipelajari</p>
          <p className="mt-1 text-sm text-zinc-500">Simpan kata dulu dari Tambah atau Bank Kata.</p>
          <button className="btn-secondary mt-6" onClick={() => backToPick()}>
            Kembali
          </button>
        </div>
      );
    }
    const totalPairs = matchRounds.reduce((a, r) => a + r.length, 0);
    const donePairs = matchResults.current.length;
    const tileBase =
      "flex min-h-12 cursor-pointer select-none items-start justify-between gap-1.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors";
    return (
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Ronde {matchRound + 1} / {matchRounds.length}
          </span>
          <span className="flex items-center gap-1">
            <button
              className="btn-ghost inline-flex items-center gap-1 text-xs disabled:opacity-40"
              disabled={hintUsed || donePairs >= totalPairs}
              title="Sorot satu pasangan yang benar (1x per ronde)"
              onClick={useHint}
            >
              <Lightbulb className={`h-3.5 w-3.5 ${hintPair !== null ? "text-amber-500" : ""}`} />
              {hintUsed ? "Hint terpakai" : "Hint"}
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={() => backToPick(`Match berhenti — ${donePairs} pasang dimainkan`)}
            >
              Selesai
            </button>
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-teal-600 transition-all dark:bg-teal-500"
            style={{ width: `${(donePairs / Math.max(1, totalPairs)) * 100}%` }}
          />
        </div>

        {/* Layout atas-bawah: kata di atas, arti di bawah — tile lebih lapang daripada
            2 kolom menyamping yang sempit (arti Indonesia sering kepotong). */}
        <div className="grid gap-2 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-2">
            {enOrder.map((pi) => {
              const pair = round[pi];
              const isMatched = matchedIds.has(pair.itemId);
              const isSel = selectedEn === pi;
              const isWrong = wrongPair.en === pi;
              const isHint = pair.itemId === hintPair;
              const cls = isMatched
                ? " border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                : isWrong
                  ? " border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : isHint
                    ? " border-amber-400 bg-amber-50 dark:bg-amber-950/50"
                    : isSel
                      ? " border-teal-500 bg-teal-50/60 dark:bg-teal-950/60"
                      : " border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
              return (
                <div
                  key={pi}
                  className={tileBase + cls}
                  onClick={() => !isMatched && setSelectedEn(isSel ? null : pi)}
                >
                  <span className="min-w-0 flex-1 wrap-break-words text-sm font-medium">{pair.word}</span>
                  <button
                    className="shrink-0 rounded-lg p-1 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-300"
                    title="Dengarkan"
                    onClick={(e) => {
                      e.stopPropagation();
                      speak(pair.word);
                    }}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800/60" />
          <div className="grid grid-cols-2 gap-2">
            {idOrder.map((pi) => {
              const pair = round[pi];
              const isMatched = matchedIds.has(pair.itemId);
              const isWrong = wrongPair.id === pi;
              const isHint = pair.itemId === hintPair;
              const cls = isMatched
                ? " border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                : isWrong
                  ? " border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : isHint
                    ? " border-amber-400 bg-amber-50 dark:bg-amber-950/50"
                    : " border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
              return (
                <div
                  key={pi}
                  className={tileBase + cls}
                  onClick={() => pickMeaning(pi)}
                >
                  <span className="min-w-0 flex-1 wrap-break-words text-sm">{pair.meaning}</span>
                  {isMatched ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" /> : null}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-center text-xs text-zinc-400">
          Tap kata di atas, lalu tap artinya di bawah — salah tidak menghukum, cuma dicatat
        </p>
      </div>
    );
  }

  /* ── Kuis ── */
  if (loadError) {
    return (
      <div className="py-16 text-center">
        <XCircle className="mx-auto h-10 w-10 text-red-500" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Gagal memuat soal</p>
        <p className="mt-1 text-sm text-zinc-500">{loadError}</p>
        <button className="btn-secondary mt-6" onClick={() => load(mode)}>
          Coba lagi
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="py-16 text-center">
        <PartyPopper className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Belum ada soal latihan</p>
        <p className="mt-1 text-sm text-zinc-500">
          Simpan kosakata dulu (Tambah / Bank Kata) — nanti otomatis dibuatkan set latihan.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/bank" className="btn-primary">
            Buka Bank Kata
          </Link>
          <button className="btn-secondary" onClick={() => backToPick()}>
            Kembali
          </button>
        </div>
      </div>
    );
  }

  const pct = Math.round((set!.correct / Math.max(1, total)) * 100);

  // Estimasi level dari akurasi tes periodik: CEFR (EN) / JLPT (JA).
  const cefrOf = (p: number) => (p >= 90 ? "C1" : p >= 80 ? "B2+" : p >= 70 ? "B2" : p >= 60 ? "B1+" : p >= 50 ? "B1" : p >= 35 ? "A2" : "A1");
  const jlptOf = (p: number) => (p >= 90 ? "N2" : p >= 80 ? "N3" : p >= 70 ? "N3-" : p >= 60 ? "N4" : p >= 50 ? "N4-" : "N5");
  const levelOf = ja ? jlptOf : cefrOf;
  const isToefl = set!.mode === "toefl";
  const isBulanan = set!.mode === "bulanan";

  if (finished) {
    return (
      <div className="py-10 text-center">
        <PartyPopper className="mx-auto h-12 w-12 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 text-lg font-bold">
          {set!.title} selesai!{timeUp ? " (waktu habis)" : ""}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Benar {set!.correct} dari {total} soal ({pct}%)
          {answered > 0 && answered < set!.done ? ` · kamu mengerjakan ${answered} soal di sesi ini` : ""}
        </p>
        {isToefl || isBulanan ? (
          <div className="mx-auto mt-4 w-fit rounded-2xl border-2 border-indigo-300 bg-indigo-50 px-6 py-4 dark:border-indigo-800 dark:bg-indigo-950/60">
            <p className="text-xs uppercase tracking-wide text-indigo-500 dark:text-indigo-300">
              Estimasi level
            </p>
            <p className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-200">
              {levelOf(pct)}
            </p>
            <p className="text-[11px] text-indigo-400 dark:text-indigo-300/70">
              {ja ? "N5 pemula → N2 mahir" : "A1 pemula → C1 mahir"} · akurasi {pct}%
            </p>
          </div>
        ) : null}
        <div className="mx-auto mt-4 h-2 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-teal-600 dark:bg-teal-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          Soal yang salah tadi udah dicatat FSRS — bakal muncul lagi di latihan berikutnya.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-primary" onClick={() => backToPick()}>
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

  const isTypingUI =
    mode === "typing" || (q.type === "typing" && mode !== "scramble" && mode !== "dikte" && mode !== "shadow");
  const isScrambleUI = mode === "scramble";
  const isDikteUI = mode === "dikte";
  const isShadowUI = mode === "shadow";
  const meta = TYPE_META[isScrambleUI || isDikteUI || isShadowUI ? "typing" : q.type];
  const metaLabel =
    ja && (isScrambleUI || isDikteUI || isShadowUI || q.type === "typing")
      ? mode === "dikte"
        ? "Dengarkan lalu ketik bahasa Jepangnya"
        : mode === "shadow"
          ? "Dengarkan lalu ikuti ucapkan"
          : "Ketik bahasa Jepangnya"
      : isDikteUI
        ? "Dengarkan lalu ketik"
        : isShadowUI
          ? "Dengarkan lalu ikuti"
          : mode === "pola"
            ? ja
              ? "Isi partikel yang tepat"
              : "Isi kata yang tepat"
            : meta.label;
  const spokenEn = q.options[Number(q.answer)]; // teks EN untuk TTS (listen/audio)
  // JP: token per-kata dari segmentasi AI (partikel sendiri); EN: split spasi.
  const scrambleWords = q.tokens && q.tokens.length >= 2 ? q.tokens : (q.answer ?? "").split(/\s+/).filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{set.title}</span>
          <span className="flex items-center gap-2">
            {timeLeft !== null && !finished ? (
              <span
                className={`rounded-lg px-2 py-0.5 font-bold tabular-nums ${
                  timeLeft < 120
                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                    : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                }`}
              >
                {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
              </span>
            ) : null}
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
                history.map((h, hi) => (
                  <li
                    key={`${h.day}-${h.title}-${hi}`}
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
          <meta.icon className="h-3.5 w-3.5" /> {metaLabel}
        </span>

        {isTypingUI || isDikteUI ? (
          <>
            <p className="mt-3 text-center text-xl font-semibold">{q.prompt}</p>
            {isDikteUI ? (
              <div className="mt-2 flex justify-center">
                <SpeakButton
                  text={q.answer}
                  className="h-5 w-5"
                  buttonClassName="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow active:scale-95"
                >
                  Putar ulang
                </SpeakButton>
              </div>
            ) : null}
            <p className="mt-1 text-center text-[11px] text-zinc-400">
              {isDikteUI
                ? "Dengarkan baik-baik lalu ketik tepat seperti yang dibunyikan"
                : ja
                  ? "Ketik bahasa Jepangnya dari arti di atas"
                  : "Ketik bahasa Inggrisnya dari arti di atas"}
            </p>
            <input
              className="input-area mt-4 text-center text-lg"
              placeholder={ja ? "Ketik bahasa Jepangnya…" : "Ketik bahasa Inggrisnya…"}
              value={typed}
              autoFocus
              disabled={typedResult !== null}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitAnswerText(typed);
              }}
            />
            {typedResult ? (
              <p
                className={`mt-2 text-center text-sm font-medium ${
                  typedResult.ok ? "text-teal-700 dark:text-teal-300" : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {typedResult.ok ? "Tepat!" : `Jawaban: ${q.answer}`}
              </p>
            ) : null}
            {typedResult ? null : (
              <button
                className="btn-primary mt-3 w-full"
                onClick={() => submitAnswerText(typed)}
                disabled={!typed.trim()}
              >
                Periksa
              </button>
            )}
          </>
        ) : isScrambleUI ? (
          <>
            <p className="mt-3 text-center text-xl font-semibold">{q.prompt}</p>
            {/* Baris susunan */}
            <div className="mt-4 flex min-h-14 flex-wrap items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 p-2 dark:border-zinc-700">
              {pickedWords.length === 0 ? (
                <span className="text-xs text-zinc-400">Tap kata di bawah buat menyusun</span>
              ) : (
                pickedWords.map((wi, pos2) => (
                  <button
                    key={`${wi}-${pos2}`}
                    className="rounded-lg bg-teal-100 px-2.5 py-1.5 text-sm font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                    disabled={typedResult !== null}
                    onClick={() =>
                      setPickedWords((w) => w.filter((_, p) => p !== pos2))
                    }
                  >
                    {hasJa(scrambleWords[wi] ?? "") ? (
                      <JaText
                        text={scrambleWords[wi]!}
                        kanjiClassName="text-teal-700 dark:text-teal-400"
                        romajiToggle={false}
                      />
                    ) : (
                      scrambleWords[wi]
                    )}
                  </button>
                ))
              )}
            </div>
            {/* Pool kata acak */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {scrambleOrder.map((wi) =>
                pickedWords.includes(wi) ? null : (
                  <button
                    key={wi}
                    className="btn-secondary px-3 py-1.5 text-sm"
                    disabled={typedResult !== null}
                    onClick={() => setPickedWords((w) => [...w, wi])}
                  >
                    {hasJa(scrambleWords[wi] ?? "") ? (
                      <JaText
                        text={scrambleWords[wi]!}
                        kanjiClassName="text-teal-700 dark:text-teal-400"
                        romajiToggle={false}
                      />
                    ) : (
                      scrambleWords[wi]
                    )}
                  </button>
                ),
              )}
            </div>
            {typedResult ? (
              <p
                className={`mt-3 text-center text-sm font-medium ${
                  typedResult.ok ? "text-teal-700 dark:text-teal-300" : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {typedResult.ok ? "Tepat!" : `Jawaban: ${q.answer}`}
              </p>
            ) : (
              <button
                className="btn-primary mt-3 w-full"
                disabled={pickedWords.length === 0}
                onClick={() => submitAnswerText(pickedWords.map((wi) => scrambleWords[wi]).join(" "))}
              >
                Periksa
              </button>
            )}
          </>
        ) : isShadowUI ? (
          <>
            {/* Shadowing: dengarkan + ikuti ucapkan — tanpa dinilai benar/salah,
                yang dihitung partisipasi (1 rep = 1 selesai). */}
            {hasJa(q.answer) ? (
              <div className="mt-3 text-center">
                <JaText
                  text={q.answer}
                  reading={q.reading ?? undefined}
                  kanjiClassName="text-teal-700 dark:text-teal-400"
                  className="text-2xl font-bold"
                />
              </div>
            ) : (
              <p className="mt-3 text-center text-2xl font-bold">{q.answer}</p>
            )}
            {q.meaningId ? (
              <p className="mt-1 text-center text-sm text-zinc-500">{q.meaningId}</p>
            ) : null}
            <div className="mt-4 flex justify-center">
              <SpeakButton
                text={q.answer}
                className="h-7 w-7"
                buttonClassName="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 active:scale-95"
              />
            </div>
            <p className="mt-2 text-center text-xs text-zinc-400">
              Ucapkan mengikuti audio (0,5 detik di belakangnya) — 3x per kalimat biar nempel
            </p>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-secondary flex-1 justify-center gap-1.5"
                disabled={micBusy}
                onClick={() => scoreMic(q.answer, ja)}
              >
                {micBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Mendengarkan…
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> Nilai ucapanku
                  </>
                )}
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  setMicResult(null);
                  answer(true);
                  next();
                }}
              >
                Sudah latih — lanjut
              </button>
            </div>
            {micResult ? (
              <p
                className={`mt-2 text-center text-sm font-medium ${
                  micResult.score >= 70
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-amber-700 dark:text-amber-300"
                }`}
              >
                {micResult.score >= 70
                  ? `Bagus! ${micResult.score}% mirip target`
                  : `Terdengar: “${micResult.heard || "—"}” (${micResult.score}%) — coba lagi`}
              </p>
            ) : null}
          </>
        ) : q.type === "listen" ? (
          <>
            <div className="mt-4 flex flex-col items-center gap-2">
              <SpeakButton
                text={spokenEn}
                className="h-7 w-7"
                buttonClassName="flex h-16 w-16 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/30 active:scale-95 disabled:opacity-90"
              />
              <SpeakButton
                text={spokenEn}
                className="h-3.5 w-3.5"
                hideIcon
                buttonClassName="inline-flex items-center gap-1 text-xs text-zinc-400 underline-offset-2 hover:underline"
              >
                Dengarkan lagi
              </SpeakButton>
            </div>
            <p className="mt-2 text-center text-xs text-zinc-400">pilih frasa EN yang cocok</p>
          </>
        ) : q.type === "mcq_en_id" ? (
          hasJa(q.prompt) ? (
            <p className="mt-3 text-center text-2xl font-bold">
              <JaText
                text={q.prompt}
                reading={q.reading ?? undefined}
                kanjiClassName="text-teal-700 dark:text-teal-400"
                romajiToggle={false}
              />
            </p>
          ) : (
            <p className="mt-3 text-center text-2xl font-bold">{q.prompt}</p>
          )
        ) : q.type === "mcq_id_en" ? (
          <p className="mt-3 text-center text-xl font-semibold">{q.prompt}</p>
        ) : q.type === "cloze" ? (
          <>
            <div className="mt-3 text-center text-lg leading-relaxed">
              {hasJa(q.prompt) ? (
                <JaText
                  text={q.prompt}
                  kanjiClassName="text-teal-700 dark:text-teal-400"
                  romajiToggle={false}
                />
              ) : (
                q.prompt
              )}
            </div>
            {/* Pola: kasih arti sebagai petunjuk biar jelas partikel mana yang pas. */}
            {mode === "pola" && q.meaningId ? (
              <p className="mt-1 text-center text-xs text-zinc-400">Artinya: {q.meaningId}</p>
            ) : null}
          </>
        ) : null}
      </div>

      {!isTypingUI && !isScrambleUI ? (
        <OptionList options={q.options} answer={q.answer} picked={picked} onPick={pick} readings={q.optionReadings} />
      ) : null}

      {picked !== null && !isTypingUI && !isScrambleUI ? (
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

      {(isTypingUI || isScrambleUI) && typedResult ? (
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

      {!isTypingUI && !isScrambleUI ? (
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

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, redirect, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Eye,
  Layers,
  Loader2,
  PencilLine,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { wordbank } from "~/lib/db/schema";
import { getTargetLang } from "~/lib/lang.server";
import { and, eq, ne } from "drizzle-orm";
import { ttsLang } from "~/lib/utils.shared";
import { JaText, hasJa, splitReading } from "~/components/JaText";
import { SpeakButton } from "~/components/SpeakButton";

export const meta: MetaFunction = () => [{ title: "Aksara Jepang — LingStick" }];
export const handle = { title: "Aksara Jepang" };

function speak(s: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(s);
  u.lang = lang ?? ttsLang(s);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/* ── Tabel kana BERBASIS BARIS gojūon (5 kolom bunyi a-i-u-e-o).
 * Sel kosong (yi/ye/wi/wu/we, plus yi/ye di baris ya) dirender sebagai
 * placeholder biar posisi ya-yu-yo & wa-wo-n tetap sesuai tabel standar —
 * bukan dijejalkan ke kiri. matcha: flat list bikin baris ya/wa berantakan. */
type KanaCellData = [string, string] | null;
type KanaRow = [KanaCellData, KanaCellData, KanaCellData, KanaCellData, KanaCellData];

function kanaRows(base: [string, string][][]): KanaRow[] {
  // base: 10 baris gojūon penuh (5 kolom) + [ya-row 3 sel] + ra-row + [wa,wo,n] + 5 baris dakuten.
  const [a, k, s, t, n, h, m, y, r, wwn, g, z, d, b, p] = base;
  const full = (row: [string, string][]): KanaRow => [row[0]!, row[1]!, row[2]!, row[3]!, row[4]!];
  const [ya, yu, yo] = y as [[string, string], [string, string], [string, string]];
  const [wa, wo, nn] = wwn as [[string, string], [string, string], [string, string]];
  return [
    full(a), full(k), full(s), full(t), full(n), full(h), full(m),
    [ya, null, yu, null, yo], // ya (kiri) — yu (tengah) — yo (kanan)
    full(r),
    [wa, null, null, null, wo], // wa (kiri) — wo (kanan pojok)
    [nn, null, null, null, null], // ん sendiri di bawah wa
    full(g), full(z), full(d), full(b), full(p),
  ];
}

const HIRAGANA: [string, string][][] = [
  [["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"]],
  [["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"]],
  [["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"]],
  [["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"]],
  [["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"]],
  [["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"]],
  [["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"]],
  [["や", "ya"], ["ゆ", "yu"], ["よ", "yo"]],
  [["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"]],
  [["わ", "wa"], ["を", "wo"], ["ん", "n"]],
  [["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"]],
  [["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"]],
  [["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"]],
  [["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"]],
  [["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"]],
];
const KATAKANA: [string, string][][] = [
  [["ア", "a"], ["イ", "i"], ["ウ", "u"], ["エ", "e"], ["オ", "o"]],
  [["カ", "ka"], ["キ", "ki"], ["ク", "ku"], ["ケ", "ke"], ["コ", "ko"]],
  [["サ", "sa"], ["シ", "shi"], ["ス", "su"], ["セ", "se"], ["ソ", "so"]],
  [["タ", "ta"], ["チ", "chi"], ["ツ", "tsu"], ["テ", "te"], ["ト", "to"]],
  [["ナ", "na"], ["ニ", "ni"], ["ヌ", "nu"], ["ネ", "ne"], ["ノ", "no"]],
  [["ハ", "ha"], ["ヒ", "hi"], ["フ", "fu"], ["ヘ", "he"], ["ホ", "ho"]],
  [["マ", "ma"], ["ミ", "mi"], ["ム", "mu"], ["メ", "me"], ["モ", "mo"]],
  [["ヤ", "ya"], ["ユ", "yu"], ["ヨ", "yo"]],
  [["ラ", "ra"], ["リ", "ri"], ["ル", "ru"], ["レ", "re"], ["ロ", "ro"]],
  [["ワ", "wa"], ["ヲ", "wo"], ["ン", "n"]],
  [["ガ", "ga"], ["ギ", "gi"], ["グ", "gu"], ["ゲ", "ge"], ["ゴ", "go"]],
  [["ザ", "za"], ["ジ", "ji"], ["ズ", "zu"], ["ゼ", "ze"], ["ゾ", "zo"]],
  [["ダ", "da"], ["ヂ", "ji"], ["ヅ", "zu"], ["デ", "de"], ["ド", "do"]],
  [["バ", "ba"], ["ビ", "bi"], ["ブ", "bu"], ["ベ", "be"], ["ボ", "bo"]],
  [["パ", "pa"], ["ピ", "pi"], ["プ", "pu"], ["ペ", "pe"], ["ポ", "po"]],
];
const KANA_TABLES: Record<"hiragana" | "katakana", KanaRow[]> = {
  hiragana: kanaRows(HIRAGANA),
  katakana: kanaRows(KATAKANA),
};

/** Section kana per BARIS: 0–10 gojūon (a s/d ん), 11–15 dakuten/handakuten. */
const KANA_SECTIONS: { label: string; desc: string; slice: [number, number] }[] = [
  {
    label: "Gojūon — dasar",
    desc: "46 kana asli: 5 kolom bunyi (a-i-u-e-o) × baris konsonan + ん",
    slice: [0, 11],
  },
  {
    label: "Dakuten & handakuten",
    desc: "Tanda ゛ bikin bersuara (か→が), ゜ bikin semi-bersuara (は→ぱ)",
    slice: [11, 16],
  },
];

/* ── Yōon (拗音): i-kolom + ゃゅょ kecil = 1 ketuk (き+ゃ=きゃ kya).
 * Sumber: tabel yōon standar (Wikipedia/Embassy chart): 11 baris × 3 = 33.
 * Baris ぢゃ jarang dipakai modern → tidak dimasukkan. */
const YOON_HIRA: [string, string][][] = [
  [["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"]],
  [["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"]],
  [["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"]],
  [["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"]],
  [["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"]],
  [["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"]],
  [["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"]],
  [["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"]],
  [["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"]],
  [["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"]],
  [["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"]],
];
const YOON_KATA: [string, string][][] = [
  [["キャ", "kya"], ["キュ", "kyu"], ["キョ", "kyo"]],
  [["シャ", "sha"], ["シュ", "shu"], ["ショ", "sho"]],
  [["チャ", "cha"], ["チュ", "chu"], ["チョ", "cho"]],
  [["ニャ", "nya"], ["ニュ", "nyu"], ["ニョ", "nyo"]],
  [["ヒャ", "hya"], ["ヒュ", "hyu"], ["ヒョ", "hyo"]],
  [["ミャ", "mya"], ["ミュ", "myu"], ["ミョ", "myo"]],
  [["リャ", "rya"], ["リュ", "ryu"], ["リョ", "ryo"]],
  [["ギャ", "gya"], ["ギュ", "gyu"], ["ギョ", "gyo"]],
  [["ジャ", "ja"], ["ジュ", "ju"], ["ジョ", "jo"]],
  [["ビャ", "bya"], ["ビュ", "byu"], ["ビョ", "byo"]],
  [["ピャ", "pya"], ["ピュ", "pyu"], ["ピョ", "pyo"]],
];

/* ── Gairaigo (katakana saja): bunyi serapan buat kata asing — kana besar +
 * vokal kecil (ファ fa, ティ ti, ウィ wi…). Kurasi umum (ToKini/Keiko chart);
 * ヴ baris untuk bunyi V. Hiragana hampir tidak memakai ini. */
const GAIRAIGO: [string, string][] = [
  ["ヴァ", "va"], ["ヴィ", "vi"], ["ヴ", "vu"], ["ヴェ", "ve"], ["ヴォ", "vo"],
  ["ウィ", "wi"], ["ウェ", "we"], ["ウォ", "wo"],
  ["シェ", "she"], ["ジェ", "je"], ["チェ", "che"],
  ["ティ", "ti"], ["トゥ", "tu"], ["ディ", "di"],
  ["ファ", "fa"], ["フィ", "fi"], ["フェ", "fe"], ["フォ", "fo"],
  ["ツァ", "tsa"],
];

const SCRIPTS = ["hiragana", "katakana", "kanji"] as const;
type Script = (typeof SCRIPTS)[number];
const SCRIPT_LABEL: Record<Script, string> = {
  hiragana: "Hiragana",
  katakana: "Katakana",
  kanji: "Kanji",
};
const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

const KANJI_RE = /[\u4e00-\u9faf\u3005\u3007]/;

type AksaraWord = {
  id: number;
  text: string;
  reading: string | null;
  meaningId: string | null;
  status: string; // new | learning | known (dari wordbank)
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang();
  if (lang !== "ja") throw redirect("/"); // halaman khusus mode Jepang

  const url = new URL(request.url);
  const scriptParam = url.searchParams.get("script");
  const script: Script = (SCRIPTS as readonly string[]).includes(scriptParam ?? "")
    ? (scriptParam as Script)
    : "hiragana";
  const levelParam = url.searchParams.get("level");
  const level = (LEVELS as readonly string[]).includes(levelParam ?? "") ? levelParam! : "N5";

  // Kanji words per level (buat list & target latihan) + pool lintas level (distraktor MCQ).
  const rows = await db
    .select({ id: wordbank.id, text: wordbank.text, reading: wordbank.reading, meaningId: wordbank.meaningId, cefr: wordbank.cefr, status: wordbank.status })
    .from(wordbank)
    .where(and(eq(wordbank.lang, "ja"), ne(wordbank.type, "kana")))
    .limit(500);
  const hasKanji = (r: { text: string; meaningId: string | null }) => KANJI_RE.test(r.text) && Boolean(r.meaningId);
  const levelRows = rows.filter((r) => hasKanji(r) && r.cefr === level);
  const poolRows = rows.filter(hasKanji);

  return {
    script,
    level,
    levelWords: levelRows.slice(0, 100) as AksaraWord[],
    poolWords: poolRows.slice(0, 300) as AksaraWord[],
  };
}

/** Tombol tandai di daftar kanji: mulai belajar / hafal — row wordbank TETAP ada (cuma ganti status). */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  if ((await getTargetLang()) !== "ja") {
    return Response.json({ error: "Khusus mode Jepang" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { id?: number; action?: string };
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "id nggak valid" }, { status: 400 });
  }
  const { learnBankKeep, markBankKnownKeep } = await import("~/lib/bank.server");
  if (body.action === "learn") {
    const itemId = await learnBankKeep(id);
    return Response.json({ ok: true, itemId });
  }
  if (body.action === "known") {
    await markBankKnownKeep(id);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "action nggak dikenal" }, { status: 400 });
}

/* ── Generate kanji per N-level — reuse /api/bank (generateBankWords JA) ── */
function GenKanjiButton({ level }: { level: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", level, count: 10 }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; added?: number; skipped?: number };
      if (!r.ok || d.error) throw new Error(d.error || "Generate gagal");
      setMsg(`${d.added ?? 0} kanji baru level ${level} ditambahkan`);
      setBusy(false);
      window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Generate gagal");
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={generate}
        disabled={busy}
        className="btn-secondary w-full justify-center gap-1.5 py-2.5 text-sm"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Lagi generate…" : `Generate ${level} via AI`}
      </button>
      {msg ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{msg}</span> : null}
    </div>
  );
}

/* ── Latihan kanji: pilihan ganda (bacaan / arti) ── */
type Method = "list" | "reading" | "arti";
type Mcq = { word: AksaraWord; options: string[]; answer: number };

function buildMcqs(words: AksaraWord[], pool: AksaraWord[], method: "reading" | "arti"): Mcq[] {
  const keyOf = (w: AksaraWord) =>
    method === "reading" ? splitReading(w.reading).kana || w.reading || "" : w.meaningId ?? "";
  const src = words.length >= 4 ? words : pool;
  if (src.length < 4) return [];
  const bag = [...src].sort(() => Math.random() - 0.5);
  const qs: Mcq[] = [];
  for (const w of bag) {
    if (qs.length >= 10) break;
    const correct = keyOf(w);
    if (!correct) continue;
    const dis = [...new Set(pool.filter((o) => o.id !== w.id).map(keyOf))]
      .filter((v) => v && v !== correct)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    if (dis.length < 3) continue;
    const options = [correct, ...dis].sort(() => Math.random() - 0.5);
    qs.push({ word: w, options, answer: options.indexOf(correct) });
  }
  return qs;
}

function KanjiPractice({
  words,
  pool,
  level,
  statusOf,
  onMark,
  emptyHint,
}: {
  words: AksaraWord[];
  pool: AksaraWord[];
  level: string;
  statusOf: (w: AksaraWord) => string;
  onMark: (id: number, action: "learn" | "known") => void;
  emptyHint?: string;
}) {
  const [method, setMethod] = useState<Method>("list");
  const [mcqs, setMcqs] = useState<Mcq[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [showKey, setShowKey] = useState(false); // bantuan baca di mode list

  useEffect(() => {
    if (method === "list") {
      setMcqs([]);
      return;
    }
    setMcqs(buildMcqs(words, pool, method));
    setQi(0);
    setPicked(null);
    setScore(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, level]);

  const q = mcqs[qi];
  const done = Boolean(mcqs.length) && qi >= mcqs.length;

  if (method === "list") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">
            {words.length > 0 ? `${words.length} kosakata kanji level ${level}` : `Belum ada kanji level ${level}`}
          </p>
          <button className="btn-ghost inline-flex items-center gap-1 text-xs" onClick={() => setShowKey((v) => !v)}>
            <Eye className="h-3.5 w-3.5" /> {showKey ? "Sembunyikan bacaan" : "Tampilkan bacaan"}
          </button>
        </div>
        {words.length === 0 ? (
          <div className="py-10 text-center">
            <Layers className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
            <p className="mt-3 font-medium">Belum ada kosakata kanji di level ini</p>
            <p className="mt-1 text-sm text-zinc-500">
              {emptyHint ?? `Generate kata di Bank Kata level ${level} — nanti otomatis nongol di sini.`}
            </p>
            <Link to="/bank" className="btn-secondary mt-4 inline-flex">
              Buka Bank Kata <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {words.map((w) => (
              <li key={w.id} className="card flex items-center gap-3 p-3.5">
                <span className="min-w-0 flex-1">
                  <JaText text={w.text} reading={w.reading} kanjiClassName="text-teal-700 dark:text-teal-400" className="text-xl font-semibold" />
                  {showKey && w.reading ? (
                    <span className="mt-0.5 block text-xs text-zinc-400 dark:text-zinc-500">{w.reading}</span>
                  ) : null}
                  <span className="block truncate text-xs text-zinc-500">{w.meaningId}</span>
                </span>
                {/* Tandai status: new→belajar (BookOpenCheck), learning→hafal (CheckCircle2), known→balikin (BadgeCheck) */}
                {statusOf(w) === "known" ? (
                  <button
                    className="shrink-0 rounded-lg p-1.5 text-teal-600 dark:text-teal-400"
                    title="Sudah hafal — klik buat belajar lagi"
                    onClick={() => onMark(w.id, "learn")}
                  >
                    <BadgeCheck className="h-4.5 w-4.5" />
                  </button>
                ) : statusOf(w) === "learning" ? (
                  <button
                    className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                    title="Tandai hafal"
                    onClick={() => onMark(w.id, "known")}
                  >
                    <CheckCircle2 className="h-4.5 w-4.5" />
                  </button>
                ) : (
                  <button
                    className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                    title="Mulai belajar (masuk review)"
                    onClick={() => onMark(w.id, "learn")}
                  >
                    <BookOpenCheck className="h-4.5 w-4.5" />
                  </button>
                )}
                <SpeakButton
                  text={w.text}
                  className="h-4.5 w-4.5"
                  buttonClassName="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                />
                <Link
                  to={`/write?level=${level}`}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                  title="Latihan nulis"
                >
                  <PencilLine className="h-4.5 w-4.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (mcqs.length === 0) {
    return (
      <div className="py-10 text-center">
        <BookOpenCheck className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Kosakata belum cukup buat latihan</p>
        <p className="mt-1 text-sm text-zinc-500">Minimal 4 kosakata kanji — tambah dari Bank Kata dulu ya.</p>
        <button className="btn-secondary mt-4" onClick={() => setMethod("list")}>
          Kembali ke daftar
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="py-10 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 text-lg font-bold">Selesai!</p>
        <p className="mt-1 text-sm text-zinc-500">
          Benar {score} dari {mcqs.length} soal ({Math.round((score / mcqs.length) * 100)}%)
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            className="btn-secondary"
            onClick={() => {
              setMcqs(buildMcqs(words, pool, method));
              setQi(0);
              setPicked(null);
              setScore(0);
            }}
          >
            <RotateCcw className="h-4 w-4" /> Ulangi
          </button>
          <button className="btn-primary" onClick={() => setMethod("list")}>
            Daftar kanji
          </button>
        </div>
      </div>
    );
  }

  const isReading = method === "reading";
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Soal {qi + 1} / {mcqs.length} · benar {score}
        </span>
        <button className="btn-ghost text-xs" onClick={() => setMethod("list")}>
          Keluar
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-teal-600 transition-all dark:bg-teal-500"
          style={{ width: `${(qi / mcqs.length) * 100}%` }}
        />
      </div>

      <div className="card flex min-h-24 flex-col items-center justify-center gap-1 py-6">
        {isReading ? (
          /* Pilih bacaan: kanji TANPA furigana — itu latihannya */
          <p className="text-4xl font-bold">{q.word.text}</p>
        ) : (
          <JaText text={q.word.text} reading={q.word.reading} kanjiClassName="text-teal-700 dark:text-teal-400" className="text-4xl font-bold" />
        )}
        <p className="mt-1 text-xs text-zinc-400">
          {isReading ? "Pilih cara baca yang tepat" : "Pilih arti yang tepat"}
        </p>
      </div>

      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = picked === i;
          let cls = "btn-secondary w-full justify-start text-left";
          if (picked !== null) {
            if (isAnswer) cls += " !border-teal-500 !bg-teal-50 !text-teal-800 dark:!bg-teal-950 dark:!text-teal-300";
            else if (isPicked) cls += " !border-red-300 !bg-red-50 !text-red-700 dark:!bg-red-950 dark:!text-red-300";
            else cls += " opacity-50";
          }
          return (
            <button
              key={i}
              className={cls}
              disabled={picked !== null}
              onClick={() => {
                if (picked !== null) return;
                setPicked(i);
                if (i === q.answer) setScore((s) => s + 1);
                if (isReading) speak(q.word.text);
              }}
            >
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

      {picked !== null ? (
        <div className="space-y-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              picked === q.answer
                ? "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {picked === q.answer ? (
              <span className="font-medium">Benar!</span>
            ) : (
              <span>
                Jawaban yang tepat: <strong>{q.options[q.answer]}</strong>
              </span>
            )}
            {q.word.meaningId ? (
              <span className="block text-xs opacity-80">
                {q.word.text} — {q.word.meaningId}
              </span>
            ) : null}
          </div>
          <button
            className="btn-primary w-full"
            onClick={() => {
              setQi((i) => i + 1);
              setPicked(null);
            }}
          >
            Lanjut <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Sel grid kana: klik = bunyi. Saat bunyi, romaji keganti spinner (anti-spam + feedback). */
function KanaCell({ kana, romaji }: { kana: string; romaji: string }) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const click = () => {
    if (busy) return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(kana);
    u.lang = "ja-JP";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer.current) clearTimeout(timer.current);
      setBusy(false);
    };
    u.onend = finish;
    u.onerror = finish;
    timer.current = setTimeout(finish, 10_000); // kana pendek — safety 10s
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setBusy(true);
  };

  return (
    <button
      onClick={click}
      aria-busy={busy}
      className="flex flex-col items-center gap-0.5 rounded-xl border border-zinc-200 bg-white py-2.5 transition-colors hover:border-teal-300 active:bg-teal-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800 dark:active:bg-teal-950/60"
    >
      <span className="text-xl font-semibold">{kana}</span>
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin text-teal-600 dark:text-teal-400" />
      ) : (
        <span className="text-[10px] text-zinc-400">{romaji}</span>
      )}
    </button>
  );
}

export default function AksaraPage() {
  const { script, level, levelWords, poolWords } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();

  const go = (next: { script?: Script; level?: string }) => {
    const p = new URLSearchParams(params);
    if (next.script) p.set("script", next.script);
    if (next.level) p.set("level", next.level);
    setParams(p, { preventScrollReset: true });
  };

  // Filter status client-side — default "learning" (Sedang dipelajari), snapshot loader, no refetch.
  const [statusFilter, setStatusFilter] = useState<"all" | "learning" | "known">("learning");
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  const statusOf = (w: AksaraWord) => overrides[w.id] ?? w.status;
  const filteredWords = levelWords.filter((w) => {
    if (statusFilter === "all") return true;
    return statusOf(w) === statusFilter;
  });

  /** Tandai dari daftar kanji: optimistic update + POST ke action route ini. */
  const mark = (id: number, act: "learn" | "known") => {
    setOverrides((prev) => ({ ...prev, [id]: act === "learn" ? "learning" : "known" }));
    void fetch("/aksara", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: act }),
    }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      {/* Tab aksara */}
      <div className="grid grid-cols-3 gap-1.5">
        {SCRIPTS.map((s) => (
          <button
            key={s}
            onClick={() => go({ script: s })}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
              script === s
                ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
            }`}
          >
            {SCRIPT_LABEL[s]}
          </button>
        ))}
      </div>

      {script !== "kanji" ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            Tap karakternya buat dengar cara bacanya — belajar 5 kolom per baris (gojūon), lanjut
            dakuten/handakuten di bawah.
          </p>
          {KANA_SECTIONS.map((sec, si) => {
            const rows = KANA_TABLES[script].slice(sec.slice[0], sec.slice[1]);
            if (rows.length === 0) return null;
            return (
              <div key={sec.label} className={si > 0 ? "pt-3" : ""}>
                <p className="mb-1.5 text-sm font-semibold">{sec.label}</p>
                <p className="mb-2.5 text-xs text-zinc-400">{sec.desc}</p>
                <div className="space-y-1.5">
                  {rows.map((row, ri) => (
                    <div key={ri} className="grid grid-cols-5 gap-1.5">
                      {row.map((cell, ci) =>
                        cell ? (
                          <KanaCell key={cell[0]} kana={cell[0]} romaji={cell[1]} />
                        ) : (
                          <div
                            key={`empty-${ci}`}
                            aria-hidden
                            className="rounded-xl border border-dashed border-zinc-200 py-2.5 dark:border-zinc-800/60"
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Yōon — bunyi gabungan i-kolom + ゃゅょ kecil (1 ketuk) */}
          <div className="pt-3">
            <p className="mb-1.5 text-sm font-semibold">Yōon — bunyi gabungan</p>
            <p className="mb-2.5 text-xs text-zinc-400">
              {script === "hiragana"
                ? "き + ゃ kecil = きゃ (kya) — satu ketuk, bukan dua (きや beda!)"
                : "キ + ャ kecil = キャ (kya) — mis. シャワー (shawaa, shower)"}
            </p>
            <div className="space-y-1.5">
              {(script === "hiragana" ? YOON_HIRA : YOON_KATA).map((row, ri) => (
                <div key={ri} className="grid grid-cols-3 gap-1.5">
                  {row.map(([kana, romaji]) => (
                    <KanaCell key={kana} kana={kana} romaji={romaji} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Gairaigo — khusus katakana: bunyi serapan kata asing */}
          {script === "katakana" ? (
            <div className="pt-3">
              <p className="mb-1.5 text-sm font-semibold">Gairaigo — bunyi serapan</p>
              <p className="mb-2.5 text-xs text-zinc-400">
                Vokal kecil bikin bunyi asing: ファ (fa), ティ (ti), ウィ (wi) — mis. フィットネス (fitnesu, fitness)
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {GAIRAIGO.map(([kana, romaji]) => (
                  <KanaCell key={kana} kana={kana} romaji={romaji} />
                ))}
              </div>
            </div>
          ) : null}

          {/* Sokuon — っ/ッ kecil: gandakan konsonan sesudahnya */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-sm font-semibold">
              Sokuon — {script === "hiragana" ? "っ" : "ッ"} kecil pengganda
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {script === "hiragana"
                ? "っ menahan napas seketuk: かた (kata) vs かった (katta). Tap buat dengar bedanya."
                : "ッ menahan napas seketuk: オト (oto, bunyi) vs オット (otto, suami). Tap buat dengar bedanya."}
            </p>
            <div className="mt-2.5 flex gap-1.5">
              {(script === "hiragana" ? ["おと", "おっと"] : ["オト", "オット"]).map((w) => (
                <button
                  key={w}
                  onClick={() => speak(w, "ja-JP")}
                  className="btn-secondary flex-1 justify-center gap-1.5 text-sm"
                >
                  <Volume2 className="h-4 w-4" /> {w}
                </button>
              ))}
            </div>
          </div>
          <p className="pt-1 text-center text-xs text-zinc-400">
            {script === "hiragana"
              ? "Hiragana = bunyi asli bahasa Jepang: partikel & infleksi selalu pakai ini."
              : "Katakana = kata serapan asing & onomatope, mis. コーヒー (koohii)."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Level kanji N5–N1 — full width rapi */}
          <div className="grid w-full grid-cols-5 gap-1.5">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => go({ level: l })}
                className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  level === l
                    ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                    : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Generate kanji per level N — via Bank Kata (sumber sama: wordbank + LLM) */}
          <div className="w-full rounded-2xl border border-dashed border-teal-300 bg-teal-50/50 p-4 text-center dark:border-teal-800 dark:bg-teal-950/30">
            <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
              Kurang kosakata {level}?
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Generate langsung ke level ini via AI — otomatis masuk list & latihan.
            </p>
            <div className="mt-3">
              <GenKanjiButton level={level} />
            </div>
          </div>

          {/* Filter status full-width: Sedang belajar + Hafal di tengah, Semua di kanan */}
          <div className="grid w-full grid-cols-3 gap-1.5">
            {(
              [
                ["learning", "Sedang belajar"],
                ["known", "Hafal"],
                ["all", "Semua"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`chip w-full justify-center ${statusFilter === key ? "chip-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          <KanjiPractice
            key={level}
            words={filteredWords}
            pool={poolWords}
            level={level}
            statusOf={statusOf}
            onMark={mark}
            emptyHint={
              statusFilter !== "all" && levelWords.length > 0
                ? statusFilter === "known"
                  ? "Belum ada yang ditandai hafal — tandai lewat icon centang di daftar."
                  : "Belum ada yang sedang belajar — tandai lewat icon buku di daftar."
                : undefined
            }
          />

          <p className="text-center text-xs text-zinc-400">
            Latihan nulis kanji ada di{" "}
            <Link to={`/write?level=${level}`} className="font-medium text-teal-700 underline underline-offset-2 dark:text-teal-400">
              /write?level={level}
            </Link>{" "}
            — coret di canvas dengan panduan samar.
          </p>
        </div>
      )}
    </div>
  );
}

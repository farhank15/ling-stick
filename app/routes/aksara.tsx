import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, redirect, useLoaderData, useSearchParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  Eye,
  Loader2,
  RotateCcw,
  Volume2,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { ttsLang } from "~/lib/utils.shared";
import { SpeakButton } from "~/components/SpeakButton";
import kanaConfusables from "../../data/kana-confusables.json";

type ConfusableGroup = {
  id: string;
  script: string;
  members: string[];
  rule: string;
  mnemonic: string;
};

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

  // Referensi kanji kanonis (seed dataset) + progres flashcard — khusus tab kanji.
  // Daftar kosakata wordbank lama sudah dihapus (dobel dengan sistem baru).
  let kanjiList: { char: string; meaningId: string; strokes: number; jlpt: number | null; freq: number | null; components: string[] }[] = [];
  let kanjiComponents: { component: string; count: number }[] = [];
  let kanjiProgress: { total: number; done: number } | null = null;
  if (script === "kanji") {
    const jlptNum = Number(level.slice(1)) || 5;
    const { listKanji, listComponents, getKanjiProgress } = await import("~/lib/kanji.server");
    [kanjiList, kanjiComponents, kanjiProgress] = await Promise.all([
      listKanji({ jlpt: jlptNum }),
      listComponents(jlptNum),
      getKanjiProgress(jlptNum),
    ]);
  }

  // Kelompok kana mirip — import JSON langsung (masuk bundle server).
  // matcha: baca via join(process.cwd(),"data",...) tak terlacak Vercel NFT
  // → file tak ikut deploy → confusables kosong di produksi.
  const confusables: ConfusableGroup[] = (
    (kanaConfusables as { groups?: ConfusableGroup[] }).groups ?? []
  ).filter((g) => g.script === script && Array.isArray(g.members));

  return {
    script,
    level,
    kanjiList,
    kanjiComponents,
    kanjiProgress,
    confusables,
  };
}

/* ── Sistem kanji lama (wordbank + MCQ + generate) DIHAPUS — dobel dengan
 * referensi kanonis + flash 3 mode di bawah. Generate kosakata tetap ada di
 * halaman Bank Kata (fungsinya kosakata, bukan referensi kanji).
 * matcha: dua sistem kanji paralel = user bingung + data dobel. */

/** Sel grid kana: klik = bunyi. Saat bunyi, romaji keganti spinner (anti-spam + feedback). */
function KanaCell({
  kana,
  romaji,
  glow,
  onSelect,
}: {
  kana: string;
  romaji: string;
  glow?: boolean;
  onSelect?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const speakNow = () => {
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

  const click = () => {
    // Mode mirip: tap = pilih grup + tetap bunyi (biar kerasa hidup).
    if (onSelect) {
      onSelect();
      if (!busy) speakNow();
      return;
    }
    if (busy) return;
    speakNow();
  };

  return (
    <button
      onClick={click}
      aria-busy={busy}
      className={`flex flex-col items-center gap-0.5 rounded-xl border py-2.5 transition-colors ${
        glow
          ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-100"
          : "border-zinc-200 bg-white hover:border-teal-300 active:bg-teal-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-800 dark:active:bg-teal-950/60"
      }`}
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

/* ── Kuis jebakan mirip: distraktor SELALU segrup (minimal pairs drilling).
 * matcha: distraktor acak bikin soal terlalu gampang — diskriminasi tak terlatih. */
type TrapGroup = { id: string; script: string; members: string[]; rule: string; mnemonic: string };

function romajiMapFor(script: "hiragana" | "katakana"): Map<string, string> {
  const m = new Map<string, string>();
  const put = (pairs: ([string, string] | null)[]) => {
    for (const p of pairs) {
      if (p && p[0] && p[1] && !m.has(p[0])) m.set(p[0], p[1]);
    }
  };
  for (const row of KANA_TABLES[script]) put([...row]);
  for (const row of (script === "hiragana" ? YOON_HIRA : YOON_KATA) as [string, string][][]) put(row);
  if (script === "katakana") put(GAIRAIGO as [string, string][]);
  return m;
}

type TrapQ = { kana: string; answer: string; options: string[] };

function buildTrapQuiz(
  groups: TrapGroup[],
  romaji: Map<string, string>,
  n = 10,
): TrapQ[] {
  const allKana = [...romaji.keys()];
  const qs: TrapQ[] = [];
  for (let i = 0; i < n; i++) {
    const g = groups[Math.floor(Math.random() * groups.length)]!;
    const kana = g.members[Math.floor(Math.random() * g.members.length)]!;
    const answer = romaji.get(kana) ?? kana;
    // Jawaban selalu ikut; 3 distraktor dari grup yang sama (atau acak se-script bila grup kecil).
    const others = g.members.filter((m) => m !== kana);
    const filler = [...allKana].sort(() => Math.random() - 0.5);
    for (const f of filler) {
      if (others.length >= 3) break;
      if (f !== kana && !others.includes(f) && romaji.get(f)) others.push(f);
    }
    const options = [kana, ...others.slice(0, 3)]
      .map((k) => romaji.get(k) ?? k)
      .sort(() => Math.random() - 0.5);
    qs.push({ kana, answer, options });
  }
  return qs;
}

function KanaTrapQuiz({ script, groups }: { script: string; groups: TrapGroup[] }) {
  const [qs, setQs] = useState<TrapQ[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  if (script === "kanji" || groups.length === 0) return null;
  const start = () => {
    setQs(buildTrapQuiz(groups, romajiMapFor(script as "hiragana" | "katakana")));
    setQi(0);
    setPicked(null);
    setScore(0);
  };

  if (qs.length === 0) {
    return (
      <div className="card flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Latihan Jebakan Mirip</p>
          <p className="text-xs text-zinc-500">10 soal — pilihan selalu dari grup yang sama. Berani?</p>
        </div>
        <button className="btn-primary shrink-0 text-sm" onClick={start}>
          Mulai
        </button>
      </div>
    );
  }

  const q = qs[qi];
  const done = qi >= qs.length;
  if (!q || done) {
    return (
      <div className="card space-y-2 p-4 text-center">
        <p className="font-bold">Skor {score}/{qs.length}</p>
        <p className="text-xs text-zinc-500">
          {score === qs.length ? "Sempurna — grup mirip takluk!" : "Ulangi sampai sempurna, lalu lepas mnemoniknya."}
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-secondary text-sm" onClick={() => setQs([])}>
            Selesai
          </button>
          <button className="btn-primary text-sm" onClick={start}>
            Ulangi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4 text-center">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">
        Soal {qi + 1}/{qs.length} · benar {score}
      </p>
      <p className="text-5xl font-bold">{q.kana}</p>
      <p className="text-xs text-zinc-400">Bacanya yang mana?</p>
      <div className="grid grid-cols-2 gap-1.5">
        {q.options.map((opt) => {
          const isAnswer = opt === q.answer;
          const isPicked = picked === opt;
          let cls = "btn-secondary justify-center";
          if (picked !== null) {
            if (isAnswer) cls += " !border-teal-500 !bg-teal-50 !text-teal-800 dark:!bg-teal-950 dark:!text-teal-300";
            else if (isPicked) cls += " !border-red-300 !bg-red-50 !text-red-700 dark:!bg-red-950 dark:!text-red-300";
            else cls += " opacity-50";
          }
          return (
            <button
              key={opt}
              className={cls}
              disabled={picked !== null}
              onClick={() => {
                setPicked(opt);
                if (isAnswer) setScore((s) => s + 1);
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null ? (
        <button
          className="btn-primary w-full"
          onClick={() => {
            setQi((i) => i + 1);
            setPicked(null);
          }}
        >
          Lanjut
        </button>
      ) : null}
    </div>
  );
}

/* ── Drill acak kana: dua arah (kana⇄romaji) + filter baris per script.
 * matcha: belum ada review kana sama sekali — tabel doang tanpa drill. */
type DrillFilter = "gojuon" | "dakuten" | "yoon";
type DrillDir = "kana-romaji" | "romaji-kana" | "campur";
type DrillQ = { ask: string; askIsKana: boolean; answer: string; options: string[] };

function drillPool(script: "hiragana" | "katakana", filters: DrillFilter[]): [string, string][] {
  const pool: [string, string][] = [];
  const push = (pairs: ([string, string] | null)[]) => {
    for (const p of pairs) if (p && p[0] && p[1]) pool.push([p[0], p[1]]);
  };
  if (filters.includes("gojuon")) {
    for (const row of KANA_TABLES[script].slice(0, 11)) push([...row]);
  }
  if (filters.includes("dakuten")) {
    for (const row of KANA_TABLES[script].slice(11, 16)) push([...row]);
  }
  if (filters.includes("yoon")) {
    for (const row of (script === "hiragana" ? YOON_HIRA : YOON_KATA) as [string, string][][]) push(row);
    if (script === "katakana") push(GAIRAIGO as [string, string][]);
  }
  return pool;
}

function buildDrill(
  pool: [string, string][],
  dir: DrillDir,
  n = 10,
): DrillQ[] {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  const qs: DrillQ[] = [];
  for (let i = 0; i < n; i++) {
    const [kana, romaji] = pick(pool);
    const askIsKana = dir === "kana-romaji" ? true : dir === "romaji-kana" ? false : Math.random() < 0.5;
    const answer = askIsKana ? romaji : kana;
    const opts = new Set<string>([answer]);
    const bag = [...pool].sort(() => Math.random() - 0.5);
    for (const [k, r] of bag) {
      if (opts.size >= 4) break;
      opts.add(askIsKana ? r : k);
    }
    qs.push({
      ask: askIsKana ? kana : romaji,
      askIsKana,
      answer,
      options: [...opts].sort(() => Math.random() - 0.5),
    });
  }
  return qs;
}

const DRILL_FILTERS: { id: DrillFilter; label: string }[] = [
  { id: "gojuon", label: "Gojūon" },
  { id: "dakuten", label: "Dakuten" },
  { id: "yoon", label: "Yōon" },
];
const DRILL_DIRS: { id: DrillDir; label: string }[] = [
  { id: "kana-romaji", label: "Kana → Romaji" },
  { id: "romaji-kana", label: "Romaji → Kana" },
  { id: "campur", label: "Campur" },
];

function KanaDrillQuiz({ script }: { script: string }) {
  const [filters, setFilters] = useState<DrillFilter[]>(["gojuon"]);
  const [dir, setDir] = useState<DrillDir>("campur");
  const [qs, setQs] = useState<DrillQ[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  if (script !== "hiragana" && script !== "katakana") return null;
  const toggleFilter = (f: DrillFilter) =>
    setFilters((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));
  const start = () => {
    const pool = drillPool(script, filters.length ? filters : ["gojuon"]);
    setQs(buildDrill(pool, dir));
    setQi(0);
    setPicked(null);
    setScore(0);
  };

  if (qs.length === 0) {
    return (
      <div className="card space-y-3 p-4">
        <div>
          <p className="font-semibold">Drill Acak {script === "hiragana" ? "Hiragana" : "Katakana"}</p>
          <p className="text-xs text-zinc-500">10 soal acak — dua arah, baris bisa dikombinasi.</p>
        </div>
        <div>
          <p className="label mb-1.5">Baris</p>
          <div className="flex flex-wrap gap-1.5">
            {DRILL_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip min-h-8 px-2.5 text-[11px] ${filters.includes(f.id) ? "chip-active" : ""}`}
                onClick={() => toggleFilter(f.id)}
                aria-pressed={filters.includes(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-1.5">Arah</p>
          <div className="flex flex-wrap gap-1.5">
            {DRILL_DIRS.map((d) => (
              <button
                key={d.id}
                className={`chip min-h-8 px-2.5 text-[11px] ${dir === d.id ? "chip-active" : ""}`}
                onClick={() => setDir(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" onClick={start}>
          Mulai drill
        </button>
      </div>
    );
  }

  const q = qs[qi];
  const done = qi >= qs.length;
  if (!q || done) {
    return (
      <div className="card space-y-2 p-4 text-center">
        <p className="font-bold">Skor {score}/{qs.length}</p>
        <p className="text-xs text-zinc-500">
          {score === qs.length ? "Sempurna!" : "Yang salah tandain — masuk mode mirip kalau ketuker."}
        </p>
        <div className="flex justify-center gap-2">
          <button className="btn-secondary text-sm" onClick={() => setQs([])}>
            Ganti setelan
          </button>
          <button className="btn-primary text-sm" onClick={start}>
            Acak lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4 text-center">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">
        Soal {qi + 1}/{qs.length} · benar {score}
      </p>
      <p className={q.askIsKana ? "text-5xl font-bold" : "text-3xl font-bold"}>{q.ask}</p>
      <p className="text-xs text-zinc-400">{q.askIsKana ? "Bacanya yang mana?" : "Kananya yang mana?"}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {q.options.map((opt) => {
          const isAnswer = opt === q.answer;
          const isPicked = picked === opt;
          let cls = "btn-secondary justify-center";
          if (picked !== null) {
            if (isAnswer) cls += " !border-teal-500 !bg-teal-50 !text-teal-800 dark:!bg-teal-950 dark:!text-teal-300";
            else if (isPicked) cls += " !border-red-300 !bg-red-50 !text-red-700 dark:!bg-red-950 dark:!text-red-300";
            else cls += " opacity-50";
          }
          return (
            <button
              key={opt}
              className={`${cls} ${q.askIsKana ? "" : "text-2xl"}`}
              disabled={picked !== null}
              onClick={() => {
                setPicked(opt);
                if (isAnswer) setScore((s) => s + 1);
                else speak(q.askIsKana ? q.ask : opt, "ja-JP");
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null ? (
        <button
          className="btn-primary w-full"
          onClick={() => {
            setQi((i) => i + 1);
            setPicked(null);
          }}
        >
          Lanjut
        </button>
      ) : null}
    </div>
  );
}

export default function AksaraPage() {
  const { script, level, kanjiList, kanjiComponents, kanjiProgress, confusables } =
    useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();

  const go = (next: { script?: Script; level?: string }) => {
    const p = new URLSearchParams(params);
    if (next.script) p.set("script", next.script);
    if (next.level) p.set("level", next.level);
    setParams(p, { preventScrollReset: true });
  };

  // Mode mirip: tap kana = grupnya nyala + kartu rule/mnemonik. Tanpa ini tap = bunyi.
  const [similarOn, setSimilarOn] = useState(false);
  const [selKana, setSelKana] = useState<string | null>(null);
  const selGroup = similarOn && selKana
    ? (confusables ?? []).find((g) => g.members.includes(selKana)) ?? null
    : null;
  const glowFor = (kana: string) =>
    similarOn && selGroup ? selGroup.members.includes(kana) : false;
  const selectFor = (kana: string) =>
    similarOn ? () => setSelKana((s) => (s === kana ? null : kana)) : undefined;

  // Tabel kana: batas 2xl biar sel ga jadi raksasa di desktop.
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
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
            {similarOn
              ? "Tap kana — yang mirip ikut nyala kuning + ada penjelasannya di bawah."
              : "Tap karakternya buat dengar cara bacanya — belajar 5 kolom per baris (gojūon), lanjut dakuten/handakuten di bawah."}
          </p>
          {(confusables ?? []).length > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">
                Yang mirip-mirip ({(confusables ?? []).length} grup jebakan)
              </p>
              <button
                className={`chip min-h-8 px-2.5 text-[11px] ${similarOn ? "chip-active" : ""}`}
                onClick={() => {
                  setSimilarOn((v) => !v);
                  setSelKana(null);
                }}
                aria-pressed={similarOn}
              >
                {similarOn ? "Mode mirip: ON" : "Mode mirip: OFF"}
              </button>
            </div>
          ) : null}
          {selGroup ? (
            <div className="card space-y-1 border-amber-200 p-3 dark:border-amber-900">
              <p className="text-sm font-bold tracking-wide">
                {selGroup.members.join(" ・ ")}
              </p>
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{selGroup.rule}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{selGroup.mnemonic}</p>
              <button
                className="btn-ghost inline-flex items-center gap-1 text-xs"
                onClick={() => {
                  const u = new SpeechSynthesisUtterance(selGroup.members.join("、"));
                  u.lang = "ja-JP";
                  window.speechSynthesis.cancel();
                  window.speechSynthesis.speak(u);
                }}
              >
                <Volume2 className="h-3.5 w-3.5" /> Dengarkan semuanya
              </button>
            </div>
          ) : null}
          <KanaTrapQuiz script={script} groups={confusables ?? []} />
          <KanaDrillQuiz script={script} />
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
                          <KanaCell
                            key={cell[0]}
                            kana={cell[0]}
                            romaji={cell[1]}
                            glow={glowFor(cell[0])}
                            onSelect={selectFor(cell[0])}
                          />
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
                    <KanaCell
                      key={kana}
                      kana={kana}
                      romaji={romaji}
                      glow={glowFor(kana)}
                      onSelect={selectFor(kana)}
                    />
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
                  <KanaCell
                    key={kana}
                    kana={kana}
                    romaji={romaji}
                    glow={glowFor(kana)}
                    onSelect={selectFor(kana)}
                  />
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

          <KanjiRef
            list={kanjiList ?? []}
            components={kanjiComponents ?? []}
            progress={kanjiProgress}
            level={level}
          />

          <p className="text-center text-xs text-zinc-400">
            Latihan nulis kanji ada di{" "}
            <Link to={`/write?level=${level}`} className="font-medium text-teal-700 underline underline-offset-2 dark:text-teal-400">
              /write?level={level}
            </Link>{" "}
            — coret di canvas dengan panduan samar.
          </p>
          <p className="text-center text-[11px] text-zinc-400">
            Data kanji: KANJIDIC2 © EDRDG (CC BY-SA 4.0) · goresan: KanjiVG © Ulrich Apel (CC BY-SA
            3.0) · contoh: JMdict via Jisho. Level JLPT patokan komunitas (tak resmi sejak 2010).
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Referensi kanji kanonis (seed dataset, bukan generate) ── */
type KanjiRow = { char: string; meaningId: string; strokes: number; jlpt: number | null; freq: number | null; components: string[] };
type KanjiReading = { text: string; primary: boolean };
type KanjiDetail = {
  char: string; meaningId: string; strokes: number; grade: number | null;
  freq: number | null; jlpt: number | null; svg: string | null;
  on: KanjiReading[]; kun: KanjiReading[]; components: string[];
  vocab: { word: string; reading: string; gloss: string }[];
};

/** Deretan bacaan jadi chip: on (katakana) vs kun (hiragana) beda warna,
 *  bacaan inti tebal + titik. matcha: teks ・・・ susah di-scan. */
function ReadingChips({ kind, items }: { kind: "on" | "kun"; items: KanjiReading[] }) {
  if (items.length === 0) return null;
  const chip =
    kind === "on"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-200"
      : "bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-200";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label w-7 shrink-0">{kind === "on" ? "On" : "Kun"}</span>
      {items.map((r) => (
        <span
          key={r.text}
          title={r.primary ? "Bacaan inti — hafalkan ini dulu" : undefined}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] ${chip} ${
            r.primary ? "font-bold ring-1 ring-current" : "opacity-80"
          }`}
        >
          {r.primary ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
          {r.text}
        </span>
      ))}
    </div>
  );
}

function KanjiRef({
  list, components, progress, level,
}: {
  list: KanjiRow[];
  components: { component: string; count: number }[];
  progress: { total: number; done: number } | null;
  level: string;
}) {
  const [compFilter, setCompFilter] = useState<string | null>(null);
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [detail, setDetail] = useState<KanjiDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const open = async (char: string) => {
    if (openChar === char) {
      setOpenChar(null);
      setDetail(null);
      return;
    }
    setOpenChar(char);
    setDetail(null);
    setDetailBusy(true);
    try {
      const r = await fetch(`/api/kanji?detail=${encodeURIComponent(char)}`);
      const d = await r.json();
      if (d.detail) setDetail(d.detail as KanjiDetail);
    } catch {
      /* diam */
    } finally {
      setDetailBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-1.5 p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">
            Kanji {level} — referensi kanonis ({list.length})
          </p>
          {progress ? (
            <span className="text-xs text-zinc-500">
              {progress.done}/{progress.total} dikenali
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-zinc-400">
          Daftar JLPT tak resmi (patokan komunitas). Data bacaan & goresan dari dataset kanonis —
          bukan generate AI.
        </p>
        {components.length > 0 ? (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
            <button
              className={`chip min-h-8 shrink-0 px-2.5 text-[11px] ${compFilter === null ? "chip-active" : ""}`}
              onClick={() => setCompFilter(null)}
            >
              Semua
            </button>
            {components.slice(0, 30).map((c) => (
              <button
                key={c.component}
                className={`chip min-h-8 shrink-0 px-2.5 text-[11px] ${compFilter === c.component ? "chip-active" : ""}`}
                title={`${c.count} kanji mengandung ini`}
                onClick={() => setCompFilter(compFilter === c.component ? null : c.component)}
              >
                {c.component}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <KanjiGrid list={list} compFilter={compFilter} openChar={openChar} onOpen={open} />
      {list.length === 0 ? (
        <div className="card p-4 text-center">
          <p className="font-medium">Kanji {level} belum di-seed</p>
          <p className="mt-1 text-xs text-zinc-500">
            N5 sudah lengkap (107 kanji). N4+ menyusul dengan pola seed yang sama — lihat docs/KANJI.md.
          </p>
        </div>
      ) : null}
      {/* Sheet detail: bottom-sheet di HP, panel tengah di desktop.
          matcha: detail inline di bawah grid = scroll jauh + konteks grid hilang. */}
      {openChar ? (
        <div className="fixed inset-x-0 top-0 z-40 h-[100dvh]" role="dialog" aria-modal="true" aria-label={`Detail ${openChar}`}>
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            onClick={() => {
              setOpenChar(null);
              setDetail(null);
            }}
          />
          {/* Sheet: selalu nempel bawah (mobile + desktop) — panel melayang
              tengah menyisakan backdrop di bawah yang kelihatan seperti gap.
              matcha: sm:rounded-3xl + m-auto = celah backdrop di bawah sheet. */}
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-2xl dark:bg-zinc-900">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
            <div className="mb-2 flex items-center justify-between">
              <p className="text-2xl font-bold">{openChar}</p>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => {
                  setOpenChar(null);
                  setDetail(null);
                }}
              >
                Tutup
              </button>
            </div>
            {detailBusy || !detail || detail.char !== openChar ? (
              <p className="py-8 text-center text-sm text-zinc-400">Memuat {openChar}…</p>
            ) : (
              <KanjiDetailView detail={detail} />
            )}
          </div>
        </div>
      ) : null}
      <KanjiFlash level={level} />
    </div>
  );
}

/** Grid kanji — filter komponen instan (komponen ikut list dari server). */
function KanjiGrid({
  list, compFilter, openChar, onOpen,
}: {
  list: KanjiRow[];
  compFilter: string | null;
  openChar: string | null;
  onOpen: (char: string) => void;
}) {
  const shown = compFilter ? list.filter((k) => k.components.includes(compFilter)) : list;
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
      {shown.map((k) => (
        <button
          key={k.char}
          onClick={() => onOpen(k.char)}
          title={`${k.char} — ${k.meaningId}`}
          className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-lg font-bold transition-colors ${
            openChar === k.char
              ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
              : "border-zinc-200 bg-white hover:border-teal-300 dark:border-zinc-800 dark:bg-zinc-900"
          }`}
        >
          {k.char}
          <span className="max-w-full truncate px-0.5 text-[9px] font-normal text-zinc-400">{k.meaningId}</span>
        </button>
      ))}
    </div>
  );
}

function KanjiDetailView({ detail }: { detail: KanjiDetail }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        {detail.svg ? (
          <div
            className="h-24 w-24 shrink-0 rounded-xl border border-zinc-200 p-1 dark:border-zinc-800 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: detail.svg }}
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-3xl font-bold">{detail.char}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{detail.meaningId}</p>
          <p className="mt-1 text-[11px] text-zinc-400">
            {detail.strokes} goresan
            {detail.grade ? ` · kelas ${detail.grade}` : ""}
            {detail.freq ? ` · frek #${detail.freq}` : ""}
          </p>
        </div>
      </div>
      {(detail.on.length > 0 || detail.kun.length > 0) ? (
        <div className="space-y-1.5">
          <ReadingChips kind="on" items={detail.on} />
          <ReadingChips kind="kun" items={detail.kun} />
        </div>
      ) : null}
      {detail.components.length > 0 ? (
        <p className="text-xs text-zinc-500">
          <span className="label mr-2">Komponen</span>
          {detail.components.join(" + ")}
        </p>
      ) : null}
      {detail.vocab.length > 0 ? (
        <div className="space-y-1.5">
          <p className="label">Contoh kata</p>
          {detail.vocab.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="font-semibold">{v.word}</span>
              <span className="text-xs text-zinc-400">{v.reading}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{v.gloss}</span>
              <SpeakButton
                text={v.word}
                buttonClassName="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Flashcard khusus kanji: 3 mode (kenali / ingat / baca) ── */
type KMode = "recognition" | "recall" | "reading";
type KCard = { kanji: string; meaningId: string; strokes: number; due?: number; reps?: number | null };

const K_MODE_META: { id: KMode; label: string; desc: string }[] = [
  { id: "recognition", label: "Kenali", desc: "kanji → arti + bacaan" },
  { id: "recall", label: "Ingat", desc: "arti → tulis/bayangkan kanji" },
  { id: "reading", label: "Baca", desc: "kata → bacaan" },
];

function KanjiFlash({ level }: { level: string }) {
  const [mode, setMode] = useState<KMode>("recognition");
  const [cards, setCards] = useState<KCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [full, setFull] = useState<KanjiDetail | null>(null);

  const start = async (m: KMode) => {
    setMode(m);
    setBusy(true);
    setReveal(false);
    setFull(null);
    requeues.current.clear();
    try {
      const r = await fetch(`/api/kanji?mode=${m}`);
      const d = await r.json();
      setCards(d.cards ?? []);
      setIdx(0);
      setStarted(true);
    } catch {
      /* diam */
    } finally {
      setBusy(false);
    }
  };

  const card = cards[idx];
  // Requeue sesi ala flashcard umum: Lupa/Susah balik ±5 posisi (maks 2x per
  // kartu) — tapi hormati due FSRS (masih cooldown = ditahan, lanjut lain).
  // matcha: kartu gagal hilang sampai besok.
  const requeues = useRef(new Map<string, number>());
  const requeue = (kanji: string, due?: number) => {
    if (due && due > Date.now() + 90_000) return;
    const n = requeues.current.get(kanji) ?? 0;
    if (n >= 2) return;
    requeues.current.set(kanji, n + 1);
    setCards((list) => {
      const at = Math.min(list.length, idx + 1 + 4 + Math.floor(Math.random() * 3));
      const target = list[idx];
      if (!target) return list;
      const next = [...list];
      next.splice(at, 0, target);
      return next;
    });
  };
  useEffect(() => {
    if (!started || !card) return;
    setFull(null);
    if (mode !== "recognition") {
      void fetch(`/api/kanji?detail=${encodeURIComponent(card.kanji)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.detail) setFull(d.detail as KanjiDetail);
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, idx, mode]);

  const rate = async (rating: 1 | 2 | 3 | 4) => {
    if (!card) return;
    setIdx((i) => i + 1);
    setReveal(false);
    try {
      const r = await fetch("/api/kanji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanji: card.kanji, mode, rating }),
      });
      const d = await r.json().catch(() => ({}));
      if (rating === 1 || rating === 2) requeue(card.kanji, d.due);
    } catch {
      /* tetap lanjut */
    }
  };

  if (!started) {
    return (
      <div className="card space-y-2 p-4">
        <p className="font-semibold">Flashcard kanji {level}</p>
        <p className="text-xs text-zinc-500">3 mode terpisah (1 fakta per kartu) + jadwal FSRS.</p>
        <div className="grid grid-cols-3 gap-1.5">
          {K_MODE_META.map((m) => (
            <button key={m.id} className="btn-secondary flex-col gap-0.5 py-2.5 text-xs" disabled={busy} onClick={() => void start(m.id)}>
              <span className="font-semibold">{m.label}</span>
              <span className="text-[10px] font-normal text-zinc-400">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="card space-y-2 p-4 text-center">
        <p className="font-medium">Sesi selesai — {cards.length} kartu</p>
        <div className="flex justify-center gap-2">
          <button className="btn-secondary" onClick={() => setStarted(false)}>
            Ganti mode
          </button>
          <button className="btn-primary" onClick={() => void start(mode)}>
            <RotateCcw className="h-4 w-4" /> Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-3 p-4 text-center">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">
        {K_MODE_META.find((m) => m.id === mode)?.label} · {idx + 1}/{cards.length}
      </p>
      {mode === "recognition" ? (
        <>
          <p className="text-6xl font-bold">{card.kanji}</p>
          {!reveal ? (
            <button className="btn-secondary mx-auto" onClick={() => setReveal(true)}>
              <Eye className="h-4 w-4" /> Arti + bacaan?
            </button>
          ) : (
            <KanjiAnswer kanji={card.kanji} />
          )}
        </>
      ) : mode === "recall" ? (
        <>
          <p className="text-lg font-semibold">{card.meaningId}</p>
          <p className="text-xs text-zinc-400">Bayangkan / tulis kanjinya, lalu cek</p>
          {!reveal ? (
            <button className="btn-secondary mx-auto" onClick={() => setReveal(true)}>
              <Eye className="h-4 w-4" /> Lihat kanji
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-6xl font-bold text-teal-700 dark:text-teal-300">{card.kanji}</p>
              {full ? (
                <p className="text-xs text-zinc-500">
                  on: {full.on.slice(0, 2).map((r) => r.text).join("・") || "—"} · kun: {full.kun.slice(0, 2).map((r) => r.text).join("・") || "—"}
                </p>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-2xl font-bold">{full?.vocab[0]?.word ?? card.meaningId}</p>
          <p className="text-xs text-zinc-400">Bagaimana bacanya?</p>
          {!reveal ? (
            <button className="btn-secondary mx-auto" onClick={() => setReveal(true)}>
              <Eye className="h-4 w-4" /> Lihat bacaan
            </button>
          ) : (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-teal-700 dark:text-teal-300">{full?.vocab[0]?.reading ?? "—"}</p>
              <p className="text-xs text-zinc-500">{full?.vocab[0]?.gloss ?? ""}</p>
            </div>
          )}
        </>
      )}
      {reveal ? (
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              [1, "Lupa"],
              [2, "Susah"],
              [3, "Pas"],
              [4, "Gampang"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className="btn-secondary flex-col gap-0.5 py-2 text-xs" onClick={() => void rate(v)}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <button className="btn-ghost mx-auto text-xs" onClick={() => setStarted(false)}>
        Berhenti
      </button>
    </div>
  );
}

function KanjiAnswer({ kanji }: { kanji: string }) {
  const [d, setD] = useState<KanjiDetail | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/kanji?detail=${encodeURIComponent(kanji)}`)
      .then((r) => r.json())
      .then((x) => {
        if (alive && x.detail) setD(x.detail as KanjiDetail);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kanji]);
  if (!d) return <p className="text-sm text-zinc-400">Memuat…</p>;
  return (
    <div className="space-y-1">
      <p className="font-semibold">{d.meaningId}</p>
      <p className="text-xs text-zinc-500">
        on: {d.on.slice(0, 2).join("・") || "—"} · kun: {d.kun.slice(0, 2).join("・") || "—"}
      </p>
      {d.vocab[0] ? (
        <p className="text-xs text-zinc-400">
          {d.vocab[0].word} ({d.vocab[0].reading}) — {d.vocab[0].gloss}
        </p>
      ) : null}
    </div>
  );
}

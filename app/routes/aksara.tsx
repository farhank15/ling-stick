import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, redirect, useLoaderData, useRevalidator, useSearchParams } from 'react-router';
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  Loader2,
  Play,
  RotateCcw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Volume2,
  X,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { ttsLang } from "~/lib/utils.shared";
import { SpeakButton } from "~/components/SpeakButton";
import kanaConfusables from "../../data/kana-confusables.json";
import {
  groupByRadical,
  groupByTheme,
  matchesKanji,
  parseReading,
} from "~/lib/kanji-study";

import { KanjiDetailView } from '~/components/KanjiDetailView';
import { KanjiSheet } from '~/components/KanjiSheet';
import { ConfirmModal } from '~/components/ConfirmModal';

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
  let kanjiList: {
    char: string;
    meaningId: string;
    strokes: number;
    jlpt: number | null;
    freq: number | null;
    components: string[];
    readings: string[];
  }[] = [];
  let kanjiComponents: { component: string; count: number }[] = [];
  let kanjiProgress: { total: number; done: number; known: string[] } | null = null;
  let savedKanji: { id: number; char: string; meaningId: string | null; exampleEn: string | null; exampleId: string | null }[] = [];
  if (script === "kanji") {
    const jlptNum = Number(level.slice(1)) || 5;
    const { listKanji, listComponents, getKanjiProgress } = await import("~/lib/kanji.server");
    const { listItems } = await import("~/lib/items.server");
    const [list, comps, prog, saved] = await Promise.all([
      listKanji({ jlpt: jlptNum }),
      listComponents(jlptNum),
      getKanjiProgress(jlptNum),
      listItems({ type: "kanji", status: "all", limit: 100 }),
    ]);
    kanjiList = list;
    kanjiComponents = comps;
    kanjiProgress = prog;
    savedKanji = saved.filter((r) => r.source === 'draw').map((r) => ({ id: r.id, char: r.text, meaningId: r.meaningId, exampleEn: r.firstExampleEn, exampleId: r.firstExampleId }));
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
    savedKanji,
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

/* ── Drill acak kana: dua arah (kana⇄romaji) + filter baris per script.
 * matcha: belum ada review kana sama sekali — tabel doang tanpa drill. */
type DrillFilter = "gojuon" | "dakuten" | "yoon";
type DrillDir = "kana-romaji" | "romaji-kana" | "campur" | "ketik";
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
  // Acak tanpa pengulangan dalam 1 ronde: pool di-shuffle dulu, soal diambil
  // berurutan (putar lagi kalau pool < n). matcha: pick() dengan replacement
  // bikin kana sama muncul 2-3x dalam 10 soal — makin parah kalau filter sempit.
  const order = [...pool].sort(() => Math.random() - 0.5);
  const qs: DrillQ[] = [];
  for (let i = 0; i < n; i++) {
    const [kana, romaji] = order[i % order.length]!;
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
  { id: "ketik", label: "Ketik (Free-response)" },
];

/* ── Drill kana terpadu: acak + jebakan mirip ───────────────────────────
 * Dulu dua kartu inline terpisah (setting drill di atas, kuis jebakan di
 * bawah) — dua alur, dua tempat, dua gaya, dan tab kana jadi panjang.
 * Sekarang satu overlay full-screen dengan pemilih mode, mengikuti pola
 * drill kanji. matcha: dua quiz inline = drill susah ditemukan di HP.
 */
type KanaDrillMode = "drill" | "trap";
type KanaQ = DrillQ & { note?: { rule: string; mnemonic: string } };

const KANA_MODE_META: { id: KanaDrillMode; label: string; desc: string }[] = [
  { id: "drill", label: "Drill acak", desc: "kana ⇄ romaji, baris bisa dipilih" },
  { id: "trap", label: "Jebakan mirip", desc: "pilihan selalu dari grup yang sama" },
];

function KanaDrill({
  script,
  groups,
  open,
  initialMode,
  onClose,
}: {
  script: "hiragana" | "katakana";
  groups: TrapGroup[];
  open: boolean;
  initialMode: KanaDrillMode;
  onClose: () => void;
}) {
  const label = script === "hiragana" ? "Hiragana" : "Katakana";
  const [mode, setMode] = useState<KanaDrillMode>(initialMode);
  const [filters, setFilters] = useState<DrillFilter[]>(["gojuon", "dakuten", "yoon"]);
  const [dir, setDir] = useState<DrillDir>("campur");
  const [qs, setQs] = useState<KanaQ[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [typed, setTyped] = useState("");
  const [typedResult, setTypedResult] = useState<{ ok: boolean; answer: string } | null>(null);
  const [started, setStarted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = qs[qi];
  const isTyping = mode === "drill" && dir === "ketik";
  const revealed = isTyping ? typedResult !== null : picked !== null;
  const correct = isTyping ? (typedResult?.ok ?? false) : picked === q?.answer;
  const modeLabel = mode === "trap" ? "Jebakan mirip" : "Drill acak";

  // Buka overlay = mulai dari layar pilih mode lagi (sesi lama tidak nyangkut).
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setStarted(false);
    setQs([]);
    setQi(0);
    setPicked(null);
    setScore(0);
    setTyped("");
    setTypedResult(null);
  }, [open, initialMode]);

  const start = (m: KanaDrillMode) => {
    if (m === "trap") {
      const romaji = romajiMapFor(script);
      setQs(
        buildTrapQuiz(groups, romaji).map((t) => {
          const g = groups.find((x) => x.members.includes(t.kana));
          return {
            ask: t.kana,
            askIsKana: true,
            answer: t.answer,
            options: t.options,
            note: g ? { rule: g.rule, mnemonic: g.mnemonic } : undefined,
          };
        }),
      );
    } else {
      const pool = drillPool(script, filters.length ? filters : ["gojuon", "dakuten", "yoon"]);
      setQs(buildDrill(pool, dir));
    }
    setMode(m);
    setQi(0);
    setPicked(null);
    setScore(0);
    setTyped("");
    setTypedResult(null);
    setStarted(true);
  };

  const next = () => {
    setQi((i) => i + 1);
    setPicked(null);
    setTyped("");
    setTypedResult(null);
  };

  const pick = (opt: string) => {
    if (!q || picked !== null) return;
    setPicked(opt);
    if (opt === q.answer) setScore((s) => s + 1);
    else speak(q.askIsKana ? q.ask : opt, "ja-JP");
  };

  const check = () => {
    if (!q || !typed.trim()) return;
    const ok = q.askIsKana
      ? typed.trim().toLowerCase() === q.answer.toLowerCase()
      : typed.trim() === q.answer;
    setTypedResult({ ok, answer: q.answer });
    if (ok) setScore((s) => s + 1);
    else speak(q.askIsKana ? q.ask : q.answer, "ja-JP");
  };

  // Autofocus input free-response tiap soal baru.
  useEffect(() => {
    if (open && started && isTyping && q && typedResult === null) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, started, qi, isTyping]);

  // Keyboard: 1–4 pilih opsi, Enter/Space lanjut, Esc tutup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!started || !q) return;
      if (e.target instanceof HTMLInputElement) return;
      if (!revealed && ["1", "2", "3", "4"].includes(e.key)) {
        const opt = q.options[Number(e.key) - 1];
        if (opt) {
          e.preventDefault();
          pick(opt);
        }
        return;
      }
      if (revealed && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        next();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, started, qi, picked, typedResult, q, revealed]);

  if (!open) return null;

  const pct = qs.length ? Math.round((Math.min(qi, qs.length) / qs.length) * 100) : 0;
  const prompt = isTyping
    ? q?.askIsKana
      ? "Ketik bacanya (romaji)"
      : "Ketik kananya"
    : q?.askIsKana
      ? "Bacanya yang mana?"
      : "Kananya yang mana?";
  const verdict =
    score === qs.length
      ? "Sempurna — grup mirip takluk!"
      : score >= qs.length * 0.8
        ? "Bagus. Ulangi sekali lagi biar nempel."
        : "Yang salah itu yang paling berharga — ulangi sampai sempurna.";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label={`Drill ${label}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200/70 px-4 py-2.5 dark:border-zinc-800/70">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Drill {label}
          </p>
          <p className="truncate text-sm font-semibold">
            {started && q ? `${modeLabel} · ${qi + 1} / ${qs.length}` : modeLabel}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup drill"
          className="btn-ghost min-h-9 min-w-9 justify-center px-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-teal-500 transition-[width] duration-300"
          style={{ width: `${started ? pct : 0}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {/* Layar pilih mode mulai dari atas; sesi & ringkasan di tengah. */}
        <div
          className={`mx-auto flex min-h-full w-full max-w-md flex-col ${started ? "justify-center" : "justify-start"}`}
        >
          {!started ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {KANA_MODE_META.map((m) => {
                  const active = mode === m.id;
                  const disabled = m.id === "trap" && groups.length === 0;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      aria-pressed={active}
                      disabled={disabled}
                      className={`rounded-2xl border p-3 text-left transition-colors disabled:opacity-40 ${
                        active
                          ? "border-teal-500 bg-teal-50 dark:bg-teal-950/50"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          active ? "text-teal-700 dark:text-teal-300" : ""
                        }`}
                      >
                        {m.label}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{m.desc}</p>
                    </button>
                  );
                })}
              </div>

              {mode === "drill" ? (
                <div className="space-y-2.5">
                  <div>
                    <p className="label mb-1.5">Baris</p>
                    <div className="flex flex-wrap gap-1.5">
                      {DRILL_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          className={`chip min-h-8 px-2.5 text-[11px] ${filters.includes(f.id) ? "chip-active" : ""}`}
                          onClick={() =>
                            setFilters((s) =>
                              s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id],
                            )
                          }
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
                          aria-pressed={dir === d.id}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {groups.length} grup jebakan. Pilihan jawaban selalu dari grup yang sama, jadi kamu
                  benar-benar melatih bedanya — bukan menebak. Aturan + mnemoniknya muncul setelah
                  jawab.
                </p>
              )}

              <button className="btn-primary w-full justify-center" onClick={() => start(mode)}>
                <Play className="h-4 w-4" /> Mulai {mode === "trap" ? "jebakan" : "drill"}
              </button>
            </div>
          ) : !q ? (
            <div className="space-y-4 text-center">
              <p className="text-5xl font-bold tabular-nums">
                {score}
                <span className="text-xl font-medium text-zinc-400">/{qs.length}</span>
              </p>
              <p className="text-xs leading-relaxed text-zinc-500">{verdict}</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary justify-center" onClick={() => setStarted(false)}>
                  Ganti setelan
                </button>
                <button className="btn-primary justify-center" onClick={() => start(mode)}>
                  <RotateCcw className="h-4 w-4" /> Ulangi
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="card flex min-h-[170px] flex-col items-center justify-center gap-2 p-5 text-center">
                <p
                  className={
                    q.askIsKana ? "font-jp text-6xl font-bold leading-none" : "text-3xl font-bold"
                  }
                >
                  {q.ask}
                </p>
                <p className="text-xs text-zinc-400">{prompt}</p>
                {revealed ? (
                  <p
                    className={`text-sm font-medium ${
                      correct
                        ? "text-teal-700 dark:text-teal-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {correct ? "Tepat!" : `Jawaban: ${q.answer}`}
                  </p>
                ) : null}
                {q.askIsKana ? (
                  <SpeakButton
                    text={q.ask}
                    lang="ja-JP"
                    className="h-3.5 w-3.5"
                    buttonClassName="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:text-teal-600 dark:text-zinc-500 dark:hover:text-teal-400"
                    title="Dengarkan kana"
                  />
                ) : null}
              </div>

              {isTyping ? (
                <>
                  <input
                    ref={inputRef}
                    key={qi}
                    className="input-area text-center text-lg"
                    placeholder={q.askIsKana ? "Ketik romaji…" : "Ketik kana…"}
                    value={typed}
                    disabled={typedResult !== null}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (typedResult !== null) next();
                      else check();
                    }}
                  />
                  {typedResult === null ? (
                    <button
                      className="btn-primary w-full justify-center"
                      onClick={check}
                      disabled={!typed.trim()}
                    >
                      Periksa
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {q.options.map((opt, i) => {
                    const isAnswer = opt === q.answer;
                    const isPicked = picked === opt;
                    const cls =
                      picked === null
                        ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        : isAnswer
                          ? "border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                          : isPicked
                            ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "border-zinc-200 bg-white text-zinc-400 opacity-50 dark:border-zinc-800 dark:bg-zinc-900";
                    return (
                      <button
                        key={opt}
                        onClick={() => pick(opt)}
                        disabled={picked !== null}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 font-medium transition-colors ${cls} ${
                          q.askIsKana ? "text-base" : "font-jp text-2xl"
                        }`}
                      >
                        <span className="text-[10px] text-zinc-400">{i + 1}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {revealed && q.note ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left dark:border-amber-900/60 dark:bg-amber-950/40">
                  <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                    {q.note.rule}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                    {q.note.mnemonic}
                  </p>
                </div>
              ) : null}

              {revealed ? (
                <button className="btn-primary w-full justify-center" onClick={next}>
                  Lanjut
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AksaraPage() {
  const { script, level, kanjiList, kanjiComponents, kanjiProgress, savedKanji, confusables } =
    useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [savedItemId, setSavedItemId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedDetail, setSavedDetail] = useState<KanjiDetail | null>(null);
  const openSaved = (k: { id: number; char: string; meaningId: string | null; exampleEn: string | null; exampleId: string | null }) => {
    setSavedItemId(k.id);
    const build = (j: KanjiApi | null) => {
      const on = (j && Array.isArray(j.on_readings) ? j.on_readings : []).map((r: string, i: number) => ({ text: r, primary: i === 0 }));
      const kun = (j && Array.isArray(j.kun_readings) ? j.kun_readings : []).map((r: string, i: number) => ({ text: r, primary: i === 0 }));
      const vocab = k.exampleEn ? [{ word: k.exampleEn, reading: '', gloss: k.exampleId || '' }] : [];
      setSavedDetail({
        char: k.char,
        meaningId: k.meaningId || (j && j.meanings ? j.meanings.join(', ') : ''),
        strokes: j && typeof j.stroke_count === 'number' ? j.stroke_count : 0,
        grade: j && typeof j.grade === 'number' ? j.grade : null,
        freq: j && typeof j.freq === 'number' ? j.freq : null,
        jlpt: j && typeof j.jlpt === 'number' ? j.jlpt : null,
        svg: null,
        on,
        kun,
        components: [],
        vocab,
      });
    };
    fetch('/api/kanji?detail=' + encodeURIComponent(k.char))
      .then((r) => r.json())
      .then((d) => {
        if (d.detail) {
          setSavedDetail(d.detail as KanjiDetail);
          return;
        }
        fetch('https://kanjiapi.dev/v1/kanji/' + encodeURIComponent(k.char))
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => build(j as KanjiApi | null))
          .catch(() => build(null));
      })
      .catch(() => build(null));
  };
  const deleteSaved = (id: number) => {
    fetch('/api/items/' + id, { method: 'DELETE' })
      .then((r) => {
        if (r.ok) {
          setSavedDetail(null);
          setSavedItemId(null);
          revalidator.revalidate();
        }
      })
      .catch(() => {});
  };
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
  // Pencarian kanji + drill overlay. Dua kontrol ini dipakai sambil scroll
  // daftar 100+ kanji, jadi ikut nempel di band sticky (bukan di dasar halaman).
  const [query, setQuery] = useState("");
  const [drillOpen, setDrillOpen] = useState(false);
  // Drill kana: satu overlay, dua pintu masuk (drill acak / jebakan mirip).
  const [kanaDrill, setKanaDrill] = useState<"drill" | "trap" | null>(null);
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
      {/* Tab aksara + pencarian kanji — sticky di bawah header app biar
          pindah tab & cari kanji bisa kapan saja tanpa scroll ke atas. */}
      <div className="sticky top-14 z-30 -mx-4 space-y-2 border-b border-zinc-200/70 bg-zinc-50/95 px-4 py-2 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/95">
        <div className="grid grid-cols-3 gap-1.5">
          {SCRIPTS.map((s) => (
            <button
              key={s}
              onClick={() => go({ script: s })}
              aria-current={script === s ? "page" : undefined}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                script === s
                  ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                  : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {SCRIPT_LABEL[s]}
            </button>
          ))}
        </div>
        {script !== "kanji" ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setKanaDrill("drill")}
              className="btn-primary min-h-10 gap-1.5 px-3 text-sm"
            >
              <Play className="h-4 w-4" aria-hidden />
              Drill
            </button>
            <button
              onClick={() => setKanaDrill("trap")}
              disabled={(confusables ?? []).length === 0}
              className="btn-secondary min-h-10 gap-1.5 px-3 text-sm"
            >
              <TriangleAlert className="h-4 w-4" aria-hidden />
              Jebakan
            </button>
          </div>
        ) : null}
        {script === "kanji" ? (
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                type="search"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari kanji, arti, atau bacaan…"
                aria-label="Cari kanji"
                className="input min-h-10 w-full pl-9 pr-9 text-base [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <button
              onClick={() => setDrillOpen(true)}
              className="btn-primary min-h-10 shrink-0 gap-1.5 px-3 text-sm"
            >
              <Play className="h-4 w-4" aria-hidden />
              Drill
            </button>
          </div>
        ) : null}
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

          {/* Drill kana = overlay full-screen, dipicu tombol di band sticky. */}
          <KanaDrill
            script={script}
            groups={confusables ?? []}
            open={kanaDrill !== null}
            initialMode={kanaDrill ?? "drill"}
            onClose={() => setKanaDrill(null)}
          />
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
            key={level}
            list={kanjiList ?? []}
            components={kanjiComponents ?? []}
            progress={kanjiProgress}
            level={level}
            query={query}
          />

          {(savedKanji ?? []).length > 0 ? (
            <div className="card space-y-2 p-4">
              <p className="label">Simpananku ({savedKanji!.length}) — dari coret kanji</p>
              <div className="flex flex-wrap gap-1.5">
                {savedKanji!.map((k) => (
                  <button type='button'
                    key={k.id}
                    onClick={() => void openSaved(k)}
                    className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl border border-teal-600/25 bg-teal-50/60 px-2.5 py-1.5 dark:border-teal-500/25 dark:bg-teal-950/40"
                    title={k.meaningId ?? ""}
                  >
                    <span className="text-xl font-bold leading-none">{k.char}</span>
                    <span className="mt-0.5 max-w-16 truncate text-[9px] text-zinc-500">{k.meaningId}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {savedDetail ? (
            <KanjiSheet
              detail={savedDetail}
              onEnriched={setSavedDetail}
              onClose={() => {
                setSavedDetail(null);
                setSavedItemId(null);
              }}
            >
              {savedItemId ? (
                <button type='button' className='btn-danger w-full' onClick={() => setConfirmDelete(true)}>
                  Hapus dari Simpananku
                </button>
              ) : null}
            </KanjiSheet>
          ) : null}
          {confirmDelete && savedItemId !== null && (
            <ConfirmModal
              open
              title="Hapus dari Simpananku?"
              message="Kanji ini dihapus dari daftar simpananmu. Kamu bisa menyimpannya lagi kapan saja."
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => {
                setConfirmDelete(false);
                deleteSaved(savedItemId);
              }}
            />
          )}

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

          {/* Drill = overlay full-screen, dipicu tombol di band sticky. */}
          <KanjiFlash level={level} open={drillOpen} onClose={() => setDrillOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* ── Referensi kanji kanonis (seed dataset, bukan generate) ── */
type KanjiApi = {
  on_readings?: string[];
  kun_readings?: string[];
  meanings?: string[];
  stroke_count?: number;
  grade?: number;
  freq?: number;
  jlpt?: number;
};

type KanjiRow = {
  char: string;
  meaningId: string;
  strokes: number;
  jlpt: number | null;
  freq: number | null;
  components: string[];
  readings: string[];
};
type KanjiReading = { text: string; primary: boolean };
type KanjiDetail = {
  char: string; meaningId: string; strokes: number; grade: number | null;
  freq: number | null; jlpt: number | null; svg: string | null;
  on: KanjiReading[]; kun: KanjiReading[]; components: string[];
  vocab: { word: string; reading: string; gloss: string }[];
};

/** Deretan bacaan jadi chip: on (katakana) vs kun (hiragana) beda warna.
 *  Notasi KANJIDIC dipecah: stem tebal, okurigana pudar, afiks diberi label.
 *  matcha: teks "ひと.つ" mentah bikin titik & strip tidak terbaca sebagai aturan. */
function ReadingChips({ kind, items }: { kind: "on" | "kun"; items: KanjiReading[] }) {
  if (items.length === 0) return null;
  const chip =
    kind === "on"
      ? "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-200"
      : "bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-200";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="label w-7 shrink-0"
        title={kind === "on" ? "Bacaan on — biasanya katakana" : "Bacaan kun — biasanya hiragana"}
      >
        {kind === "on" ? "On" : "Kun"}
      </span>
      {items.map((r) => {
        const p = parseReading(r.text);
        return (
          <span
            key={r.text}
            title={r.primary ? "Bacaan inti — hafalkan ini dulu" : undefined}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[14px] ${chip} ${
              r.primary ? "font-bold ring-1 ring-current" : "opacity-80"
            }`}
          >
            {r.primary ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
            <span className="font-jp tracking-wide">{p.stem}</span>
            {p.okurigana ? (
              <span
                className="font-jp font-normal tracking-wide opacity-60"
                title="Okurigana — bagian ini ditulis dengan kana saat kanji dipakai"
              >
                {p.okurigana}
              </span>
            ) : null}
            {p.affix ? (
              <span
                className="rounded bg-white/50 px-1 text-[9px] font-medium dark:bg-black/30"
                title={
                  p.affix === "prefix"
                    ? "Awalan — dipakai menempel di depan kanji lain (contoh: 一休み = ひとやすみ)"
                    : "Akhiran — dipakai menempel di belakang kanji lain (contoh: 日曜日 = にちようび)"
                }
              >
                {p.affix === "prefix" ? "awalan" : "akhiran"}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}


/** Baris bacaan ringkas untuk flashcard (tanpa chip penuh). */
function CompactReadings({ on, kun }: { on: KanjiReading[]; kun: KanjiReading[] }) {
  const fmt = (items: KanjiReading[]) => items.slice(0, 2).map((r) => r.text).join("・") || "—";
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
      <span>
        <span className="font-semibold text-sky-600 dark:text-sky-400">On</span>{" "}
        <span className="font-jp">{fmt(on)}</span>
      </span>
      <span>
        <span className="font-semibold text-violet-600 dark:text-violet-400">Kun</span>{" "}
        <span className="font-jp">{fmt(kun)}</span>
      </span>
    </p>
  );
}

function KanjiRef({
  list, components, progress, level, query,
}: {
  list: KanjiRow[];
  components: { component: string; count: number }[];
  progress: { total: number; done: number; known: string[] } | null;
  level: string;
  query: string;
}) {
  const [compFilter, setCompFilter] = useState<string | null>(null);
  // "Dikenal" dipegang di state lokal biar grid langsung hijau tanpa reload;
  // sumber awalnya union drill + tanda manual dari loader.
  const [known, setKnown] = useState<string[]>(progress?.known ?? []);
  const [filterOpen, setFilterOpen] = useState(false);
  const [order, setOrder] = useState<"freq" | "theme" | "pattern">("freq");
  const [openChar, setOpenChar] = useState<string | null>(null);
  const [detail, setDetail] = useState<KanjiDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  // Urutan pipeline: cari → filter komponen → kelompokkan. Grup kosong hilang.
  const searched = query.trim() ? list.filter((k) => matchesKanji(k, query)) : list;
  const shown = compFilter ? searched.filter((k) => k.components.includes(compFilter)) : searched;
  const groups =
    order === "theme" ? groupByTheme(shown) : order === "pattern" ? groupByRadical(shown) : [];
  const knownSet = new Set(known);
  const progressPct =
    progress && progress.total > 0 ? Math.round((known.length / progress.total) * 100) : 0;
  const orderHint =
    order === "freq"
      ? "Paling sering dipakai tampil dulu."
      : order === "theme"
        ? "Kelompok makna (angka, waktu, alam…) — hafalan nyambung."
        : "Berbagi radikal — hafal satu bentuk, sisanya lebih mudah.";

  // Tandai/batalkan "dikenal" — optimistis, di-rollback kalau request gagal.
  const toggleKnown = async (char: string) => {
    const next = !knownSet.has(char);
    setKnown((list) => (next ? [...list, char] : list.filter((c) => c !== char)));
    try {
      const r = await fetch("/api/kanji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanji: char, known: next }),
      });
      if (!r.ok) throw new Error("gagal");
    } catch {
      setKnown((list) => (next ? list.filter((c) => c !== char) : [...list, char]));
    }
  };

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
      <div className="card space-y-2.5 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              Kanji {level}
              <span className="ml-1.5 text-xs font-normal text-zinc-400">
                {shown.length === list.length
                  ? `${list.length} kanji`
                  : `${shown.length} dari ${list.length}`}
              </span>
            </h2>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
              JLPT tak resmi (patokan komunitas) · bacaan &amp; goresan kanonis
            </p>
          </div>
          {progress ? (
            <div className="w-24 shrink-0 pt-0.5">
              <div className="mb-1 flex justify-between text-[10px] text-zinc-500">
                <span>dikenali</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {known.length}/{progress.total}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-teal-500 transition-[width]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80">
          {(
            [
              ["freq", "Frekuensi"],
              ["theme", "Tema"],
              ["pattern", "Pola"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setOrder(id)}
              aria-pressed={order === id}
              className={`min-h-9 rounded-lg px-2 text-xs font-medium transition-colors ${
                order === id
                  ? "bg-white text-teal-700 shadow-sm dark:bg-zinc-900 dark:text-teal-300"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-400">{orderHint}</p>
          {components.length > 0 ? (
            <button
              className={`chip min-h-7 shrink-0 gap-1 px-2 text-[11px] ${compFilter ? "chip-active" : ""}`}
              onClick={() => setFilterOpen((v) => !v)}
              aria-expanded={filterOpen}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden />
              {compFilter ? `Komponen ${compFilter}` : "Filter"}
            </button>
          ) : null}
        </div>

        {filterOpen && components.length > 0 ? (
          <div className="space-y-1.5">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
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
          </div>
        ) : null}
      </div>
      {list.length === 0 ? (
        <div className="card p-4 text-center">
          <p className="font-medium">Kanji {level} belum di-seed</p>
          <p className="mt-1 text-xs text-zinc-500">
            Level ini belum masuk database. Jalankan <code>npm run kanji:import</code> untuk
            memuat dataset.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="card space-y-1 p-6 text-center">
          <p className="text-sm font-medium">Tidak ada kanji yang cocok</p>
          <p className="text-xs leading-relaxed text-zinc-500">
            Coba arti Indonesia, kana, atau romaji — mis. <em>sekolah</em>, <em>がく</em>,{" "}
            <em>gakkou</em>.
          </p>
        </div>
      ) : order === "freq" ? (
        <KanjiGrid list={shown} openChar={openChar} onOpen={open} known={knownSet} />
      ) : groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key} className="space-y-1.5">
              <div className="flex items-center gap-2 px-1">
                <span className="h-3.5 w-0.5 rounded-full bg-teal-500/70" aria-hidden />
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{g.label}</p>
                <span className="badge bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {g.rows.length}
                </span>
              </div>
              <p className="px-1 pl-3.5 text-[10px] leading-relaxed text-zinc-400">{g.hint}</p>
              <KanjiGrid list={g.rows} openChar={openChar} onOpen={open} known={knownSet} />
            </section>
          ))}
        </div>
      ) : (
        <p className="px-1 text-xs text-zinc-400">Tidak ada kanji untuk filter ini.</p>
      )}
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
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-2xl dark:bg-zinc-900">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700" />
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="font-jp text-2xl font-bold">{openChar}</p>
                <button
                  className={`chip min-h-7 shrink-0 gap-1 px-2 text-[11px] ${
                    knownSet.has(openChar)
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:border-emerald-600 hover:text-emerald-800 dark:border-emerald-500/60 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : ""
                  }`}
                  onClick={() => void toggleKnown(openChar)}
                  aria-pressed={knownSet.has(openChar)}
                >
                  <Check className="h-3 w-3" aria-hidden />
                  {knownSet.has(openChar) ? "Dikenal" : "Tandai dikenal"}
                </button>
              </div>
              <button
                className="btn-ghost min-h-9 shrink-0 px-3 text-xs"
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
    </div>
  );
}

/** Grid kanji — menerima baris yang sudah difilter/dikelompokkan. */
function KanjiGrid({
  list, openChar, onOpen, known,
}: {
  list: KanjiRow[];
  openChar: string | null;
  onOpen: (char: string) => void;
  known: Set<string>;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
      {list.map((k) => (
        <button
          key={k.char}
          onClick={() => onOpen(k.char)}
          title={`${k.char} — ${k.meaningId}${known.has(k.char) ? " · sudah dikenal" : ""}`}
          className={`flex aspect-square flex-col items-center justify-center rounded-xl border font-jp text-lg font-bold transition-colors ${
            openChar === k.char
              ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
              : known.has(k.char)
                ? "border-emerald-400/70 bg-emerald-50 text-emerald-900 hover:border-emerald-500 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100"
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


/* ── Flashcard khusus kanji: 4 mode (kenali / ingat / baca / produksi) ── */
type KMode = "recognition" | "recall" | "reading" | "production";
type KCard = { kanji: string; meaningId: string; strokes: number; due?: number; reps?: number | null };

const K_MODE_META: { id: KMode; label: string; desc: string }[] = [
  { id: "recognition", label: "Kenali", desc: "kanji → arti + bacaan" },
  { id: "recall", label: "Ingat", desc: "arti → tulis/bayangkan kanji" },
  { id: "reading", label: "Baca", desc: "kata → bacaan" },
  { id: "production", label: "Produksi", desc: "arti + bacaan → ketik kanji" },
];

const K_RATINGS = [
  {
    v: 1 as const,
    label: "Lupa",
    cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
  },
  {
    v: 2 as const,
    label: "Susah",
    cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  },
  {
    v: 3 as const,
    label: "Pas",
    cls: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300",
  },
  {
    v: 4 as const,
    label: "Gampang",
    cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300",
  },
];

/**
 * Drill kanji = overlay full-screen, bukan kartu di dasar halaman.
 * Tiga layar: pilih mode → sesi kartu → ringkasan. Rating bar selalu di
 * posisi sama (nggak muncul-hilang) biar layout nggak melompat tiap reveal.
 */
function KanjiFlash({
  level,
  open,
  onClose,
}: {
  level: string;
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<KMode>("recognition");
  const [cards, setCards] = useState<KCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [full, setFull] = useState<KanjiDetail | null>(null);
  const [typed, setTyped] = useState("");
  const [typedResult, setTypedResult] = useState<{ ok: boolean; answer: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const card = cards[idx];
  const meta = K_MODE_META.find((m) => m.id === mode)!;
  // Production pakai hasil ketik sebagai "reveal" — bukan tombol terpisah.
  const revealed = mode === "production" ? typedResult !== null : reveal;

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

  const start = async (m: KMode) => {
    setMode(m);
    setBusy(true);
    setReveal(false);
    setFull(null);
    requeues.current.clear();
    setTyped("");
    setTypedResult(null);
    try {
      const r = await fetch(`/api/kanji?mode=${m}&level=${level}`);
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

  const rate = async (rating: 1 | 2 | 3 | 4) => {
    if (!card) return;
    setIdx((i) => i + 1);
    setReveal(false);
    setTyped("");
    setTypedResult(null);
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

  const check = () => {
    if (!card || !typed.trim()) return;
    setTypedResult({ ok: typed.trim() === card.kanji, answer: card.kanji });
    setReveal(true);
  };

  // Autofocus keyboard tiap kartu baru (mobile langsung kebuka).
  useEffect(() => {
    if (open && started && mode === "production" && card) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open, started, idx, mode]);

  useEffect(() => {
    if (!open || !started || !card) return;
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
  }, [open, started, idx, mode]);

  // Shortcut keyboard: Space/Enter = buka jawaban, 1–4 = nilai.
  useEffect(() => {
    if (!open || !started || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setReveal(true);
        return;
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void rate(Number(e.key) as 1 | 2 | 3 | 4);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, started, idx, mode, revealed, card]);

  // Esc = tutup overlay + kunci scroll halaman di belakang selama drill.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const pct = cards.length ? Math.round((Math.min(idx, cards.length) / cards.length) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-zinc-50 dark:bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label={`Drill kanji ${level}`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200/70 px-4 py-2.5 dark:border-zinc-800/70">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Drill kanji {level}
          </p>
          <p className="truncate text-sm font-semibold">
            {started && card ? `${meta.label} · ${idx + 1} / ${cards.length}` : meta.label}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup drill"
          className="btn-ghost min-h-9 min-w-9 justify-center px-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-teal-500 transition-[width] duration-300"
          style={{ width: `${started ? pct : 0}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
          {!started ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {K_MODE_META.map((m) => {
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      aria-pressed={active}
                      className={`rounded-2xl border p-3 text-left transition-colors ${
                        active
                          ? "border-teal-500 bg-teal-50 dark:bg-teal-950/50"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                      }`}
                    >
                      <p
                        className={`text-sm font-semibold ${
                          active ? "text-teal-700 dark:text-teal-300" : ""
                        }`}
                      >
                        {m.label}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-[11px] leading-relaxed text-zinc-400">
                Tiap kartu dinilai 1–4 lalu dijadwalkan FSRS. Kartu yang lupa muncul lagi ±5 kartu
                kemudian.
              </p>
              <button
                className="btn-primary w-full justify-center gap-1.5"
                onClick={() => void start(mode)}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {busy ? "Menyiapkan…" : `Mulai ${meta.label.toLowerCase()}`}
              </button>
            </div>
          ) : !card ? (
            <div className="space-y-4 pt-8 text-center">
              <p className="text-lg font-semibold">Sesi selesai</p>
              <p className="text-xs text-zinc-500">
                {cards.length} kartu · mode {meta.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary justify-center" onClick={() => setStarted(false)}>
                  Ganti mode
                </button>
                <button className="btn-primary justify-center" onClick={() => void start(mode)}>
                  <RotateCcw className="h-4 w-4" /> Ulangi
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="card flex min-h-[260px] flex-col items-center justify-center gap-3 p-5 text-center">
                {mode === "recognition" ? (
                  <>
                    <p className="font-jp text-7xl font-bold leading-none">{card.kanji}</p>
                    {reveal ? (
                      <KanjiAnswer kanji={card.kanji} />
                    ) : (
                      <p className="text-xs text-zinc-400">Arti &amp; bacaan apa?</p>
                    )}
                  </>
                ) : mode === "recall" ? (
                  <>
                    <p className="text-2xl font-semibold">{card.meaningId}</p>
                    {reveal ? (
                      <>
                        <p className="font-jp text-7xl font-bold leading-none text-teal-700 dark:text-teal-300">
                          {card.kanji}
                        </p>
                        {full ? <CompactReadings on={full.on} kun={full.kun} /> : null}
                      </>
                    ) : (
                      <p className="text-xs text-zinc-400">Bayangkan / tulis kanjinya dulu</p>
                    )}
                  </>
                ) : mode === "reading" ? (
                  <>
                    <p className="font-jp text-3xl font-bold">
                      {full?.vocab[0]?.word ?? card.meaningId}
                    </p>
                    {reveal ? (
                      <>
                        <p className="font-jp text-xl font-semibold text-teal-700 dark:text-teal-300">
                          {full?.vocab[0]?.reading ?? "—"}
                        </p>
                        <p className="text-xs text-zinc-500">{full?.vocab[0]?.gloss ?? ""}</p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-400">Bagaimana bacanya?</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-semibold">{card.meaningId}</p>
                    {full ? <CompactReadings on={full.on} kun={full.kun} /> : null}
                    <input
                      ref={inputRef}
                      className="input-area w-full text-center font-jp text-4xl"
                      placeholder="漢字"
                      aria-label="Ketik kanji"
                      value={typed}
                      disabled={typedResult !== null}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") check();
                      }}
                    />
                    {typedResult ? (
                      <p
                        className={`text-sm font-medium ${
                          typedResult.ok
                            ? "text-teal-700 dark:text-teal-300"
                            : "text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {typedResult.ok ? "Tepat!" : `Jawaban: ${typedResult.answer}`}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-400">Ketik kanjinya, lalu Enter</p>
                    )}
                  </>
                )}
              </div>

              {revealed ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {K_RATINGS.map((r) => (
                    <button
                      key={r.v}
                      onClick={() => void rate(r.v)}
                      className={`flex flex-col items-center justify-center rounded-xl border py-2 transition-colors ${r.cls}`}
                    >
                      <span className="text-sm font-semibold">{r.label}</span>
                      <span className="text-[10px] opacity-60">{r.v}</span>
                    </button>
                  ))}
                </div>
              ) : mode === "production" ? (
                <button
                  className="btn-primary w-full justify-center"
                  onClick={check}
                  disabled={!typed.trim()}
                >
                  Periksa
                </button>
              ) : (
                <button
                  className="btn-secondary w-full justify-center"
                  onClick={() => setReveal(true)}
                >
                  <Eye className="h-4 w-4" /> Tampilkan jawaban
                </button>
              )}
            </div>
          )}
        </div>
      </div>
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
      <div className="flex flex-wrap justify-center gap-1.5">
        <ReadingChips kind="on" items={d.on} />
        <ReadingChips kind="kun" items={d.kun} />
      </div>
      {d.vocab[0] ? (
        <p className="text-xs text-zinc-400">
          {d.vocab[0].word} ({d.vocab[0].reading}) — {d.vocab[0].gloss}
        </p>
      ) : null}
    </div>
  );
}

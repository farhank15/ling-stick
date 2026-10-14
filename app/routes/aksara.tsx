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

  return {
    script,
    level,
    kanjiList,
    kanjiComponents,
    kanjiProgress,
  };
}

/* ── Sistem kanji lama (wordbank + MCQ + generate) DIHAPUS — dobel dengan
 * referensi kanonis + flash 3 mode di bawah. Generate kosakata tetap ada di
 * halaman Bank Kata (fungsinya kosakata, bukan referensi kanji).
 * matcha: dua sistem kanji paralel = user bingung + data dobel. */

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
  const { script, level, kanjiList, kanjiComponents, kanjiProgress } =
    useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();

  const go = (next: { script?: Script; level?: string }) => {
    const p = new URLSearchParams(params);
    if (next.script) p.set("script", next.script);
    if (next.level) p.set("level", next.level);
    setParams(p, { preventScrollReset: true });
  };

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
type KanjiDetail = {
  char: string; meaningId: string; strokes: number; grade: number | null;
  freq: number | null; jlpt: number | null; svg: string | null;
  on: string[]; kun: string[]; components: string[];
  vocab: { word: string; reading: string; gloss: string }[];
};

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
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`Detail ${openChar}`}>
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            onClick={() => {
              setOpenChar(null);
              setDetail(null);
            }}
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl dark:bg-zinc-900">
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
        <div className="space-y-1 text-sm">
          {detail.on.length > 0 ? (
            <p><span className="label mr-2">On</span>{detail.on.join("・")}</p>
          ) : null}
          {detail.kun.length > 0 ? (
            <p><span className="label mr-2">Kun</span>{detail.kun.join("・")}</p>
          ) : null}
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
      await fetch("/api/kanji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanji: card.kanji, mode, rating }),
      });
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
                  on: {full.on.slice(0, 2).join("・") || "—"} · kun: {full.kun.slice(0, 2).join("・") || "—"}
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

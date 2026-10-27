import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Loader2, PencilLine, X } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getKanjiQueue } from "~/lib/kanji.server";
import { KanjiDraw, type DrawStroke } from "~/components/KanjiDraw";
import type { KanjiPattern } from "~/lib/kanji-match2";

export const meta: MetaFunction = () => [{ title: "Latihan Nulis — LingStick" }];
export const handle = { title: "Latihan Nulis" };

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type Level = (typeof LEVELS)[number];

function isLevel(v: string | null): v is Level {
  return v !== null && (LEVELS as readonly string[]).includes(v);
}

/**
 * Latihan produksi: arti → tulis kanji → mesin menilai bentuk coretan.
 * Rating FSRS masuk ke kartu `production` (tabel kanji_cards), terpisah dari
 * mode Kenali/Baca supaya jadwal menulis tidak menutupi jadwal mengenali.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const raw = new URL(request.url).searchParams.get("level");
  const level: Level = isLevel(raw) ? raw : "N5";
  const cards = await getKanjiQueue("production", 20, Number(level.slice(1)));
  return { level, cards };
}

type Verdict = { rank: number; score: number | null; top: { char: string; score: number }[] };

export default function WritePage() {
  const { level, cards } = useLoaderData<typeof loader>();
  const [idx, setIdx] = useState(0);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);
  /** Satu promise referensi untuk seluruh sesi — prefetch + Periksa memakai yang sama. */
  const refsPromise = useRef<Promise<KanjiPattern[]> | null>(null);

  const loadRefs = () => {
    refsPromise.current ??= import("~/lib/kanji-match2").then((m) => m.buildRefPatternsAll());
    return refsPromise.current;
  };

  // Data template 3 MB — muat di latar setelah paint pertama biar Periksa tak nunggu.
  useEffect(() => {
    const t = setTimeout(() => void loadRefs().catch(() => {}), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = cards[idx];

  const reset = () => {
    setStrokes([]);
    setVerdict(null);
    setShowGuide(false);
  };

  const advance = () => {
    reset();
    setIdx((i) => (i + 1) % cards.length);
  };

  const check = async () => {
    if (!target || strokes.length === 0) return;
    setChecking(true);
    try {
      const [{ evaluateDrawing }, patterns] = await Promise.all([
        import("~/lib/kanji-match2"),
        loadRefs(),
      ]);
      setVerdict(evaluateDrawing(strokes, patterns, target.kanji));
    } finally {
      setChecking(false);
    }
  };

  const rate = async (rating: 1 | 3) => {
    if (!target || saving) return;
    setSaving(true);
    try {
      await fetch("/api/kanji", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanji: target.kanji, mode: "production", rating }),
      });
      setDone((n) => n + 1);
      advance();
    } finally {
      setSaving(false);
    }
  };

  if (!target) {
    return (
      <div className="py-16 text-center">
        <PencilLine className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Belum ada kanji buat level ini</p>
        <p className="mt-1 text-sm text-zinc-500">
          Jalankan seed katalog kanji dulu, atau pilih level lain di atas.
        </p>
        <Link to="/aksara" className="btn-secondary mt-4 inline-flex">
          Buka Aksara <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const good = verdict?.rank === 0;

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {LEVELS.map((lv) => (
            <Link
              key={lv}
              to={`/write?level=${lv}`}
              className={`chip ${lv === level ? "chip-active" : ""}`}
              aria-current={lv === level ? "page" : undefined}
            >
              {lv}
            </Link>
          ))}
        </div>
        <span className="text-xs text-zinc-400">
          {idx + 1}/{cards.length}
          {done > 0 ? ` · ${done} dinilai` : ""}
        </span>
      </div>

      <div className="card space-y-1">
        <p className="label">Tulis kanji untuk</p>
        <p className="text-lg font-semibold">{target.meaningId}</p>
        <p className="text-xs text-zinc-400">
          {target.strokes} goresan · urutan & arah tetap dinilai
        </p>
      </div>

      <KanjiDraw
        key={`${target.kanji}-${idx}`}
        onChange={setStrokes}
        guide={showGuide ? target.kanji : undefined}
      />

      <div className="flex items-center justify-between">
        <button
          className="btn-ghost min-h-8 min-w-8 p-1.5"
          onClick={() => setShowGuide((v) => !v)}
          title={showGuide ? "Panduan nyala — klik buat matiin" : "Panduan mati — klik buat nyalain"}
          aria-label={showGuide ? "Matikan panduan samar" : "Nyalakan panduan samar"}
        >
          {showGuide ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          className="btn-primary"
          disabled={strokes.length === 0 || checking || verdict !== null}
          onClick={() => void check()}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Periksa
        </button>
      </div>

      {verdict ? (
        <div
          className={`card space-y-2 ${
            good
              ? "!border-emerald-300 !bg-emerald-50/60 dark:!border-emerald-500/40 dark:!bg-emerald-950/30"
              : "!border-amber-300 !bg-amber-50/60 dark:!border-amber-500/40 dark:!bg-amber-950/30"
          }`}
        >
          <p className="flex items-center gap-2 font-semibold">
            {good ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" /> Bentuknya cocok
              </>
            ) : (
              <>
                <X className="h-4 w-4 text-amber-600" /> Belum cocok
              </>
            )}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {good
              ? "Goresanmu paling mirip dengan kanji ini."
              : verdict.top.length === 0
                ? "Goresanmu belum mirip kanji mana pun — cek jumlah dan arah goresannya."
                : `Goresanmu paling mirip ${verdict.top[0]!.char} — targetnya ${target.kanji}.`}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-4xl font-bold">{target.kanji}</span>
            <span className="text-sm text-zinc-500">{target.readings.slice(0, 3).join(" · ")}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button className="btn-secondary flex-1" disabled={saving} onClick={() => void rate(1)}>
              <X className="h-4 w-4" /> Salah
            </button>
            <button className="btn-primary flex-1" disabled={saving} onClick={() => void rate(3)}>
              <Check className="h-4 w-4" /> Benar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

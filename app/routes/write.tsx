import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Eraser, Eye, EyeOff, PencilLine } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { cards, items } from "~/lib/db/schema";
import { getTargetLang } from "~/lib/lang.server";
import { and, eq, sql } from "drizzle-orm";

export const meta: MetaFunction = () => [{ title: "Latihan Nulis — LingStick" }];
export const handle = { title: "Latihan Nulis" };

/** Kosakata aktif (dipelajari, punya arti) untuk latihan menulis. */
async function writeTargets(lang: string) {
  return db
    .select({ id: items.id, text: items.text, reading: items.reading, meaningId: items.meaningId })
    .from(items)
    .innerJoin(cards, eq(cards.itemId, items.id))
    .where(and(eq(items.status, "learning"), eq(items.lang, lang), sql`${items.meaningId} IS NOT NULL`))
    .orderBy(sql`${cards.reps} ASC, ${items.createdAt} DESC`)
    .limit(50);
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang();
  return { lang, targets: await writeTargets(lang) };
}

type Stroke = { x: number; y: number };

export default function WritePage() {
  const { lang, targets } = useLoaderData<typeof loader>();
  const [idx, setIdx] = useState(0);
  const [showGuide, setShowGuide] = useState(true); // bentuk samar di background
  const [showRomaji, setShowRomaji] = useState(false); // romaji hidden by default (belajar baca)
  const [strokes, setStrokes] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<Stroke | null>(null);

  const target = targets[idx];

  const clearCanvas = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx?.clearRect(0, 0, cv.width, cv.height);
    setStrokes(0);
  }, []);

  useEffect(() => {
    clearCanvas();
  }, [idx, clearCanvas]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Stroke => {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * cv.width,
      y: ((e.clientY - rect.top) / rect.height) * cv.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    const ctx = canvasRef.current?.getContext("2d");
    ctx?.beginPath();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = pos(e);
    if (!ctx || !last.current) return;
    ctx.strokeStyle = "#0d9488"; // teal-600
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setStrokes((n) => n + 1);
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  if (!target) {
    return (
      <div className="py-16 text-center">
        <PencilLine className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Belum ada kosakata buat dilatih</p>
        <p className="mt-1 text-sm text-zinc-500">
          {lang === "ja"
            ? "Simpan kosakata Jepang dulu dari Tambah atau Bank Kata."
            : "Latihan nulis paling cocok buat kosakata Jepang — ganti bahasa target di Pengaturan."}
        </p>
        <Link to="/bank" className="btn-secondary mt-4 inline-flex">
          Buka Bank Kata <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const stripRomaji = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Coret karakternya di kotak pakai jari/stylus. Bentuk samar di belakang = panduan —
        matikan kalau udah mulai hafal.
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          Kartu {idx + 1} / {targets.length} · {strokes > 0 ? `${strokes} goresan` : "belum dicoret"}
        </span>
        <span className="flex gap-1">
          <button
            className="btn-ghost text-xs"
            onClick={() => setShowGuide((v) => !v)}
            title={showGuide ? "Sembunyikan panduan" : "Tampilkan panduan samar"}
          >
            {showGuide ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {showGuide ? "Panduan nyala" : "Panduan mati"}
          </button>
          {lang === "ja" ? (
            <button
              className="btn-ghost text-xs"
              onClick={() => setShowRomaji((v) => !v)}
              title={showRomaji ? "Sembunyikan romaji" : "Tampilkan romaji (buat yang gagap)"}
            >
              {showRomaji ? "Romaji nyala" : "Romaji mati"}
            </button>
          ) : null}
        </span>
      </div>

      <div className="flex justify-center">
        <div className="relative">
          {/* Panduan samar di belakang canvas */}
          {showGuide ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11rem] leading-none font-bold text-zinc-200 select-none dark:text-zinc-800"
            >
              {target.text.slice(0, 1)}
            </span>
          ) : null}
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            className="touch-none rounded-2xl border-2 border-dashed border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
        </div>
      </div>

      <div className="text-center">
        <p className="text-2xl font-bold">{target.text}</p>
        {target.reading ? (
          <p className="mt-0.5 text-sm text-zinc-400 dark:text-zinc-500">
            {showRomaji && target.reading.includes("(")
              ? target.reading
              : stripRomaji(target.reading)}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{target.meaningId}</p>
      </div>

      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={clearCanvas}>
          <Eraser className="h-4 w-4" strokeWidth={1.75} /> Hapus
        </button>
        <button
          className="btn-primary flex-1"
          onClick={() => setIdx((i) => (i + 1) % targets.length)}
        >
          Lanjut <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

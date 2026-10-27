import { useEffect, useRef, useState } from "react";
import { Eraser, RotateCcw } from "lucide-react";

export type DrawStroke = { x: number; y: number }[];

/**
 * Papan coret kanji — pointer events + HiDPI, undo + hapus.
 * matcha: touch-event terpisah = bug palm/mouse; pointer events satu jalur.
 */
export function KanjiDraw({
  onChange,
  guide,
}: {
  onChange: (strokes: DrawStroke[]) => void;
  /** Bentuk samar di belakang canvas (mis. kanji target) — kanvas tetap transparan. */
  guide?: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const drawing = useRef<DrawStroke | null>(null);
  /**
   * matcha:explain sumber kebenaran goresan ada di ref, bukan state.
   * `fit` berjalan dari effect ber-dep `[]` (listener resize), jadi closure-nya
   * memegang `strokes` render pertama. Dulu itu membuat goresan hilang total
   * setiap resize — termasuk saat toolbar Safari mobile menyusut waktu scroll.
   */
  const strokesRef = useRef<DrawStroke[]>([]);

  // Ukuran canvas ikut wadah × dpr (tajam di HP).
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const fit = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${w}px`;
      repaint();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repaint = (list?: DrawStroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, w);
    // Grid bantu (9 kotak) — panduan proporsi.
    ctx.strokeStyle = "rgba(127,127,127,0.18)";
    ctx.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3]) {
      ctx.beginPath();
      ctx.moveTo(w * f, 0);
      ctx.lineTo(w * f, w);
      ctx.moveTo(0, w * f);
      ctx.lineTo(w, w * f);
      ctx.stroke();
    }
    ctx.strokeStyle = "currentColor";
    ctx.lineWidth = 4;
    // Sudut harus tajam (persegi tetap persegi), bukan tumpul karena round join.
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 10;
    for (const s of list ?? strokesRef.current) {
      if (s.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(s[0]!.x, s[0]!.y);
      for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  useEffect(() => {
    repaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const push = (next: DrawStroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {guide ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9rem] leading-none font-bold text-zinc-200 select-none dark:text-zinc-800"
          >
            {guide}
          </span>
        ) : null}
        <canvas
          ref={canvasRef}
          className="relative block touch-none select-none"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drawing.current = [pos(e)];
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            e.preventDefault();
            const p = pos(e);
            const last = drawing.current[drawing.current.length - 1];
            // Simpan tiap ~0.75px: halus, tapi tidak menumpuk ribuan titik.
            if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.75) {
              drawing.current.push(p);
              repaint([...strokesRef.current, drawing.current]);
            }
          }}
          onPointerUp={(e) => {
            if (!drawing.current) return;
            // matcha:explain browser menggabungkan pointermove — titik `pointerup`
            // bisa beberapa piksel setelah move terakhir. Tanpa segmen penutup,
            // ekor goresan terlihat memendek tepat saat pena diangkat.
            // Selalu tutup dengan titik pointerup persis — tanpa ini ekor goresan
            // terlihat memendek/bergeser tepat saat pena diangkat.
            const up = pos(e);
            const tail = drawing.current[drawing.current.length - 1]!;
            if (Math.hypot(up.x - tail.x, up.y - tail.y) > 0.01) drawing.current.push(up);
            const done = drawing.current;
            drawing.current = null;
            if (done.length >= 2) push([...strokesRef.current, done]);
            else repaint();
          }}
          onPointerCancel={() => {
            drawing.current = null;
            repaint();
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          {strokes.length === 0 ? "Coret kanjinya di atas" : `${strokes.length} goresan`}
        </p>
        <div className="flex gap-1.5">
          <button
            className="btn-secondary px-3 py-1.5 text-xs"
            disabled={strokes.length === 0}
            onClick={() => push(strokes.slice(0, -1))}
          >
            <Eraser className="h-3.5 w-3.5" /> Urung 1
          </button>
          <button
            className="btn-secondary px-3 py-1.5 text-xs"
            disabled={strokes.length === 0}
            onClick={() => push([])}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

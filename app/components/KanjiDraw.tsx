import { useEffect, useRef, useState } from "react";
import { Eraser, RotateCcw } from "lucide-react";

export type DrawStroke = { x: number; y: number }[];

/**
 * Papan coret kanji — pointer events + HiDPI, undo + hapus.
 * matcha: touch-event terpisah = bug palm/mouse; pointer events satu jalur.
 */
export function KanjiDraw({ onChange }: { onChange: (strokes: DrawStroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const drawing = useRef<DrawStroke | null>(null);

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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of (list ?? strokes)) {
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
    setStrokes(next);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none select-none"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drawing.current = [pos(e)];
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            e.preventDefault();
            drawing.current.push(pos(e));
            repaint([...strokes, drawing.current]);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            const done = drawing.current.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1]!.x, p.y - a[i - 1]!.y) > 2);
            drawing.current = null;
            if (done.length >= 2) push([...strokes, done]);
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

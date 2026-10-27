import { useEffect, useState } from 'react';

type Point = [number, number];

// Ilustrasi urutan goresan dari data textbook (koordinat 0-100).
// Dipakai untuk kanji yang belum punya SVG KanjiVG di tabel referensi.
export function KanjiStrokeGuide({ char }: { char: string }) {
  const [strokes, setStrokes] = useState<Point[][] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setStrokes(null);
    setFailed(false);
    fetch('/api/kanji?strokes=' + encodeURIComponent(char))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d && Array.isArray(d.strokes)) setStrokes(d.strokes as Point[][]);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [char]);

  if (failed) return null;

  return (
    <div className='h-24 w-24 shrink-0 rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900'>
      {strokes ? (
        <svg
          viewBox='-8 -8 116 116'
          className='h-full w-full text-zinc-700 dark:text-zinc-200'
          role='img'
          aria-label={'Urutan goresan ' + char}
        >
          <rect
            x='0'
            y='0'
            width='100'
            height='100'
            fill='none'
            stroke='currentColor'
            strokeOpacity='0.15'
            strokeDasharray='3 3'
          />
          {strokes.map((s, i) => (
            <g key={i}>
              <polyline
                points={s.map(([x, y]) => x + ',' + y).join(' ')}
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeOpacity='0.85'
              />
              <text
                x={s[0][0]}
                y={s[0][1]}
                fontSize='7'
                fill='#0d9488'
                fontWeight='700'
                textAnchor='middle'
                dominantBaseline='middle'
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <div className='h-full w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800' />
      )}
    </div>
  );
}
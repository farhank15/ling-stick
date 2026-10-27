import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { X } from 'lucide-react';
import type { KanjiDetail } from '~/lib/kanji.server';
import { SpeakButton } from '~/components/SpeakButton';

const LEVELS = [5, 4, 3, 2, 1] as const;

type Props = {
  detail: KanjiDetail;
  level: number;
};

export function KanjiWidget({ detail, level }: Props) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();

  return (
    <div className='card flex flex-col gap-3 p-4'>
      <div className='flex items-center justify-between gap-2'>
        <p className='label'>Kanji Saat Ini</p>
        <div className='flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800'>
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type='button'
              onClick={() => fetcher.submit({ intent: 'setKanjiLevel', level: String(lv) }, { method: 'post' })}
              className={
                'rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ' +
                (level === lv
                  ? 'bg-teal-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')
              }
            >
              N{lv}
            </button>
          ))}
        </div>
      </div>

      <button
        type='button'
        onClick={() => setOpen(true)}
        className='group flex items-center gap-4 rounded-xl p-1 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
      >
        <span className='flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-4xl font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'>
          {detail.char}
        </span>
        <span className='min-w-0'>
          <span className='block text-sm font-semibold'>{detail.meaningId}</span>
          <span className='mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted'>
            <span>On: {detail.on.filter((o) => o.primary).map((o) => o.text).join(', ') || '—'}</span>
            <span>Kun: {detail.kun.filter((k) => k.primary).map((k) => k.text).join(', ') || '—'}</span>
          </span>
          {detail.vocab[0] ? (
            <span className='mt-1 block truncate text-xs text-muted'>
              {detail.vocab[0].word} · {detail.vocab[0].reading} — {detail.vocab[0].gloss}
            </span>
          ) : null}
        </span>
      </button>

      <p className='text-[11px] text-zinc-400'>Klik kartu untuk detail · ganti level di atas</p>

      {open ? <KanjiSheet detail={detail} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function KanjiSheet({ detail, onClose }: { detail: KanjiDetail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className='fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 backdrop-blur-[2px] sm:items-center'
      onClick={onClose}
      role='presentation'
    >
      <div
        className='card w-full max-w-sm space-y-3 p-4'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label={detail.char}
      >
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-start gap-4'>
            {detail.svg ? (
              <div
                className='h-20 w-20 shrink-0 rounded-xl border border-zinc-200 p-1 dark:border-zinc-800 [&>svg]:h-full [&>svg]:w-full'
                dangerouslySetInnerHTML={{ __html: detail.svg }}
              />
            ) : null}
            <div className='min-w-0'>
              <p className='font-jp text-3xl font-bold'>{detail.char}</p>
              <p className='text-sm text-zinc-600 dark:text-zinc-300'>{detail.meaningId}</p>
              <p className='mt-1 text-[11px] text-zinc-400'>
                {detail.strokes} goresan
                {detail.grade ? ` · kelas ${detail.grade}` : ''}
                {detail.freq ? ` · frek #${detail.freq}` : ''}
              </p>
            </div>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800'
            aria-label='Tutup'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='space-y-1.5'>
          <p className='label'>Bacaan</p>
          <div className='flex flex-wrap gap-1.5'>
            {detail.on.length ? (
              detail.on.map((o, i) => (
                <span key={'o-' + i} className={'chip' + (o.primary ? ' chip-active' : '')}>{o.text}</span>
              ))
            ) : (
              <span className='text-xs text-zinc-400'>—</span>
            )}
            {detail.kun.length ? (
              detail.kun.map((k, i) => (
                <span key={'k-' + i} className={'chip' + (k.primary ? ' chip-active' : '')}>{k.text}</span>
              ))
            ) : null}
          </div>
        </div>

        {detail.components.length ? (
          <p className='text-xs text-zinc-500'>
            <span className='label mr-2'>Komponen</span>
            {detail.components.join(' + ')}
          </p>
        ) : null}

        {detail.vocab.length ? (
          <div className='space-y-1.5'>
            <p className='label'>Contoh kata</p>
            {detail.vocab.slice(0, 5).map((v, i) => (
              <div key={i} className='flex items-center gap-2 text-sm'>
                <span className='font-jp font-semibold'>{v.word}</span>
                <span className='font-jp text-xs text-zinc-400'>{v.reading}</span>
                <span className='min-w-0 flex-1 truncate text-xs text-zinc-500'>{v.gloss}</span>
                <SpeakButton text={v.word} buttonClassName='shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800' />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

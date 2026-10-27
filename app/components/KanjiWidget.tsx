import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { X } from 'lucide-react';
import type { KanjiDetail } from '~/lib/kanji.server';
import { KanjiDetailView } from '~/components/KanjiDetailView';

const LEVELS = [5, 4, 3, 2, 1] as const;

type Props = {
  detail: KanjiDetail | null;
  level: number;
  available: number[];
};

export function KanjiWidget({ detail, level, available }: Props) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  const hasData = available.includes(level);

  return (
    <>
      <div className='card flex min-w-0 flex-col gap-3 overflow-hidden p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='label min-w-0'>Kanji Saat Ini</p>
          <div className='flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800'>
            {LEVELS.map((lv) => {
              const disabled = !available.includes(lv);
              return (
                <button
                  key={lv}
                  type='button'
                  disabled={disabled}
                  title={disabled ? 'Belum ada data kanji untuk level ini' : undefined}
                  onClick={() => fetcher.submit({ intent: 'setKanjiLevel', level: String(lv) }, { method: 'post' })}
                  className={
                    'rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ' +
                    (disabled
                      ? 'cursor-not-allowed text-zinc-300 dark:text-zinc-600'
                      : level === lv
                        ? 'bg-teal-600 text-white'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200')
                  }
                >
                  N{lv}
                </button>
              );
            })}
          </div>
        </div>

        {detail ? (
          <>
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
          </>
        ) : (
          <p className='text-sm text-muted'>
            {hasData
              ? 'Belum ada kanji untuk ditampilkan.'
              : 'Belum ada data kanji untuk level N' + level + '. Pilih N5 atau N4.'}
          </p>
        )}
      </div>

      {open && detail ? <KanjiSheet detail={detail} onClose={() => setOpen(false)} /> : null}
    </>
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
        className='card max-h-[85vh] w-full max-w-sm overflow-y-auto p-4'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label={detail.char}
      >
        <div className='mb-1 flex justify-end'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800'
            aria-label='Tutup'
          >
            <X className='h-5 w-5' />
          </button>
        </div>
        <KanjiDetailView detail={detail} />
      </div>
    </div>
  );
}

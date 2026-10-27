import { useEffect, useState, type ReactNode } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import type { KanjiDetail } from '~/lib/kanji.server';
import { KanjiDetailView } from '~/components/KanjiDetailView';

type Props = {
  detail: KanjiDetail;
  onClose: () => void;
  children?: ReactNode;
  onEnriched?: (detail: KanjiDetail) => void;
};

// Bottom sheet yang meniru persis sheet detail di halaman Aksara/Kanji:
// nempel bawah di semua ukuran (bukan modal tengah), ada garis handle di
// tengah-atas, dan tombol Tutup teks (bukan ikon X).
export function KanjiSheet({ detail, onClose, children, onEnriched }: Props) {
  const [enriching, setEnriching] = useState(false);
  const [enriched, setEnriched] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [known, setKnown] = useState<boolean | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Status dikenal per kanji (tabel kanji_known) — sama seperti sheet di Aksara.
  useEffect(() => {
    let alive = true;
    setKnown(null);
    fetch('/api/kanji?known=' + encodeURIComponent(detail.char))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && typeof d.known === 'boolean') setKnown(d.known);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [detail.char]);

  // Belum lengkap = tidak ada level JLPT, komponen, atau bacaan sama sekali.
  const incomplete =
    detail.jlpt === null ||
    detail.components.length === 0 ||
    (detail.on.length === 0 && detail.kun.length === 0);

  const enrich = async () => {
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch('/api/kanji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrich: detail.char }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.detail) {
        let msg = 'Gagal melengkapi kanji';
        if (data.error) msg = data.error;
        throw new Error(msg);
      }
      setEnriched(true);
      onEnriched?.(data.detail as KanjiDetail);
    } catch (e) {
      let msg = 'Gagal melengkapi kanji';
      if (e instanceof Error) msg = e.message;
      setEnrichError(msg);
    } finally {
      setEnriching(false);
    }
  };

  const toggleKnown = async () => {
    if (known === null) return;
    const next = !known;
    setKnown(next);
    try {
      const res = await fetch('/api/kanji', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kanji: detail.char, known: next }),
      });
      if (!res.ok) throw new Error('gagal');
    } catch {
      setKnown(!next);
    }
  };

  return (
    <div className='fixed inset-x-0 top-0 z-40 h-[100dvh]' role='dialog' aria-modal='true' aria-label={'Detail ' + detail.char}>
      <div className='absolute inset-0 bg-black/40 dark:bg-black/60' onClick={onClose} />
      <div className='absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-2xl dark:bg-zinc-900'>
        <div className='mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700' />
        <div className='mb-2 flex items-center justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-2'>
            <p className='font-jp text-2xl font-bold'>{detail.char}</p>
            <button
              type='button'
              className={'chip min-h-7 shrink-0 gap-1 px-2 text-[11px] ' + (known ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-950/50 dark:text-emerald-300' : '')}
              onClick={() => void toggleKnown()}
              aria-pressed={known === true}
              disabled={known === null}
            >
              <Check className='h-3 w-3' aria-hidden />
              {known ? 'Dikenal' : 'Tandai dikenal'}
            </button>
          </div>
          <button type='button' className='btn-ghost min-h-9 shrink-0 px-3 text-xs' onClick={onClose}>
            Tutup
          </button>
        </div>
        <KanjiDetailView detail={detail} />
        {onEnriched && incomplete && !enriched ? (
          <div className='mt-3 space-y-1'>
            <button
              type='button'
              className='btn-secondary w-full'
              disabled={enriching}
              onClick={() => void enrich()}
            >
              {enriching ? <Loader2 className='h-4 w-4 animate-spin' /> : <Sparkles className='h-4 w-4' />}
              {enriching ? 'Melengkapi…' : 'Lengkapi dengan AI'}
            </button>
            {enrichError ? <p className='text-xs text-red-600 dark:text-red-400'>{enrichError}</p> : null}
          </div>
        ) : null}
        {children ? <div className='mt-3'>{children}</div> : null}
      </div>
    </div>
  );
}
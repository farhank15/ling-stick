import { useEffect, type ReactNode } from 'react';
import type { KanjiDetail } from '~/lib/kanji.server';
import { KanjiDetailView } from '~/components/KanjiDetailView';

type Props = {
  detail: KanjiDetail;
  onClose: () => void;
  children?: ReactNode;
};

// Bottom sheet yang meniru persis sheet detail di halaman Aksara/Kanji:
// nempel bawah di semua ukuran (bukan modal tengah), ada garis handle di
// tengah-atas, dan tombol Tutup teks (bukan ikon X).
export function KanjiSheet({ detail, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className='fixed inset-x-0 top-0 z-40 h-[100dvh]' role='dialog' aria-modal='true' aria-label={'Detail ' + detail.char}>
      <div className='absolute inset-0 bg-black/40 dark:bg-black/60' onClick={onClose} />
      <div className='absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-2xl dark:bg-zinc-900'>
        <div className='mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 sm:hidden dark:bg-zinc-700' />
        <div className='mb-2 flex items-center justify-between gap-2'>
          <p className='font-jp text-2xl font-bold'>{detail.char}</p>
          <button type='button' className='btn-ghost min-h-9 shrink-0 px-3 text-xs' onClick={onClose}>
            Tutup
          </button>
        </div>
        <KanjiDetailView detail={detail} />
        {children ? <div className='mt-3'>{children}</div> : null}
      </div>
    </div>
  );
}

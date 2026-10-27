import type { KanjiDetail } from '~/lib/kanji.server';
import { parseReading, radicalLabel, studyEntry, toHiragana } from '~/lib/kanji-study';
import { SpeakButton } from '~/components/SpeakButton';
import { KanjiStrokeGuide } from '~/components/KanjiStrokeGuide';

type KanjiReading = KanjiDetail['on'][number];

function ReadingGuide({ detail }: { detail: KanjiDetail }) {
  if (detail.on.length === 0 && detail.kun.length === 0) return null;
  return (
    <section className='rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800/40'>
      <div className='mb-2 flex items-baseline justify-between gap-2'>
        <p className='text-xs font-semibold text-zinc-700 dark:text-zinc-200'>Cara baca {detail.char}</p>
        <span className='text-[10px] text-zinc-400'>On = katakana · Kun = hiragana</span>
      </div>
      <div className='space-y-2.5'>
        <ReadingGroup kind='on' items={detail.on} vocab={detail.vocab} />
        <ReadingGroup kind='kun' items={detail.kun} vocab={detail.vocab} />
      </div>
      <p className='mt-2 border-t border-zinc-200 pt-1.5 text-[10px] text-zinc-400 dark:border-zinc-700'>
        Kana pudar = okurigana (ditulis kana) · awalan/akhiran = hanya dipakai menempel.
      </p>
    </section>
  );
}

function ReadingGroup({ kind, items, vocab }: { kind: 'on' | 'kun'; items: KanjiReading[]; vocab: KanjiDetail['vocab'] }) {
  if (items.length === 0) return null;
  const color = kind === 'on' ? 'text-sky-700 dark:text-sky-300' : 'text-violet-700 dark:text-violet-300';
  return (
    <div className='grid grid-cols-[2.25rem_1fr] gap-x-2'>
      <span className={'pt-0.5 text-[11px] font-bold uppercase tracking-wide ' + color}>
        {kind === 'on' ? 'On' : 'Kun'}
      </span>
      <div className='space-y-1.5'>
        {items.map((item) => (
          <ReadingRow key={item.text} kind={kind} item={item} vocab={vocab} />
        ))}
      </div>
    </div>
  );
}

function ReadingRow({ kind, item, vocab }: { kind: 'on' | 'kun'; item: KanjiReading; vocab: KanjiDetail['vocab'] }) {
  const p = parseReading(item.text);
  const example = vocab.find((v) => v.reading.includes(toHiragana(p.stem)));
  const note = p.affix
    ? p.affix === 'prefix'
      ? 'menempel di depan kanji lain'
      : 'menempel di belakang kanji lain'
    : p.okurigana
      ? 'bagian ' + p.okurigana + ' ditulis kana'
      : kind === 'on'
        ? 'dipakai di kata majemuk'
        : 'bisa berdiri sendiri';
  return (
    <div className='flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5'>
      <span className='font-jp text-[17px] leading-none font-semibold tracking-wide'>
        {p.affix === 'suffix' ? <span className='text-zinc-400'>-</span> : null}
        {p.stem}
        {p.okurigana ? <span className='font-normal text-zinc-400'>{p.okurigana}</span> : null}
        {p.affix === 'prefix' ? <span className='text-zinc-400'>-</span> : null}
      </span>
      {item.primary ? (
        <span className='badge bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300'>inti</span>
      ) : null}
      <span className='text-[11px] text-zinc-500 dark:text-zinc-400'>{note}</span>
      {example ? (
        <span className='text-[11px] text-zinc-400'>
          · {example.word}
          <span className='font-jp'>（{example.reading}）</span>
        </span>
      ) : null}
    </div>
  );
}

export function KanjiDetailView({ detail }: { detail: KanjiDetail }) {
  const radical = detail.radical ?? studyEntry(detail.char)?.radical;
  return (
    <div className='space-y-3'>
      <div className='flex items-start gap-4'>
        {detail.svg ? (
          <div
            className='h-24 w-24 shrink-0 rounded-xl border border-zinc-200 p-1 dark:border-zinc-800 [&>svg]:h-full [&>svg]:w-full'
            dangerouslySetInnerHTML={{ __html: detail.svg }}
          />
        ) : (
          <KanjiStrokeGuide char={detail.char} />
        )}
        <div className='min-w-0'>
          <p className='font-jp text-3xl font-bold'>{detail.char}</p>
          <p className='text-sm text-zinc-600 dark:text-zinc-300'>{detail.meaningId}</p>
          <p className='mt-1 text-[11px] text-zinc-400'>
            {detail.strokes} goresan
            {detail.grade ? ` · kelas ${detail.grade}` : ''}
            {detail.freq ? ` · frek #${detail.freq}` : ''}
            {detail.jlpt && ` · N${detail.jlpt}`}
          </p>
        </div>
      </div>
      <ReadingGuide detail={detail} />
      {radical ? (
        <p className='text-xs text-zinc-500'>
          <span className='label mr-2'>Radikal</span>
          {radicalLabel(radical)}
          <span className='ml-1 text-zinc-400'>— pola yang sama dipakai kanji lain</span>
        </p>
      ) : null}
      {detail.components.length > 0 ? (
        <p className='text-xs text-zinc-500'>
          <span className='label mr-2'>Komponen</span>
          {detail.components.join(' + ')}
        </p>
      ) : null}
      {detail.vocab.length > 0 ? (
        <div className='space-y-1.5'>
          <p className='label'>Contoh kata</p>
          {detail.vocab.map((v, i) => (
            <div key={i} className='flex items-center gap-2 text-sm'>
              <span className='font-jp font-semibold'>{v.word}</span>
              <span className='font-jp text-xs text-zinc-400'>{v.reading}</span>
              <span className='min-w-0 flex-1 truncate text-xs text-zinc-500'>{v.gloss}</span>
              <SpeakButton
                text={v.word}
                buttonClassName='shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800'
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

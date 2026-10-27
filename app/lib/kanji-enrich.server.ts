import { z } from 'zod';
import { chatJson } from './llm.server';
import type { KanjiDetail } from './kanji.server';

// Pelengkap data kanji yang belum ada di tabel referensi (mis. N3/N2/N1).
// Sumber: LLM (Groq -> Poolside) + cache llm_cache, jadi generate ulang
// untuk kanji yang sama tidak memanggil model lagi.

const enrichSchema = z.object({
  meaningId: z.string().trim().min(1).max(300),
  on: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  kun: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  jlpt: z.number().int().min(1).max(5).nullable().default(null),
  grade: z.number().int().min(1).max(9).nullable().default(null),
  radical: z.string().trim().min(1).max(4).nullable().default(null),
  components: z.array(z.string().trim().min(1).max(4)).max(10).default([]),
  strokes: z.number().int().min(1).max(40).nullable().default(null),
  vocab: z
    .array(
      z.object({
        word: z.string().trim().min(1).max(20),
        reading: z.string().trim().max(30),
        gloss: z.string().trim().min(1).max(120),
      }),
    )
    .max(5)
    .default([]),
});

const SYSTEM = [
  'Kamu penyusun referensi kanji Jepang. Jawab HANYA JSON valid, tanpa markdown.',
  'Skema: { meaningId: arti bahasa Indonesia dipisah titik koma, maksimal 5;',
  '  on: bacaan on katakana[]; kun: bacaan kun hiragana[], okurigana dipisah titik;',
  '  jlpt: 1-5 atau null (5 termudah); grade: 1-9 atau null;',
  '  radical: satu karakter radikal; components: karakter komponen penyusun[];',
  '  strokes: jumlah goresan atau null; vocab: {word, reading, gloss} maksimal 3 }',
  'Aturan: hanya data nyata, jangan mengarang bacaan. jlpt = level JLPT komunitas',
  '(1 tersulit, 5 termudah). components = bagian visual/struktural, bukan radikal saja.',
].join('\n');

let strokeCache: Record<string, number[][][]> | null = null;

async function localStrokeCount(char: string): Promise<number | null> {
  if (!strokeCache) {
    try {
      const mod = await import('../../data/textbook-strokes.json');
      const data = mod.default as { strokes?: Record<string, number[][][]> };
      strokeCache = data.strokes ?? {};
    } catch {
      strokeCache = {};
    }
  }
  const strokes = strokeCache[char];
  return strokes ? strokes.length : null;
}

export async function enrichKanji(
  char: string,
): Promise<{ detail: KanjiDetail; cached: boolean; provider: string }> {
  const { data, cached, provider } = await chatJson(
    SYSTEM,
    'Kanji: ' + char,
    enrichSchema,
    'kanji-enrich:v1',
    'kanji-enrich:v1|' + char,
  );

  const strokes = (await localStrokeCount(char)) ?? data.strokes ?? 0;
  const components = data.components.slice(0, 8);
  if (data.radical && !components.includes(data.radical)) components.unshift(data.radical);

  const detail: KanjiDetail = {
    char,
    meaningId: data.meaningId,
    strokes,
    grade: data.grade,
    freq: null,
    jlpt: data.jlpt,
    svg: null,
    on: data.on.map((text, i) => ({ text, primary: i === 0 })),
    kun: data.kun.map((text, i) => ({ text, primary: i === 0 })),
    components,
    vocab: data.vocab.slice(0, 5),
    radical: data.radical,
  };
  return { detail, cached, provider };
}
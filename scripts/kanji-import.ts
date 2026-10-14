/**
 * Import data/kanji-n5.json ke DB (upsert). Validasi anti-asal SEBELUM tulis:
 * strokes>0, ada bacaan, komponen CJK valid, tiap vocab mengandung kanjinya,
 * SVG mengandung <svg. Gagal validasi = abort total (tanpa tulis parsial).
 * Usage: npm run kanji:import
 */
import { readFileSync } from "node:fs";
import { db, ensureDbReady } from "../app/lib/db/client.server";
import { kanji, kanjiReadings, kanjiComponents, kanjiVocab } from "../app/lib/db/schema";
import { sql } from "drizzle-orm";

const CJK = (ch: string) => {
  const cp = ch.codePointAt(0)!;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x2e80 && cp <= 0x2eff) || // CJK radicals supplement (⺊⺡…)
    (cp >= 0x2f00 && cp <= 0x2fdf) || // Kangxi radicals
    cp === 0x3005
  );
};

function fail(msg: string): never {
  console.error(`VALIDASI GAGAL: ${msg}`);
  process.exit(1);
}

async function main() {
  await ensureDbReady();
  const raw = JSON.parse(readFileSync("data/kanji-n5.json", "utf8")) as {
    kanji: {
      char: string; meaning_id: string; strokes: number; grade: number | null;
      freq: number | null; jlpt: number; on: string[]; kun: string[];
      components: string[]; svg: string;
      vocab: { word: string; reading: string; gloss: string }[];
    }[];
  };
  if (!raw.kanji?.length) fail("data/kanji-n5.json kosong — jalankan npm run kanji:seed dulu");

  // ── Validasi total dulu ──
  const seen = new Set<string>();
  for (const k of raw.kanji) {
    if (!k.char || !CJK(k.char)) fail(`char tak valid: ${k.char}`);
    if (seen.has(k.char)) fail(`duplikat: ${k.char}`);
    seen.add(k.char);
    if (!k.meaning_id?.trim()) fail(`${k.char}: meaning_id kosong`);
    if (!(k.strokes > 0)) fail(`${k.char}: strokes kosong`);
    if (!k.on?.length && !k.kun?.length) fail(`${k.char}: tanpa bacaan`);
    if (!k.svg?.includes("<svg")) fail(`${k.char}: SVG hilang`);
    for (const c of k.components ?? []) if (!CJK(c)) fail(`${k.char}: komponen tak valid ${c}`);
    for (const v of k.vocab ?? []) {
      if (!v.word.includes(k.char)) fail(`${k.char}: vocab "${v.word}" tak mengandung kanjinya`);
      if (!v.reading?.trim() || !v.gloss?.trim()) fail(`${k.char}: vocab "${v.word}" tanpa reading/gloss`);
    }
  }

  // ── Tulis (idempotent, upsert per char) ──
  for (const k of raw.kanji) {
    await db.insert(kanji).values({
      char: k.char, meaningId: k.meaning_id, strokes: k.strokes,
      grade: k.grade, freq: k.freq, jlpt: k.jlpt ?? 5, svg: k.svg,
    }).onConflictDoUpdate({
      target: kanji.char,
      set: {
        meaningId: k.meaning_id, strokes: k.strokes, grade: k.grade,
        freq: k.freq, jlpt: k.jlpt ?? 5, svg: k.svg,
      },
    });
    await db.delete(kanjiReadings).where(sql`${kanjiReadings.kanji} = ${k.char}`);
    const readings: { kanji: string; type: string; reading: string; primaryPick: number }[] = [];
    (k.on ?? []).forEach((r, i) => readings.push({ kanji: k.char, type: "on", reading: r, primaryPick: i === 0 ? 1 : 0 }));
    (k.kun ?? []).forEach((r, i) => readings.push({ kanji: k.char, type: "kun", reading: r, primaryPick: i === 0 ? 1 : 0 }));
    if (readings.length) await db.insert(kanjiReadings).values(readings).onConflictDoNothing();
    await db.delete(kanjiComponents).where(sql`${kanjiComponents.kanji} = ${k.char}`);
    if (k.components?.length) {
      await db.insert(kanjiComponents).values(k.components.map((c) => ({ kanji: k.char, component: c }))).onConflictDoNothing();
    }
    await db.delete(kanjiVocab).where(sql`${kanjiVocab.kanji} = ${k.char}`);
    if (k.vocab?.length) {
      await db.insert(kanjiVocab).values(
        k.vocab.map((v) => ({ kanji: k.char, word: v.word, reading: v.reading, gloss: v.gloss, common: 1 })),
      );
    }
  }
  console.log(`kanji:import OK — ${raw.kanji.length} kanji`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

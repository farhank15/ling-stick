/**
 * Import data/kanji-n5.json + data/kanji-n4.json ke DB (upsert). Validasi
 * anti-asal SEBELUM tulis: strokes>0, ada bacaan, komponen CJK valid, tiap
 * vocab mengandung kanjinya, SVG mengandung <svg. Gagal validasi = abort total.
 * Usage: npm run kanji:import
 */
import { existsSync, readFileSync } from "node:fs";
import { db, ensureDbReady } from "../app/lib/db/client.server";
import { kanji, kanjiReadings, kanjiComponents, kanjiVocab } from "../app/lib/db/schema";
import { sql } from "drizzle-orm";

type KanjiEntry = {
  char: string;
  meaning_id: string;
  strokes: number;
  grade: number | null;
  freq: number | null;
  jlpt: number;
  on: string[];
  kun: string[];
  components: string[];
  svg: string;
  vocab: { word: string; reading: string; gloss: string }[];
};

type KanjiFile = { path: string; kanji: KanjiEntry[] };

const FILES = ["data/kanji-n5.json", "data/kanji-n4.json"];

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

  // ── Muat semua level yang sudah di-seed ──
  const files: KanjiFile[] = [];
  for (const path of FILES) {
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, "utf8")) as { kanji?: KanjiEntry[] };
    if (!raw.kanji?.length) fail(`${path} kosong — jalankan npm run kanji:seed dulu`);
    files.push({ path, kanji: raw.kanji });
  }
  if (files.length === 0) fail("tidak ada data/kanji-n5.json atau data/kanji-n4.json");

  // ── Validasi total dulu ──
  const seen = new Set<string>();
  for (const file of files) {
    for (const k of file.kanji) {
      if (!k.char || !CJK(k.char)) fail(`char tak valid: ${k.char}`);
      if (seen.has(k.char)) fail(`duplikat lintas level: ${k.char}`);
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
  }

  // ── Level final ikut data/kanji-levels.json (rekonsiliasi by-riset) ──
  const levelOf: Record<string, number> = {};
  try {
    const levels = JSON.parse(readFileSync("data/kanji-levels.json", "utf8")) as {
      levels: Record<string, { char: string }[]>;
    };
    for (const [lv, arr] of Object.entries(levels.levels ?? {})) {
      const n = Number(lv.slice(1));
      if (!Number.isInteger(n)) continue;
      for (const e of arr ?? []) levelOf[e.char] = n;
    }
  } catch {
    /* belum ada — pakai jlpt seed */
  }

  // ── Tulis (idempotent, upsert per char) ──
  for (const file of files) {
    for (const k of file.kanji) {
      const finalJlpt = levelOf[k.char] ?? k.jlpt ?? 5;
      await db.insert(kanji).values({
        char: k.char, meaningId: k.meaning_id, strokes: k.strokes,
        grade: k.grade, freq: k.freq, jlpt: finalJlpt, svg: k.svg,
      }).onConflictDoUpdate({
        target: kanji.char,
        set: {
          meaningId: k.meaning_id, strokes: k.strokes, grade: k.grade,
          freq: k.freq, jlpt: finalJlpt, svg: k.svg,
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
  }
  const total = files.reduce((n, f) => n + f.kanji.length, 0);
  console.log(`kanji:import OK — ${total} kanji (${files.map((f) => `${f.path.split("/").pop()}: ${f.kanji.length}`).join(", ")})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

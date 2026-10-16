/**
 * Impor deck JLPT N5 dari OpenJLPT (CC-BY-SA-4.0) ke menu Decks:
 * - JLPT N5 Kosakata (674 kata + contoh + furigana)
 * - JLPT N5 Kanji (84 kanji)
 * - JLPT N5 Tata Bahasa (81 pola + contoh)
 * Arti masih Inggris → needsId=1 (antrean terjemahan ID).
 * Usage: npm run deck:openjlpt-n5  (data di /tmp/openjlpt/*.json)
 */
import { readFileSync } from "node:fs";
import { db, ensureDbReady } from "../app/lib/db/client.server";
import { importDeck, type ImportRow } from "../app/lib/decks.server";

const DIR = "/tmp/openjlpt";
const LICENSE = "CC-BY-SA-4.0 (OpenJLPT + JMdict/Tatoeba)";
const SOURCE = "OpenJLPT";

/** {漢字|かんじ} → かんじ (kana penuh kalimat). */
function furiToKana(furigana: string): string {
  return furigana.replace(/\{([^|}]+)\|([^}]+)\}/g, "$2");
}

type Vocab = {
  word: string;
  reading: string;
  romaji: string;
  meanings: string[];
  level: string;
  pos: string[];
  examples: { ja: string; furigana: string; en: string }[];
};

type Kanji = {
  character: string;
  strokes: number;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  level: string;
};

type Grammar = {
  pattern: string;
  romaji: string;
  meaning: string;
  formation: string;
  tags: string[];
  notes: string;
  examples: { ja: string; furigana: string; en: string }[];
};

async function main() {
  await ensureDbReady();
  void db;

  const vocab: Vocab[] = JSON.parse(readFileSync(`${DIR}/vocab-n5.json`, "utf8"));
  const vRows: ImportRow[] = vocab.map((v) => ({
    text: v.word,
    reading: v.romaji ? `${v.reading} (${v.romaji})` : v.reading,
    meaningId: v.meanings.join("; "),
    type: "word",
    level: "N5",
    extra: { pos: v.pos.join(","), level: v.level },
    examples: (v.examples ?? []).slice(0, 2).map((e) => ({
      en: e.ja,
      id: e.en,
      kana: furiToKana(e.furigana ?? e.ja),
    })),
  }));
  const v = await importDeck(
    { name: "JLPT N5 Kosakata", lang: "ja", level: "N5", source: SOURCE, license: LICENSE },
    vRows,
  );
  console.log(`kosakata: masuk ${v.imported}, lewat ${v.skipped}`);

  const kanji: Kanji[] = JSON.parse(readFileSync(`${DIR}/kanji-n5.json`, "utf8"));
  const kRows: ImportRow[] = kanji.map((k) => ({
    text: k.character,
    reading: [...k.onyomi, ...k.kunyomi].join("・") || undefined,
    meaningId: k.meanings.join("; "),
    type: "kanji",
    level: "N5",
    extra: { strokes: String(k.strokes) },
  }));
  const k = await importDeck(
    { name: "JLPT N5 Kanji", lang: "ja", level: "N5", source: SOURCE, license: LICENSE },
    kRows,
  );
  console.log(`kanji: masuk ${k.imported}, lewat ${k.skipped}`);

  const grammar: Grammar[] = JSON.parse(readFileSync(`${DIR}/grammar-n5.json`, "utf8"));
  const gRows: ImportRow[] = grammar.map((g) => ({
    text: g.pattern,
    reading: g.romaji || undefined,
    meaningId: g.meaning,
    type: "grammar",
    level: "N5",
    extra: {
      ...(g.formation ? { formation: g.formation } : {}),
      ...(g.tags.length > 0 ? { tags: g.tags.join(",") } : {}),
      ...(g.notes ? { notes: g.notes.slice(0, 300) } : {}),
    },
    examples: (g.examples ?? []).slice(0, 2).map((e) => ({
      en: e.ja,
      id: e.en,
      kana: furiToKana(e.furigana ?? e.ja),
    })),
  }));
  const g = await importDeck(
    { name: "JLPT N5 Tata Bahasa", lang: "ja", level: "N5", source: SOURCE, license: LICENSE },
    gRows,
  );
  console.log(`grammar: masuk ${g.imported}, lewat ${g.skipped}`);
  console.log("deck:openjlpt-n5 OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

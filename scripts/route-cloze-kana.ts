/**
 * Isi kana + romaji soal cloze rute yang masih kosong (batch LLM, ___ dipertahankan).
 * Output ditulis kembali ke content/route — REVIEW git diff sebelum commit.
 * Usage: npm run route:cloze-kana
 */
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import { z } from "zod";
import { ensureDbReady } from "../app/lib/db/client.server";
import { chatJson } from "../app/lib/llm.server";

const outSchema = z.object({
  items: z.array(z.object({
    idx: z.number(),
    kana: z.string(),
    romaji: z.string(),
  })),
});

const SYSTEM = `Kamu diberi kalimat bahasa Jepang bernomor berisi "___" (bagian rumpang, JANGAN diisi/diubah, pertahankan persis di posisi sama).
Keluarkan untuk tiap kalimat:
- kana: kalimat yang sama dengan SEMUA kanji diubah ke hiragana (___ tetap).
- romaji: Hepburn tanpa macron dari kalimat kana itu (___ tetap).
Jawab HANYA JSON: {"items":[{"idx":<nomor>,"kana":"...","romaji":"..."}]}.`;

async function main() {
  await ensureDbReady();
  const files = globSync("content/route/n5/*.md").sort();
  let filled = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // Kumpulkan front yang belum punya kana: (baris { front..kana_hint..explain_id } tanpa kana:)
    const blocks = [...src.matchAll(/\{ front: "(.*?)", answer: "(.*?)", distractors: \[(.*?)\], kana_hint: "(.*?)", explain_id: "(.*?)" \}/g)];
    const need = blocks.filter((b) => !b[0].includes("kana:"));
    if (need.length === 0) continue;
    const fronts = need.map((b) => b[1]!);
    const user = fronts.map((x, i) => `${i + 1}. ${x}`).join("\n");
    const { data } = await chatJson(SYSTEM, user, outSchema, "cloze-kana:v2", `${f}|${user}`);
    const byIdx = new Map(data.items.map((x) => [x.idx, x]));
    let out = src;
    need.forEach((b, i) => {
      const got = byIdx.get(i + 1);
      if (!got || !got.kana) {
        console.log(`  SKIP (LLM tak balikin): ${b[1]}`);
        return;
      }
      const kana = got.kana.replace(/"/g, "");
      const romaji = got.romaji.replace(/"/g, "");
      out = out.replace(
        b[0],
        b[0].replace(`explain_id: "${b[5]!}"`, `explain_id: "${b[5]!}", kana: "${kana}", romaji: "${romaji}"`),
      );
      filled++;
    });
    writeFileSync(f, out);
    console.log(`${f}: +${need.length} diproses`);
  }
  console.log(`route:cloze-kana OK — terisi ${filled}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

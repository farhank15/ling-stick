/**
 * Kana untuk opsi jawaban cloze (165 string berkanji, termasuk distraktor salah
 * konjugasi — dibaca mekanis apa adanya). Output: data/route-option-kana.json.
 * REVIEW diff sebelum commit. Usage: npm run route:option-kana
 */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { ensureDbReady } from "../app/lib/db/client.server";
import { chatJson } from "../app/lib/llm.server";

const outSchema = z.object({
  items: z.array(z.object({ idx: z.number(), kana: z.string() })),
});

const SYSTEM = `Kamu diberi string bahasa Jepang bernomor (bisa bentuk salah/typo konjugasi — baca mekanis apa adanya, JANGAN betulkan).
Keluarkan kana (hiragana) untuk tiap string, karakter non-kanji dipertahankan.
Jawab HANYA JSON: {"items":[{"idx":<nomor>,"kana":"..."}]}.`;

async function main() {
  await ensureDbReady();
  const { loadAllSteps } = await import("../app/lib/route.server");
  const opts = new Set<string>();
  for (const { step } of loadAllSteps()) {
    for (const c of step.cloze_items) {
      opts.add(c.answer);
      for (const d of c.distractors) opts.add(d);
    }
  }
  const need = [...opts].filter((o) => /[\u4e00-\u9faf]/.test(o));
  console.log(`opsi berkanji: ${need.length}`);
  const map: Record<string, string> = {};
  const BATCH = 55;
  for (let i = 0; i < need.length; i += BATCH) {
    const chunk = need.slice(i, i + BATCH);
    const user = chunk.map((x, j) => `${j + 1}. ${x}`).join("\n");
    const { data } = await chatJson(SYSTEM, user, outSchema, "opt-kana:v1", `opts|${i}|${user}`);
    for (const it of data.items) {
      const orig = chunk[it.idx - 1];
      if (orig && it.kana) map[orig] = it.kana.replace(/"/g, "");
    }
    console.log(`batch ${i / BATCH + 1}: ${Object.keys(map).length}/${need.length}`);
  }
  writeFileSync("data/route-option-kana.json", JSON.stringify(map, null, 1) + "\n");
  console.log("route:option-kana OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

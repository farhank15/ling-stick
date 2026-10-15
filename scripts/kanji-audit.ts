/**
 * Audit silang data/kanji-n5.json terhadap sumber INDEPENDEN (bukan seed asal):
 * 1. on/kun + strokes vs OpenJLPT CSV (/tmp/kanji-*.csv, CC-BY-SA).
 * 2. Komponen: harus CJK valid, tanpa kana/latin.
 * 3. Tiap vocab: cek ke Jisho API — reading harus cocok dengan entri Jisho.
 * Exit 1 bila ada mismatch (daftar semua, bukan berhenti di pertama).
 * Usage: npm run kanji:audit
 */
import { readFileSync } from "node:fs";

const kanaOnly = (s: string) => s.replace(/[^\u3040-\u30ffー]/g, "");
const kataOnly = (s: string) => s.replace(/[^\u30a1-\u30f6ー]/g, "");

type Vocab = { word: string; reading: string; gloss: string; gloss_en?: string };
type K = {
  char: string; meaning_id: string; strokes: number; on: string[]; kun: string[];
  components: string[]; vocab: Vocab[];
};

function parseCsv(path: string): Map<string, Record<string, string>> {
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  const head = lines[0]!.split(",");
  const out = new Map<string, Record<string, string>>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    // Kolom meanings/words mengandung koma — parse: ambil field awal s/d nanori,
    // sisanya gabung. Format: character,level,strokes,grade,freq,radical,radical_number,onyomi,kunyomi,nanori,meanings,words,supplementary
    const parts = line.split(",");
    const rec: Record<string, string> = {};
    head.forEach((h, n) => {
      rec[h] = n < 10 ? (parts[n] ?? "") : parts.slice(n).join(",");
    });
    out.set(rec.character, rec);
  }
  return out;
}

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "LingStick-audit/1.0" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function main() {
  const data = JSON.parse(readFileSync("data/kanji-n5.json", "utf8")) as { kanji: K[] };
  const ojl = new Map<string, Record<string, string>>();
  for (const f of ["kanji-n5", "kanji-n4", "kanji-n3", "kanji-n2", "kanji-n1"]) {
    try {
      for (const [k, v] of parseCsv(`/tmp/${f}.csv`)) if (!ojl.has(k)) ojl.set(k, v);
    } catch { /* file tak ada — lewati */ }
  }
  const issues: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) issues.push(msg); };

  for (const k of data.kanji) {
    const ref = ojl.get(k.char);
    if (!ref) {
      issues.push(`${k.char}: tak ada di OpenJLPT (cek manual)`);
      continue;
    }
    // Strokes
    ok(Number(ref.strokes) === k.strokes, `${k.char}: strokes kita ${k.strokes} vs OJL ${ref.strokes}`);
    // On: bandingkan inti katakana (buang spasi/titik)
    const refOn = new Set((ref.onyomi ?? "").split(";").map((s) => kataOnly(s)).filter(Boolean));
    const ourOn = new Set(k.on.map(kataOnly).filter(Boolean));
    for (const r of ourOn) ok(refOn.has(r), `${k.char}: on "${r}" tak ada di OJL (${[...refOn].join("/")})`);
    for (const r of refOn) {
      if (!ourOn.has(r)) issues.push(`${k.char}: on OJL "${r}" hilang dari data kita (tambah?)`);
    }
    // Kun: bandingkan inti hiragana (buang -, ., okurigana tetap)
    const refKun = new Set((ref.kunyomi ?? "").split(";").map((s) => kanaOnly(s)).filter(Boolean));
    const ourKun = new Set(k.kun.map(kanaOnly).filter(Boolean));
    for (const r of ourKun) ok(refKun.has(r), `${k.char}: kun "${r}" tak ada di OJL (${[...refKun].join("/")})`);
    // Komponen
    for (const c of k.components ?? []) {
      const cp = c.codePointAt(0)!;
      const valid =
        (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
        (cp >= 0x2e80 && cp <= 0x2eff) || (cp >= 0x2f00 && cp <= 0x2fdf) || cp === 0x3005;
      ok(valid, `${k.char}: komponen tak valid "${c}" (U+${cp.toString(16)})`);
      ok(c !== k.char, `${k.char}: komponen = dirinya sendiri`);
    }
    // Vocab reading: harus kana murni
    for (const v of k.vocab ?? []) {
      ok(/^[ぁ-ゔァ-ヴー・\s]+$/.test(v.reading), `${k.char}: reading vocab "${v.word}" bukan kana murni: ${v.reading}`);
    }
  }

  // Vocab vs Jisho (satu per satu, sopan).
  let checked = 0, mism = 0;
  for (const k of data.kanji) {
    for (const v of k.vocab ?? []) {
      try {
        const j = await fetchJson(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(v.word)}`);
        const readings = new Set<string>();
        for (const d of j.data ?? []) {
          for (const e of d.japanese ?? []) {
            if (e.word === v.word && e.reading) readings.add(e.reading);
          }
        }
        checked++;
        if (readings.size > 0 && ![...readings].some((r) => kanaOnly(r) === kanaOnly(v.reading))) {
          mism++;
          issues.push(`${k.char}: vocab "${v.word}" reading kita "${v.reading}" vs Jisho (${[...readings].join("/")})`);
        } else if (readings.size === 0) {
          issues.push(`${k.char}: vocab "${v.word}" tak ketemu di Jisho (cek manual)`);
        }
      } catch (e) {
        issues.push(`${k.char}: Jisho gagal untuk "${v.word}" (${e instanceof Error ? e.message : e})`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`Audit: ${data.kanji.length} kanji, ${checked} vocab dicek Jisho, mismatch reading: ${mism}`);
  if (issues.length) {
    console.log(`\nTEMUAN (${issues.length}):\n- ` + issues.join("\n- "));
    process.exit(1);
  }
  console.log("BERSIH — tidak ada mismatch.");
}

main().catch((e) => { console.error(e); process.exit(1); });

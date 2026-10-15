/**
 * Seed kanji N5 dari dataset kanonis (BUKAN generate asal):
 * - Bacaan/arti EN/stroke/grade/freq/jlpt: kanjiapi.dev (turunan KANJIDIC2/EDRDG, CC BY-SA)
 * - Komponen: cjkvi-ids (file lokal /tmp/ids.txt ATAU IDS_URL)
 * - Stroke SVG: KanjiVG via GitHub raw (CC BY-SA 3.0, Ulrich Apel)
 * - Contoh kata: Jisho API (JMdict+Tatoeba) — hanya kata umum mengandung kanji
 * - Arti Indonesia: kurasi manual (GLOSSES) + glos kata via LLM (sekali, direview)
 *
 * Atribusi wajib tampil di UI (Settings/Aksara).
 * Usage: GROQ_API_KEY=xxx IDS=/tmp/ids.txt npm run kanji:seed
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const GLOSSES: Record<string, string> = {
  日: "hari; matahari", 一: "satu", 二: "dua", 三: "tiga", 四: "empat",
  五: "lima", 六: "enam", 七: "tujuh", 八: "delapan", 九: "sembilan",
  十: "sepuluh", 百: "ratus", 千: "ribu", 万: "puluh ribu", 円: "yen; bundar",
  時: "jam; waktu", 間: "antara; interval", 分: "menit; bagian", 午: "tengah hari",
  前: "sebelum; depan", 後: "sesudah; belakang", 毎: "setiap", 週: "minggu",
  年: "tahun", 月: "bulan", 火: "api", 水: "air", 木: "pohon",
  金: "emas; uang", 土: "tanah", 天: "langit", 気: "semangat; energi",
  雨: "hujan", 雪: "salju", 花: "bunga", 山: "gunung", 川: "sungai",
  田: "sawah", 空: "langit; kosong", 海: "laut", 外: "luar", 国: "negara",
  人: "orang", 男: "laki-laki", 女: "perempuan", 子: "anak", 父: "ayah",
  母: "ibu", 友: "teman", 家: "rumah; keluarga", 族: "keluarga; suku",
  学: "belajar", 校: "sekolah", 先: "dulu; depan", 生: "hidup; lahir",
  語: "bahasa", 文: "kalimat", 字: "huruf", 書: "tulis", 読: "baca",
  話: "bicara", 聞: "dengar", 見: "lihat", 言: "berkata", 車: "mobil",
  電: "listrik", 駅: "stasiun", 道: "jalan", 社: "perusahaan", 店: "toko",
  銀: "perak; bank", 病: "sakit", 院: "gedung; institusi", 休: "istirahat",
  行: "pergi", 来: "datang", 帰: "pulang", 飲: "minum", 食: "makan",
  買: "beli", 物: "benda", 牛: "sapi", 魚: "ikan", 鳥: "burung",
  肉: "daging", 何: "apa", 名: "nama", 曜: "hari (pekan)", 上: "atas",
  下: "bawah", 中: "dalam", 右: "kanan", 左: "kiri", 東: "timur",
  西: "barat", 南: "selatan", 北: "utara", 高: "tinggi; mahal", 安: "murah; aman",
  新: "baru", 古: "tua; kuno", 長: "panjang; pemimpin", 明: "terang",
  近: "dekat", 強: "kuat", 暑: "panas (cuaca)", 寒: "dingin (cuaca)",
  本: "buku; asal", 白: "putih", 大: "besar", 小: "kecil", 今: "sekarang",
  入: "masuk", 出: "keluar", 半: "setengah", 誰: "siapa",
};

const N5 = Object.keys(GLOSSES);

type Vocab = { word: string; reading: string; gloss_en: string; gloss: string };

async function fetchJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": "LingStick-seed/1.0" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function hexOf(ch: string): string {
  return ch.codePointAt(0)!.toString(16).padStart(5, "0");
}

/** Ambil komponen CJK dari baris IDS cjkvi (semua char CJK kecuali dirinya). */
function componentsOf(idsLine: string, self: string): string[] {
  const seen = new Set<string>();
  for (const ch of idsLine) {
    if (ch === self || ch === "\t" || ch === "U" || ch === "+" || /[0-9A-F]/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    const isCjk =
      (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x2e80 && cp <= 0x2eff) || (cp >= 0x3000 && cp <= 0x303f) ||
      (cp >= 0xf900 && cp <= 0xfaff) || cp === 0x3005;
    if (isCjk) seen.add(ch);
  }
  return [...seen];
}

async function main() {
  const idsPath = process.env.IDS ?? "/tmp/ids.txt";
  const idsText = readFileSync(idsPath, "utf8");
  const idsByChar = new Map<string, string>();
  for (const line of idsText.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const seq = line.slice(tab + 1);
    const ch = [...seq][0];
    if (ch && !idsByChar.has(ch)) idsByChar.set(ch, line);
  }

  const out: any[] = [];
  const errors: string[] = [];
  for (const ch of N5) {
    try {
      const info = await fetchJson(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(ch)}`);
      if (!info.stroke_count || (!info.on_readings?.length && !info.kun_readings?.length)) {
        throw new Error("data bacaan/stroke kosong");
      }
      const svgUrl = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hexOf(ch)}.svg`;
      const svgRes = await fetch(svgUrl, { headers: { "User-Agent": "LingStick-seed/1.0" } });
      const svgRaw = svgRes.ok ? await svgRes.text() : "";
      // Bersihkan prolog XML + DOCTYPE di sumber (defense in depth — render
      // juga membersihkan via cleanSvg, tapi DB sebaiknya sudah bersih).
      const svg = svgRaw
        .replace(/<\?xml[\s\S]*?\?>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<!DOCTYPE[\s\S]*?\]>/g, "")
        .trim();
      if (!svg.includes("<svg")) throw new Error("SVG KanjiVG gagal");
      const idsLine = idsByChar.get(ch) ?? "";
      const components = componentsOf(idsLine, ch);

      // Kosakata: Jisho, saring kata umum mengandung kanji, maks 3.
      const jisho = await fetchJson(
        `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(ch + " #jlpt-n5")}`,
      );
      const vocab: Vocab[] = [];
      for (const d of jisho.data ?? []) {
        if (vocab.length >= 3) break;
        const j = (d.japanese ?? [])[0];
        if (!j?.word?.includes(ch) || !j?.reading) continue;
        const gloss_en = (d.senses?.[0]?.english_definitions ?? []).slice(0, 2).join("; ");
        if (!gloss_en) continue;
        vocab.push({ word: j.word, reading: j.reading, gloss_en, gloss: "" });
      }
      // Fallback tanpa tag N5 bila kosong.
      if (vocab.length === 0) {
        const j2 = await fetchJson(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(ch)}`);
        for (const d of j2.data ?? []) {
          if (vocab.length >= 3) break;
          if (!d.is_common) continue;
          const j = (d.japanese ?? []).find((x: any) => x.word?.includes(ch));
          if (!j?.word || !j?.reading) continue;
          const gloss_en = (d.senses?.[0]?.english_definitions ?? []).slice(0, 2).join("; ");
          if (!gloss_en) continue;
          vocab.push({ word: j.word, reading: j.reading, gloss_en, gloss: "" });
        }
      }
      out.push({
        char: ch,
        meaning_id: GLOSSES[ch],
        strokes: info.stroke_count,
        grade: info.grade ?? null,
        freq: info.freq_mainichi_shinbun ?? null,
        jlpt: info.jlpt ?? 5,
        on: info.on_readings ?? [],
        kun: info.kun_readings ?? [],
        components,
        svg,
        vocab,
      });
      console.log(`ok ${ch} (${out.length}/${N5.length})`);
      await new Promise((r) => setTimeout(r, 250)); // sopan ke API publik
    } catch (e) {
      errors.push(`${ch}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Glos kata → Indonesia via LLM (sekali, batch) — bisa direview di JSON.
  const groq = process.env.GROQ_API_KEY ?? "";
  if (groq && out.length) {
    const items: { i: number; k: number; text: string }[] = [];
    out.forEach((k, i) => k.vocab.forEach((v: Vocab, kk: number) => items.push({ i, k: kk, text: `${v.word} = ${v.gloss_en}` })));
    // Batch 60 biar respons tak kepotong.
    for (let b = 0; b < items.length; b += 60) {
      const chunk = items.slice(b, b + 60);
      await translateChunk(chunk);
    }
  }

  async function translateChunk(chunk: { i: number; k: number; text: string }[]) {
    const groqKey = process.env.GROQ_API_KEY ?? "";
    const prompt = `Terjemahkan glos kosakata Jepang berikut ke Bahasa Indonesia kasual SINGKAT (maks 5 kata per glos). Balas HANYA JSON object {"glosses": [...]} dengan urutan sama, tanpa penjelasan.\n${chunk.map((x) => `${x.i}.${x.k} ${x.text}`).join("\n")}`;
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });
      const data = await r.json();
      const rawText: string = data.choices?.[0]?.message?.content ?? "";
      // Model kadang bungkus { "glosses": [...] } atau tambah prose — ekstrak array pertama.
      let arr: unknown = null;
      try {
        const parsed = JSON.parse(rawText);
        arr = Array.isArray(parsed) ? parsed : parsed.glosses ?? parsed.result ?? null;
      } catch {
        const m = rawText.match(/\[[\s\S]*\]/);
        if (m) arr = JSON.parse(m[0]);
      }
      if (!Array.isArray(arr)) throw new Error("respons bukan array");
      chunk.forEach((x, n) => {
        if (typeof arr[n] === "string" && (arr[n] as string).trim()) out[x.i].vocab[x.k].gloss = (arr[n] as string).trim().slice(0, 60);
      });
    } catch (e) {
      console.error("gloss LLM gagal — gloss dikosongkan:", e instanceof Error ? e.message : e);
    }
  }
  // Fallback: gloss EN bila LLM tak jalan (tandai).
  for (const k of out) for (const v of k.vocab) if (!v.gloss) v.gloss = `[EN] ${v.gloss_en}`;

  mkdirSync("data", { recursive: true });
  const header = {
    _license: "Kanji readings/meanings/strokes: KANJIDIC2 (EDRDG, CC BY-SA 4.0) via kanjiapi.dev; stroke SVG: KanjiVG (Ulrich Apel, CC BY-SA 3.0); vocab: JMdict/Tatoeba via Jisho; jlpt: patokan komunitas (tak resmi).",
    _sources: ["https://kanjiapi.dev", "https://github.com/KanjiVG/kanjivg", "https://jisho.org", "https://github.com/cjkvi/cjkvi-ids"],
  };
  writeFileSync("data/kanji-n5.json", JSON.stringify({ ...header, count: out.length, kanji: out }, null, 1));
  console.log(`\nTersimpan: data/kanji-n5.json (${out.length} kanji)`);
  if (errors.length) {
    console.error(`GAGAL ${errors.length}:\n${errors.join("\n")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

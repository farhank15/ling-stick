# Kanji (referensi kanonis + flashcard khusus)

Prinsip keras: **data kanji tidak di-generate AI** (bacaan/stroke/komponen =
fakta kanonis). AI hanya boleh untuk glos kata pendek (direview) dan nanti
mnemonik (berlabel). Masuk DB hanya lewat `kanji:import` yang memvalidasi
anti-asal (strokes>0, ada bacaan, vocab mengandung kanjinya, SVG ada).

## Sumber data + lisensi (wajib tampil di UI Aksara)

- Bacaan/arti EN/stroke/grade/frek/JLPT: KANJIDIC2 (EDRDG, CC BY-SA 4.0)
  via kanjiapi.dev.
- Komponen: cjkvi-ids.
- Diagram goresan: KanjiVG © Ulrich Apel (CC BY-SA 3.0).
- Contoh kata: JMdict/Tatoeba via Jisho API (hanya kata umum).
- Level JLPT: **rekonstruksi terdokumentasi, bukan daftar resmi** (JLPT tak
  menerbitkan daftar sejak 2010). Basis: OpenJLPT (evanclan, CC-BY-SA-4.0,
  per-level disjoint) silang lineage klasik-103 (old-4級) + tanos/Waller +
  Kanshudo. Lihat `data/kanji-levels.json` (sumber kebenaran level + provenance).
- Arti Indonesia: kurasi manual di seed script.

## Penetapan level (by-riset, 2026-10-15)

| Level | Jumlah | Rumus |
|---|---|---|
| N5 | 111 | OpenJLPT-N5 (84) + buffer lineage klasik ber-justifikasi kosakata inti (30: 飲買帰曜週族社駅雪花海空肉牛魚鳥病院銀近明新古安字家言店強物) + 9 inti yang kurang (本白大小今入出半誰). Tiap butir buffer ada `why` (kosakata N5-nya). Disengaja dikecualikan: 丈貼無 (bukan kosakata N5 inti). Tier: `core` (84) / `buffer` (39). |
| N4 | 142 | OpenJLPT-N4 (169) + 5 boundary (田文道寒暑) − overlap N5 (32). Boundary = batas N5/N4, diajarkan di N4, bertanda `tier: boundary`. |
| N3 | 385 | OpenJLPT-N3 − overlap (寒雪 ikut N4/N5). |
| N2 | 398 | OpenJLPT-N2 (kumulatif ≈ 1036). |
| N1 | 1344 | OpenJLPT-N1 sisa (total unik 2380 + 3 dikecualikan = 2383). |

Aturan tie-break (bila sumber konflik): old-4級 > tanos > Kanshudo > uji kosakata-inti;
sisa tak terputus = varian batas (tidak jadi penentu lulus/gagal).
File: `data/kanji-levels.json` (`counts`, `levels.n5/n4/n3` + tier/why/ojl_level,
`levels.n2/n1` daftar karakter). `kanji:import` membaca file ini sebagai level
final (seed per-kanji hanya fallback).

## Tabel DB (`app/lib/db/schema.ts` + migrasi `IF NOT EXISTS`)

| Tabel | Isi |
|---|---|
| `kanji` | char, meaning_id, strokes, grade, freq, jlpt, svg |
| `kanji_readings` | kanji, type (on/kun), reading, primary_pick |
| `kanji_components` | kanji, component (dari IDS cjkvi) |
| `kanji_vocab` | kanji, word, reading, gloss (maks 3/kanji) |
| `kanji_cards` | kanji, mode, kolom FSRS (scheduler reuse `fsrs.server`) |

## Alur seed & script

```bash
npm run kanji:seed    # dataset → data/kanji-n5.json (butuh GROQ_API_KEY di env untuk glos; IDS=/tmp/ids.txt)
npm run kanji:audit   # silang: on/kun+strokes vs OpenJLPT, komponen CJK, tiap vocab dicek Jisho
npm run kanji:import  # validasi total → upsert DB (butuh DB reachable)
```

- `scripts/kanji-seed.ts` — daftar N5 + glos ID di `GLOSSES` (sumber kurasi!),
  fetch kanjiapi + SVG + Jisho, glos kata via LLM batch (fallback `[EN]` bila
  gagal — harus dibetulkan manual sebelum import).
- `scripts/kanji-import.ts` — `ensureDbReady()` + validasi + upsert idempoten.
- `data/kanji-n5.json` ikut ke-commit (sumber review + repro).

## Flashcard khusus kanji (3 mode, 1 fakta per kartu)

- **Kenali** (`recognition`): kanji → arti + bacaan.
- **Ingat** (`recall`): arti → bayangkan/tulis kanji → cek.
- **Baca** (`reading`): kata (furigana disembunyi) → bacaan.
- API: `GET /api/kanji?mode=` antrean, `?detail=` detail, `POST` nilai 1–4.
- UI: tab Kanji di `/aksara` (grid + filter komponen + detail SVG + sesi flash).

## Cara lanjut

- **N4 (~170 kanji)**: tambah daftar + glos di `GLOSSES` (atau file list),
  `kanji:seed` → review JSON → `kanji:import`. Level lain otomatis muncul
  sesuai kolom `jlpt` (tab level di Aksara baca dari data, bukan hardcode —
  catatan: saat ini seed hanya N5; tab N4+ kosong sampai di-seed).
- **Animasi goresan**: SVG KanjiVG sudah tersimpan — tinggal animasi
  stroke-dashoffset di klien (belum dikerjakan).
- **Mnemonik AI**: belum ada — kalau dibuat, simpan terpisah + label AI,
  jangan campur ke tabel kanonis.
- **Radikal Kangxi**: belum ada tabel sendiri (tercakup `kanji_components`).

## Urutan belajar: tema & pola (2026-10-26)

Tidak ada API publik yang menyediakan **urutan pedagogis** atau **taksonomi tema**
untuk kanji JLPT. Riset: `.agents/research/kanji-theme-radical-jlpt-sources.md`.
Yang ada hanya level (kanjiapi.dev → tanos/Waller) dan `wk_level` (WaniKani,
bukan JLPT). Jadi urutan/tema **dikurasi in-repo**:

- `data/kanji-study-n5.json` — sumber kebenaran urutan N5: 11 tema
  (angka, waktu, alam, orang, sekolah, tempat, makan, arah, sifat, aksi, tanya),
  urutan di dalam tema, dan radikal per kanji.
- Radikal diambil dari `data/kanji-levels.json` (KANJIDIC/OpenJLPT) + override
  lima kanji batas N4 (田文道暑寒) yang tidak ada di daftar level.
- Mode **Pola** di UI mengelompokkan kanji berbagi radikal (bukan etimologi —
  labelnya "pola bentuk"). Keluarga ≥2 tampil dulu; sisanya digabung.
- Tema bersifat kurasi subjektif: ubah JSON, jalankan test, tidak perlu migrasi DB.
  Test `tests/kanji-study.test.ts` memastikan 116/116 kanji N5 punya tema + radikal.

## Notasi bacaan (KANJIDIC2)

Sumber primer: KANJIDIC2 DTD v1.6, <https://www.edrdg.org/pub/Nihongo/kanjidic2.xml.gz>:

> `ja_on` — the "on" Japanese reading of the kanji, in katakana.
> `ja_kun` — the "kun" Japanese reading of the kanji, usually in hiragana.
> Where relevant the okurigana is also included separated by a ".". Readings
> associated with prefixes and suffixes are marked with a "-".

Arti untuk UI (`app/lib/kanji-study.ts` → `parseReading`):

| Notasi | Arti | Contoh |
|---|---|---|
| `.` | batas okurigana; bagian setelah titik ditulis kana | `ひと.つ` → 一つ = ひと + つ |
| `-` di kanan | awalan, menempel di depan kanji lain | `ひと-` → 一休み = ひとやすみ |
| `-` di kiri | akhiran, menempel di belakang kanji lain | `-び` → 日曜日 = にちようび |
| `・` | pemisah antar bacaan buatan UI, **bukan** bagian bacaan | ニチ・ジツ |
| `●` | penanda bacaan inti (`primary_pick`), **bukan** bagian bacaan | ●ひ |

On = katakana, kun = hiragana (konvensi KANJIDIC) — ini yang membedakan tanpa label.


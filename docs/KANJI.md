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
- Level JLPT: **patokan komunitas Waller/Kanshudo (tak resmi sejak 2010)** —
  selalu tampilkan disclaimer ini di UI.
- Arti Indonesia: kurasi manual di seed script.

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

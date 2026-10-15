# Lanjutan (status + sisa kerja)

Dokumen ini jawaban "besok lanjut apa". Diperbarui: 2026-10-14.
Detail per fitur: [ROUTE.md](./ROUTE.md), [KANJI.md](./KANJI.md).

## Sudah selesai (production, di `main`)

- Kuis remedial pakai posisi antrean (tidak mental di turn akhir).
- Flashcard: antrean acak + selip kartu hafal + cooldown FSRS jujur + tanpa progress bar.
- Tanya Ling di flashcard + simpan ke Library; markdown `**` tampil format.
- Responsif all-page (sesi sempit tengah, daftar grid, detail 2 kolom).
- Dashboard Perkembangan di home (bawah) + 4 tema aksen di Settings.
- Bank generate hindari kata Library (prompt + guard batch).
- Furigana kuis JA (prompt + opsi).
- Translate: debounce 500ms, paralel usage, abort request basi, efek ganda dibuang.
- Extract: bar simpan anti-nav + save batch anti-spam + sadar Library.
- Toggle bahasa EN/JA di header.
- Jawaban Ling JA: `漢字（かな・romaji)` → kanji hijau + furigana + toggle romaji.
- Lara rotasi 2 key (env `_2`, tracking per-key, failover).
- **Rute N5 batch 1**: skema + validate + 20 step (order 1–20) + peta + unlock +
  checkpoint + kartu home + XP + varian register + Ask Ling + catatan per step.
- **Kanji N5**: 111 kanji kanonis di DB + 3 mode flash + UI Aksara.
  Level N5–N1 final by-riset di `data/kanji-levels.json` (N5 111 / N4 142 / N3 385 / N2 398 / N1 1344).

## Sisa (urut prioritas saran)

1. **Rute N5 batch 2–3** (order 21–60 + exam segmen 3–6) — lihat ROUTE.md §Cara lanjut.
2. **Rute N4** (~110 pola) lalu N3 — pola kerja sama, tanpa kerja engine.
3. **Kanji N4** (142, daftar final siap) — seed dengan pola yang sama, lihat KANJI.md §Cara lanjut.
4. **Animasi goresan KanjiVG** (SVG sudah di DB).
5. **Mnemonik AI kanji** (terpisah + label AI).
6. Audit label level AI bank (kata yang levelnya ngaco) — manual sesekali.

## Perintah penting

```bash
npm run dev                  # lokal :3000
npm run route:validate       # validasi materi rute (wajib sebelum merge md)
npm run kanji:seed           # seed kanji (butuh GROQ_API_KEY + IDS di env)
npm run kanji:audit          # audit silang on/kun/strokes/komponen/vocab (Jisho)
npm run kanji:import         # validasi + tulis kanji ke DB
npm run typecheck            # wajib hijau sebelum commit
npm run build && <restart>   # produksi :3000 baca build — restart setelah build!
```

## Catatan operasional

- Produksi lokal `:3000` jalan dari `build/` — **habis ubah kode harus
  `npm run build` + restart proses**, kalau tidak tampilan "masih sama".
- Vercel (`ling-stick.vercel.app`): env via `vercel env add NAME production`
  (interaktif), redeploy via `vercel --prod` atau push.
- Env Lara key 2: `LARA_ACCESS_KEY_ID_2` / `LARA_ACCESS_KEY_SECRET_2`
  (lokal `.env` + Vercel).
- Toast/UX: pola `matcha:` di komentar untuk keputusan sadar.

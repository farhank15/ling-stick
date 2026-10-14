# Rute Belajar Jepang (N5→N3)

Rute step terstruktur ala game: peta winding path, lock/unlock, checkpoint exam,
XP. Lapisan kurikulum di atas engine quiz + FSRS yang sudah ada (tanpa duplikasi).

## Konsep

- **Step** = 1 pola kalimat + penjelasan + contoh formal/kasual (+anime opsional
  berkoreksi) + 5–12 soal cloze. File: `content/route/{n5,n4,n3}/step-NNN.md`
  (Markdown + frontmatter).
- **Segmen** = 10 step. Tiap segmen ditutup **checkpoint exam** (15 soal acak dari
  segmen itu, passing ≥80%) yang membuka segmen berikut.
- **State**: `locked → available → in_progress → passed` (lulus = nilai ≥
  `passing.grade_pct`, default 80). Step lulus tetap bisa dibuka/diulang.
- **Gamifikasi**: XP (100/pass, +25 perfect 100%, +150/exam lulus). Tanpa hearts.
- **Tracking**: di atas `quiz_sets` — lesson `day=route:{lang}:{stepId}`
  `mode=route`, exam `day=route:{lang}:exam-{seg}` `mode=route_exam`. Tanpa migrasi.

## File penting

| File | Peran |
|---|---|
| `app/lib/route.schema.ts` | Skema Zod step + exam |
| `app/lib/route.server.ts` | Loader md + parser frontmatter (tanpa lib) + aturan silang |
| `app/lib/route.progress.ts` | Status/unlock/XP, buat set lesson/exam, cache peta 30 dtk |
| `app/routes/rute.tsx` | Peta SVG spine + node button + chest ujian |
| `app/routes/rute.$stepId.tsx` | Halaman materi + Tanya Ling + catatan + mulai latihan |
| `app/routes/api.route.ts` | Catatan + Tanya-Jawab per step (`route_notes`) |
| `content/route/_TEMPLATE.md` | Template step baru |
| `scripts/route-validate.ts` | Validasi (`npm run route:validate`) |

## Aturan konten (ditegakkan validator)

- Contoh: min 3, tiap step **wajib pasangan formal + kasual**
  (`register: formal|kasual|anime`, default formal).
- Contoh `anime` maks 1/step + **wajib** `register_note_id` korektif
  ("di anime X, sehari-hari Y").
- Cloze min 5, distractors 2–4 sekelas kata, jawaban ≠ distractor.
- Cloze tidak boleh menjadikan bentuk anime sebagai jawaban benar.
- Keigo (sonkeigo/kenjougo) ditunda ke N4 akhir/N3.

## Cara lanjut (nambah step / batch N4)

1. Copy `content/route/_TEMPLATE.md` → `content/route/n4/step-061.md` (lanjutkan
   `order`, `segment = ceil(order/10)`).
2. Isi (manusia atau agent apa pun — formatnya yang penting).
3. `npm run route:validate` → harus `OK`.
4. Review manusia untuk batch (wajib: kana benar, distractor sekelas, pasangan
   kasual natural).
5. Commit + push + redeploy. Peta otomatis menampilkan (loader baca md).

Status konten: N5 segmen 1–2 (order 1–20) selesai. Sisa: order 21–60 (N5),
lalu N4 (~110 pola), N3 (~150–180 pola).

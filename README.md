# LingStick

App personal buat belajar bahasa Inggris aktif: nangkep kata/frasa/slang baru → nyimpen
konteks → ngulang tiap hari (spaced repetition FSRS). Single user, mobile-first, PWA.
Lengkap: detail & arsitektur ada di [BLUEPRINT.md](./BLUEPRINT.md).

## Fitur (P0 + P1)

- **Tambah (Capture)** — ketik kata/frasa → AI generate makna (1–4 makna), contoh kalimat
  di 3 register (**Santai / Umum / Formal**), cara lain ngomong, deteksi duplikat, simpan
  1 klik. Kalau AI lagi error → tetap bisa simpan manual.
- **Library** — full-text search (SQLite FTS5), filter tipe/register/status, detail item
  dengan highlight kata, sembunyikan arti (self-test), edit, hapus, **Cek kalimatku**.
- **Review** — flashcard harian (due + kartu baru dibatasi per hari), 2 mode diacak
  (recognition & cloze), 4 rating FSRS (Lupa/Susah/Bisa/Gampang), tandai sudah hafal.
- **Explore** — ekspresi per situasi (di-generate AI sekali, di-cache di DB), simpan /
  "udah tahu", expression of the day, generate lebih banyak.
- **Mode nonton** — tempel subtitle/chat/artikel → AI ekstrak idiom/slang/reaksi, centang
  yang mau disimpan (kalimat asli otomatis jadi konteks).
- **Terjemah** — Lara Translate (Natural/Literal/Kreatif + nada) dengan penghitung kuota
  bulanan + fallback ke LLM; hasil bisa disimpan sebagai item.
- **Export backup JSON** di halaman Pengaturan.

## Stack

React Router v7 (framework mode) · TypeScript · Tailwind CSS v4 · Turso/libSQL (drizzle-orm)
+ Drizzle ORM · FTS5 · ts-fsrs · Poolside (OpenAI-compatible) · Lara Translate · Zod.

## Setup

```bash
npm install
cp .env.example .env   # lalu isi APP_PASSWORD + POOLSIDE_API_KEY/POOLSIDE_MODEL
npm run dev
```

Buka `http://localhost:3000`, login pakai `APP_PASSWORD` dari `.env`.

### Env vars (lihat .env.example)

Wajib: `APP_PASSWORD`, `POOLSIDE_API_KEY`, `POOLSIDE_MODEL`.
Opsional: `LARA_ACCESS_KEY_ID/SECRET` (tanpa itu, tab Terjemah fallback ke LLM),
`DATABASE_URL`, `NEW_CARDS_PER_DAY`, `DAILY_LLM_CALL_LIMIT`, `LARA_MONTHLY_CHAR_LIMIT`,
`SESSION_TTL_DAYS`.

> Cari nilai `POOLSIDE_MODEL`: set `POOLSIDE_API_KEY` dulu, login, buka `/api/models`
> (atau `curl -H "Authorization: Bearer $KEY" $POOLSIDE_BASE_URL/models`), pilih salah satu,
> tulis di `.env`, restart.

## Produksi

```bash
npm run build
npm start   # react-router-serve, PORT default 3000
```

SQLite butuh disk persisten (VPS / Fly.io volume). Sesi login disimpan di tabel
`sessions` di SQLite — sesi bertahan selama `SESSION_TTL_DAYS` hari; kalau hilang
(server restart dengan DB tetap) user tetap login, kalau sesi kedaluwarsa cukup masuk
password lagi.

## Struktur

```
app/
  lib/          llm.server, lara.server, fsrs.server, items.server, auth.server, prompts, schemas
  lib/db/       schema.ts (drizzle), migrations.ts (DDL + FTS5 + triggers), client.server.ts
  routes/       _index (Tambah), library, review, explore, extract, translate, settings + api.*
public/         manifest.json, sw.js, offline.html
```

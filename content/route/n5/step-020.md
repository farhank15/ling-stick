---
step_id: ja-n5-020
level: N5
segment: 2
order: 20
title_id: "Waktu: kinou kyou ashita"
pattern: "昨日・今日・明日 + 時間"
objectives:
  - "Kosakata waktu relatif dan absolut"
  - "Kalimat lampau/kini/depan dengan penanda waktu"
explanation_id: "Relatif: 昨日 (kemarin)・今日 (hari ini)・明日 (besok), 先週・今週・来週, 去年・今年・来年. Absolut: 月曜日・3月・2024年. Aturan に: jam/hari/tanggal/bulan spesifik pakai に (3時に, 月曜日に) — tapi 今日・明日・毎日・先週 TANPA に. Lampau kasual/sopan ikuti V-た/V-ました."
formation: "昨日/今日/明日 (tanpa に) | N時・N曜日・N月 + に | V-た/V-ました (lampau)"
register_note_id: "Penanda waktu netral; beda register di akhir kalimat (見ました vs 見た)."
examples:
  - { jp: "昨日映画を見ました。", kana: "きのうえいがをみました。", romaji: "kinou eiga o mimashita.", arti_id: "Kemarin menonton film.", pola_ref: "昨日 + V-ました" }
  - { jp: "月曜日に試験があります。", kana: "げつようびにしけんがあります。", romaji: "getsuyoubi ni shiken ga arimasu.", arti_id: "Hari Senin ada ujian.", pola_ref: "N曜日 + に" }
  - { jp: "来年日本に行きます。", kana: "らいねんにほんにいきます。", romaji: "rainen nihon ni ikimasu.", arti_id: "Tahun depan pergi ke Jepang.", pola_ref: "来年 (tanpa に)" }
  - { jp: "昨日映画見た。", kana: "きのうえいがみた。", romaji: "kinou eiga mita.", arti_id: "Kemarin nonton. [kasual]", pola_ref: "昨日 + V-た", register: "kasual" }
pitfalls_id:
  - "今日・明日・毎日・毎週・先週 tanpa に (×明日に)."
  - "月 (bulan) pakai に: 3月に. 週 juga: 来週に."
cloze_items:
  - { front: "___ 映画を見ました。(kemarin)", answer: "昨日", distractors: ["今日", "明日", "毎日"], kana_hint: "きのう", explain_id: "Kemarin → 昨日." }
  - { front: "月曜日 ___ 試験があります。", answer: "に", distractors: ["を", "が", "も"], kana_hint: "", explain_id: "Hari spesifik → に." }
  - { front: "___ 日本に行きます。(tahun depan)", answer: "来年", distractors: ["去年", "今年", "毎日"], kana_hint: "らいねん", explain_id: "Tahun depan → 来年 (tanpa に)." }
  - { front: "___ 休みます。(setiap hari Minggu)", answer: "毎週日曜日", distractors: ["毎日曜日", "毎週日曜日にち", "毎曜日"], kana_hint: "まいしゅうにちようび", explain_id: "Setiap Minggu → 毎週日曜日." }
  - { front: "3月 ___ 卒業します。", answer: "に", distractors: ["を", "が", "も"], kana_hint: "", explain_id: "Bulan spesifik → に." }
refs:
  - { label: "Tae Kim — Time", url: "https://www.guidetojapanese.org/learn/grammar/time" }
passing: { min_items: 8, grade_pct: 80 }
est_minutes: 8
version: 1
---

## Penjelasan
昨日・今日・明日 tanpa に. Jam/hari/bulan spesifik pakai に.

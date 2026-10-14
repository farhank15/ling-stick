---
# Template step Rute JA — copy ke content/route/{n5,n4,n3}/step-NNN.md, isi, lalu:
#   npm run route:validate
# Aturan: explanation_id min 20 char; examples 3-8 (jp+kana+arti_id wajib);
# cloze_items 5-12 (distractors 2-4, sekelas kata; answer TIDAK boleh di distractors).
step_id: ja-n5-001
level: N5
segment: 1
order: 1
title_id: "Judul Pola"
pattern: "V-て + ください"
objectives:
  - "Tujuan 1"
  - "Tujuan 2"
explanation_id: "Penjelasan singkat Bahasa Indonesia (min 20 karakter)."
formation: "Aturan bentuk (markdown singkat)."
examples:
  - { jp: "食べてください。", kana: "たべてください。", romaji: "tabete kudasai.", arti_id: "Tolong makan.", pola_ref: "V-て + ください" }
  - { jp: "水を飲んでください。", kana: "みずをのんでください。", romaji: "mizu o nonde kudasai.", arti_id: "Tolong minum air.", pola_ref: "V-て + ください" }
  - { jp: "ゆっくり話してください。", kana: "ゆっくりはなしてください。", romaji: "yukkuri hanashite kudasai.", arti_id: "Tolong bicara pelan-pelan.", pola_ref: "V-て + ください" }
pitfalls_id:
  - "Jebakan umum pembelajar Indonesia."
cloze_items:
  - { front: "ごはんを ___ ください。(たべる)", answer: "食べて", distractors: ["食べる", "食べた", "食べない"], kana_hint: "たべて", explain_id: "Bentuk Te dari たべる." }
  - { front: "水を ___ ください。(のむ)", answer: "飲んで", distractors: ["飲む", "飲んだ", "飲まない"], kana_hint: "のんで", explain_id: "Kelompok 1 う: のむ→のんで." }
  - { front: "ここに ___ ください。(かく)", answer: "書いて", distractors: ["書く", "書いた", "書きない"], kana_hint: "かいて", explain_id: "Kelompok 1 く: かく→かいて." }
  - { front: "テレビを ___ ください。(みる)", answer: "見て", distractors: ["見る", "見た", "見ない"], kana_hint: "みて", explain_id: "Kelompok 2 る: みる→みて." }
  - { front: "しゅくだいを ___ ください。(する)", answer: "して", distractors: ["する", "した", "しない"], kana_hint: "して", explain_id: "Tak beraturan: する→して." }
refs:
  - { label: "Tae Kim — Te-form", url: "https://www.guidetojapanese.org/learn/grammar/teform" }
passing: { min_items: 8, grade_pct: 80 }
est_minutes: 12
version: 1
---

## Penjelasan
(opsional — frontmatter explanation_id adalah sumber kebenaran; body untuk bacaan panjang)

## Contoh
(opsional)

## Jebakan
(opsional)

---
step_id: ja-n5-001
level: N5
segment: 1
order: 1
title_id: "Partikel Topik は vs Subjek が"
pattern: "は vs が"
objectives:
  - "Bedakan fungsi は (topik) dan が (subjek/fokus)"
  - "Memakai は・が dengan benar di kalimat dasar"
explanation_id: "は menandai TOPIK pembicaraan (tentang apa kita bicara), dibaca わ. が menandai SUBJEK pelakunya, dipakai untuk info baru, kata tanya, dan penekanan. Pola dasar: XはYです (X itu Y) vs Xがすきです (suka X — X = fokus)."
formation: "X は Y です。| X が すきです。/ だれが X ですか。"
examples:
  - { jp: "わたしは学生です。", kana: "わたしはがくせいです。", romaji: "watashi wa gakusei desu.", arti_id: "Saya adalah murid.", pola_ref: "XはYです" }
  - { jp: "ねこがすきです。", kana: "ねこがすきです。", romaji: "neko ga suki desu.", arti_id: "Saya suka kucing.", pola_ref: "Xがすきです" }
  - { jp: "だれが先生ですか。", kana: "だれがせんせいですか。", romaji: "dare ga sensei desu ka.", arti_id: "Siapa yang jadi guru?", pola_ref: "kata tanya + が" }
pitfalls_id:
  - "Jangan baca は sebagai は (ha) — sebagai partikel dibaca わ (wa)."
  - "Jangan pakai は untuk kata tanya (×だれは) — kata tanya selalu が."
cloze_items:
  - { front: "わたし ___ 学生です。(topik: saya)", answer: "は", distractors: ["が", "を", "に"], kana_hint: "わ", explain_id: "Topik pembicaraan → は." }
  - { front: "ねこ ___ すきです。(fokus: kucing)", answer: "が", distractors: ["は", "を", "に"], kana_hint: "", explain_id: "Suka X — X subjek fokus → が." }
  - { front: "だれ ___ 先生ですか。", answer: "が", distractors: ["は", "を", "に"], kana_hint: "", explain_id: "Kata tanya selalu が." }
  - { front: "田中さん ___ 日本人です。", answer: "は", distractors: ["が", "を", "へ"], kana_hint: "わ", explain_id: "Menyatakan identitas Tanaka → topik は." }
  - { front: "つくえの上にほん ___ あります。", answer: "が", distractors: ["は", "を", "に"], kana_hint: "", explain_id: "Keberadaan (あります) → subjek が." }
refs:
  - { label: "Tae Kim — は vs が", url: "https://www.guidetojapanese.org/learn/grammar/topicparticles" }
passing: { min_items: 8, grade_pct: 80 }
est_minutes: 10
version: 1
---

## Penjelasan
は = tentang apa kita bicara. が = siapa/apa pelakunya.

## Jebakan
は dibaca わ. Kata tanya tidak pernah pakai は.

---
step_id: ja-n5-006
level: N5
segment: 1
order: 6
title_id: "こそあど: kore sore are"
pattern: "これ・それ・あれ・どれ"
objectives:
  - "Memakai penunjuk ini/itu dengan jarak yang benar"
  - "Memakai この・その・あの sebelum nomina"
explanation_id: "こ = dekat pembicara (これ = ini di tanganku), そ = dekat lawan bicara (それ = itu di tanganmu), あ = jauh dari keduanya (あれ = itu di sana). どれ = yang mana (pilih dari 3+). Bentuk berdiri sendiri: これ・それ・あれ・どれ. Bentuk penyambung nomina: この・その・あの・どの + N (この本 = buku ini)."
formation: "これ/それ/あれ/どれ (mandiri) | この/その/あの/どの + N"
register_note_id: "Penunjuk netral di semua register; bedanya di akhiran kalimat (です vs だ)."
examples:
  - { jp: "これは私のペンです。", kana: "これはわたしのペンです。", romaji: "kore wa watashi no pen desu.", arti_id: "Ini pulpen saya.", pola_ref: "これ" }
  - { jp: "そのかばんはいくらですか。", kana: "そのかばんはいくらですか。", romaji: "sono kaban wa ikura desu ka.", arti_id: "Tas itu (di dekatmu) berapa harganya?", pola_ref: "その + N" }
  - { jp: "あれは富士山です。", kana: "あれはふじさんです。", romaji: "are wa fujisan desu.", arti_id: "Itu (di sana) Gunung Fuji.", pola_ref: "あれ" }
  - { jp: "これ俺の。", kana: "これおれの。", romaji: "kore ore no.", arti_id: "Ini punya gue. [kasual]", pola_ref: "これ", register: "kasual" }
pitfalls_id:
  - "それ vs あれ: kalau benda jauh dari **keduanya** → あれ, bukan それ."
  - "この vs これ: この本 (buku ini) vs これは本です (ini adalah buku) — この selalu diikuti nomina."
cloze_items:
  - { front: "___ は私の傘です。(di tanganku)", answer: "これ", distractors: ["それ", "あれ", "どれ"], kana_hint: "", explain_id: "Dekat pembicara → これ." }
  - { front: "___ はいくらですか。(di tanganmu)", answer: "それ", distractors: ["これ", "あれ", "どれ"], kana_hint: "", explain_id: "Dekat lawan bicara → それ." }
  - { front: "___ 山は富士山です。(jauh di sana)", answer: "あの", distractors: ["この", "その", "どの"], kana_hint: "あの", explain_id: "Jauh + sebelum nomina → あの." }
  - { front: "___ があなたのですか。(pilih salah satu)", answer: "どれ", distractors: ["これ", "それ", "あれ"], kana_hint: "", explain_id: "Kata tanya pilih → どれ." }
  - { front: "___ 本は難しいです。(buku ini)", answer: "この", distractors: ["これ", "ここ", "こんな"], kana_hint: "この", explain_id: "Sebelum nomina → この." }
refs:
  - { label: "Tae Kim — kore/sore/are", url: "https://www.guidetojapanese.org/learn/grammar/kore" }
passing: { min_items: 8, grade_pct: 80 }
est_minutes: 8
version: 1
---

## Penjelasan
こ = dekatku, そ = dekatmu, あ = jauh. +の sebelum nomina.

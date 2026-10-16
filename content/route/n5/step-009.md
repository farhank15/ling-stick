---
step_id: ja-n5-009
level: N5
segment: 1
order: 9
title_id: "Angka, Waktu, dan Counter"
pattern: "時間・counter つ/人/時"
objectives:
  - "Membaca jam dan menit"
  - "Memakai counter つ・人・時"
explanation_id: "Jam: 時 (じ) — 1時 いちじ, 3時 さんじ, 4時 よじ, 7時 しちじ, 9時 くじ (bacaan spesial!). Menit: 分 — 1分 いっぷん, 3分 さんぷん, 6分 ろっぷん, 8分 はっぷん, 10分 じゅっぷん (bunyi ぷ berubah). Counter benda umum: ひとつ・ふたつ・みっつ・よっつ・いつつ (1-5 spesial). Orang: ひとり・ふたり, lalu さんにん. Umur: さい (20歳 はたち spesial)."
formation: "N時 (+に) | N分 | ひとつ/ふたつ/みっつ | N人 | N歳"
register_note_id: "Angka/counter netral — beda register cuma di akhir kalimat."
examples:
  - { jp: "4時に会いましょう。", kana: "よじにあいましょう。", romaji: "yoji ni aimashou.", arti_id: "Mari bertemu jam 4.", pola_ref: "N時に" }
  - { jp: "りんごをみっつください。", kana: "りんごをみっつください。", romaji: "ringo o mittsu kudasai.", arti_id: "Tolong 3 apel.", pola_ref: "counter つ" }
  - { jp: "家族は4人です。", kana: "かぞくはよにんです。", romaji: "kazoku wa yonin desu.", arti_id: "Keluarga (terdiri dari) 4 orang.", pola_ref: "N人" }
  - { jp: "4時にね。", kana: "よじにね。", romaji: "yoji ni ne.", arti_id: "Jam 4 ya. [kasual]", pola_ref: "N時に", register: "kasual" }
pitfalls_id:
  - "4時=よじ, 7時=しちじ, 9時=くじ — jangan いちよじ/ななじ/きゅうじ."
  - "ひとり・ふたり (1-2 orang) spesial, 3+ pakai にん."
cloze_items:
  - { front: "___ に起きます。(jam 7)", answer: "7時", distractors: ["7分", "7人", "7つ"], kana_hint: "しちじ", explain_id: "Jam → 時 (7時=しちじ).", kana: "___ におきます。(jam 7)", romaji: "___ ni okimasu." }
  - { front: "___ に会いましょう。(jam 4)", answer: "4時", distractors: ["4分", "4人", "4つ"], kana_hint: "よじ", explain_id: "Jam 4 = よじ.", kana: "___ にあいましょう。(jam 4)", romaji: "___ ni aimashou." }
  - { front: "たまごを ___ 買いました。(3 butir)", answer: "みっつ", distractors: ["みつつ", "さんつ", "みっち"], kana_hint: "", explain_id: "Counter benda 3 = みっつ.", kana: "たまごを ___ かいました。(3 butir)", romaji: "tamago o ___ kaimashita." }
  - { front: "きょうだいは ___ です。(2 orang)", answer: "ふたり", distractors: ["ににん", "ふたつ", "にり"], kana_hint: "", explain_id: "2 orang = ふたり.", kana: "きょうだいは ___ です。(2 orang)", romaji: "kyoudai wa ___ desu." }
  - { front: "15 ___ かかります。(menit)", answer: "分", distractors: ["時", "人", "つ"], kana_hint: "ふん", explain_id: "Menit → 分 (15分=じゅうごふん).", kana: "15 ___ かかります。(menit)", romaji: "15 ___ kakarimasu." }
refs:
  - { label: "Tae Kim — Numbers and counting", url: "https://www.guidetojapanese.org/learn/grammar/numbers" }
passing: { min_items: 5, grade_pct: 80 }
est_minutes: 10
version: 1
---

## Penjelasan
Jam spesial: よじ・しちじ・くじ. Benda: ひとつ・ふたつ・みっつ.

---
step_id: ja-n5-001
level: N5
segment: 1
order: 1
title_id: "Partikel Topik は vs Subjek が"
pattern: "は vs が"
objectives:
  - "Bedakan fungsi は (topik/kontras) dan が (subjek fokus), bukan sekadar 'pelaku'"
  - "Memakai は・が dengan benar di kalimat dasar, pertanyaan, dan perasaan"
explanation_id: "**は** menandai *topik* — tentang apa kita bicara (info yang sudah diketahui/lama), dibaca わ. **が** menandai *subjek fokus*: elemen yang disorot, biasanya info baru atau jawaban pertanyaan. ==が bukan berarti 'pelaku'== — が dipakai untuk subjek keadaan, keberadaan, kemampuan, atau penampakan, bukan cuma yang melakukan aksi: 猫がいる (ada kucing) atau 窓が開いている (jendela terbuka), di mana 猫/窓 bukan 'pelaku'. Heuristik praktis: kalau X sudah jelas dari konteks → は; kalau X adalah info baru/fokus → が. Tapi ini *bukan aturan kaku* — konteks dan nuansa penutur menentukan, dan が bisa muncul untuk menegaskan subjek tanpa harus 'info baru' murni. は juga dipakai untuk *kontras* (私は行くが、彼は行かない = saya pergi, tapi dia tidak), beda dari sekadar topik."
formation: "X は Y です。| X が すきです。| だれが X ですか。| X は Y ですが、Z は〜"
register_note_id: "です/ます aman ke siapa pun; bentuk plain (だ) untuk teman dekat — dan fondasi semua konjugasi. Di N5 belum ada keigo (bahasa hormat)."
examples:
  - { jp: "わたしは学生です。", kana: "わたしはがくせいです。", romaji: "watashi wa gakusei desu.", arti_id: "Saya adalah murid. (は = topik: tentang saya)", pola_ref: "XはYです" }
  - { jp: "ねこがすきです。", kana: "ねこがすきです。", romaji: "neko ga suki desu.", arti_id: "Saya suka kucing. (が = fokus: kucing yang disukai)", pola_ref: "Xがすきです" }
  - { jp: "だれが先生ですか。", kana: "だれがせんせいですか。", romaji: "dare ga sensei desu ka.", arti_id: "Siapa yang jadi guru? (kata tanya selalu が)", pola_ref: "kata tanya + が" }
  - { jp: "部屋に猫がいます。", kana: "へやねこがいます。", romaji: "heya ni neko ga imasu.", arti_id: "Di kamar ada kucing. (が = subjek keberadaan, bukan pelaku)", pola_ref: "keberadaan + が", register: "formal" }
  - { jp: "俺は学生だ。", kana: "おれはがくせいだ。", romaji: "ore wa gakusei da.", arti_id: "Gue murid. [kasual — teman dekat]", pola_ref: "XはYだ", register: "kasual" }
  - { jp: "誰が好き？", kana: "だれがすき？", romaji: "dare ga suki?", arti_id: "Suka siapa? [kasual]", pola_ref: "kata tanya + が", register: "kasual" }
pitfalls_id:
  - "は dibaca わ (wa), bukan ha — sebagai partikel."
  - "が bukan 'pelaku': が memunculkan subjek fokus/keadaan (猫がいる, 窓が開く), bukan cuma yang melakukan aksi."
  - "Kata tanya (だれ・なに・どこ) selalu pakai が di kalimat tanya: ×だれは."
  - "Perasaan/keahlian (すき・きらい・じょうず・わかる): yang punya perasaan pakai は, objeknya pakai が — 私は猫がすき."
  - "は juga untuk kontras (私は行くが、彼は行かない), bukan cuma topik."
cloze_items:
  - { front: "わたし ___ 学生です。(topik: saya)", answer: "は", distractors: ["が", "を", "に"], kana_hint: "わ", explain_id: "Topik pembicaraan → は.", kana: "わたし ___ がくせいです。(topik: saya)", romaji: "watashi ___ gakusei desu." }
  - { front: "ねこ ___ すきです。(fokus: kucing)", answer: "が", distractors: ["は", "を", "に"], kana_hint: "", explain_id: "Suka X — X subjek fokus → が.", kana: "ねこ ___ すきです。(fokus: kucing)", romaji: "neko ___ suki desu." }
  - { front: "だれ ___ 先生ですか。", answer: "が", distractors: ["は", "を", "に"], kana_hint: "", explain_id: "Kata tanya selalu が.", kana: "だれ ___ せんせいですか。", romaji: "dare ___ sensei desu ka." }
  - { front: "田中さん ___ 日本人です。", answer: "は", distractors: ["が", "を", "へ"], kana_hint: "わ", explain_id: "Menyatakan identitas Tanaka → topik は.", kana: "たなかさん ___ にほんじんです。", romaji: "tanaka-san ___ nihonjin desu." }
  - { front: "つくえの上にほん ___ あります。", answer: "が", distractors: ["は", "を", "に"], kana_hint: "", explain_id: "Keberadaan (あります) → subjek が, bukan pelaku.", kana: "つくえのうえにほん ___ あります。", romaji: "tsukue no ue ni hon ___ arimasu." }
  - { front: "私はコーヒー ___ 紅茶は嫌いです。", answer: "は", distractors: ["が", "を", "も"], kana_hint: "わ", explain_id: "は untuk kontras: kopi (yang dibicarakan), teh ditolak.", kana: "わたしはコーヒー ___ こうちゃはきらいです。", romaji: "watashi wa koohii ___ koocha wa kirai desu." }
  - { front: "部屋に猫 ___ います。", answer: "が", distractors: ["は", "を", "へ"], kana_hint: "", explain_id: "Keberadaan (います) → subjek が.", kana: "へやにねこ ___ います。", romaji: "heya ni neko ___ imasu." }
refs:
  - { label: "Tae Kim — は vs が", url: "https://www.guidetojapanese.org/learn/grammar/topicparticles" }
passing: { min_items: 5, grade_pct: 80 }
est_minutes: 10
version: 1
---

## Penjelasan
は = tentang apa kita bicara (topik/info lama). が = subjek yang disorot (info baru), bukan cuma pelaku.

## Jebakan
は dibaca わ. が untuk keberadaan/keadaan bukan cuma "yang melakukan". Kata tanya tak pernah pakai は.

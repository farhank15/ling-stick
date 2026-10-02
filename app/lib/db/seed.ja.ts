/**
 * SEED_BANK_JP — kosakata, partikel & ekspresi Jepang. TANPA kana tunggal:
 * aksara (あ か ア ク dst.) punya menu sendiri (Home → Aksara) dengan tabel
 * gojūon/dakuten interaktif — Bank khusus kosakata, partikel & ekspresi.
 *
 * Konvensi field (contoh di examplesJson):
 * - `en`  = kalimat JEPANG, baris kedua romaji (pre-line di UI)
 * - `id`  = terjemahan Indonesia
 * - `reading` level item = kana + romaji dalam kurung, mis. "みず (mizu)"
 */

export type SeedWordJp = {
  text: string;
  reading?: string; // kana (romaji)
  type: string;
  register: string;
  cefr: string; // diisi level JLPT utk lang=ja
  meaning: string;
  useWhen: string;
  examples: { en: string; id: string }[];
};

export const SEED_BANK_JP: SeedWordJp[] = [
  // ── Kosakata N5 ──
  {
    text: "水",
    reading: "みず (mizu)",
    type: "word",
    register: "neutral",
    cefr: "N5",
    meaning: "air",
    useWhen: "kata paling umum buat air minum; お水 (o-mizu) versi sopannya",
    examples: [
      { en: "水を飲みます。\nMizu o nomimasu.", id: "Minum air." },
      { en: "水がほしいです。\nMizu ga hoshii desu.", id: "Aku mau air." },
    ],
  },
  {
    text: "人",
    reading: "ひと (hito)",
    type: "word",
    register: "neutral",
    cefr: "N5",
    meaning: "orang",
    useWhen: "jamak tetap 人; bacaan berubah di kombinasi (日本人 = nihonjin)",
    examples: [
      { en: "あの人はやさしいです。\nAno hito wa yasashii desu.", id: "Orang itu baik hati." },
      { en: "日本人です。\nNihonjin desu.", id: "Orang Jepang." },
    ],
  },
  {
    text: "食べる",
    reading: "たべる (taberu)",
    type: "word",
    register: "neutral",
    cefr: "N5",
    meaning: "makan",
    useWhen: "verba kelompok 2 (ichidan): buang る, tambah ます → 食べます (tabemasu); negatifnya 食べません (tabemasen)",
    examples: [
      { en: "朝ごはんを食べます。\nAsagohan o tabemasu.", id: "Sarapan." },
      { en: "何を食べたいですか。\nNani o tabetai desu ka.", id: "Mau makan apa?" },
    ],
  },
  {
    text: "行く",
    reading: "いく (iku)",
    type: "word",
    register: "neutral",
    cefr: "N5",
    meaning: "pergi",
    useWhen: "verba kelompok 1 (godan): 行きます (ikimasu); te-form & lampau TIDAK beraturan: 行って (itte), 行った (itta)",
    examples: [
      { en: "学校へ行きます。\nGakkō e ikimasu.", id: "Pergi ke sekolah." },
      { en: "一緒に行きましょう。\nIssho ni ikimashō.", id: "Ayo pergi bareng." },
    ],
  },
  {
    text: "コーヒー",
    reading: "コーヒー (kōhī)",
    type: "word",
    register: "neutral",
    cefr: "N5",
    meaning: "kopi",
    useWhen: "kata serapan dari bahasa Barat ditulis katakana; kata serapan dari bahasa Cina umumnya ditulis kanji",
    examples: [{ en: "コーヒーをください。\nKōhī o kudasai.", id: "Kopi, tolong." }],
  },

  // ── Partikel (grammar) N5 ──
  {
    text: "は",
    reading: "wa (sebagai partikel)",
    type: "particle",
    register: "neutral",
    cefr: "N5",
    meaning: "partikel topik — 'kalau soal X…'",
    useWhen: "PENTING: dibaca 'wa' bukan 'ha' saat jadi partikel. Menandai topik yang sedang dibicarakan",
    examples: [
      { en: "私は学生です。\nWatashi wa gakusei desu.", id: "Saya mahasiswa (kalau soal saya)." },
      { en: "猫はかわいいです。\nNeko wa kawaii desu.", id: "Kucing itu lucu." },
    ],
  },
  {
    text: "が",
    reading: "ga",
    type: "particle",
    register: "neutral",
    cefr: "N5",
    meaning: "partikel subjek — menonjolkan siapa/apa pelaku",
    useWhen: "beda dengan は: が fokus ke subjek baru / info penting / jawaban 'siapa-apa'",
    examples: [
      { en: "雨が降っています。\nAme ga futte imasu.", id: "Hujan turun." },
      { en: "誰が来ましたか。\nDare ga kimashita ka.", id: "Siapa yang datang?" },
    ],
  },
  {
    text: "を",
    reading: "o (ditulis 'wo')",
    type: "particle",
    register: "neutral",
    cefr: "N5",
    meaning: "partikel objek langsung",
    useWhen: "menandai benda yang kena verba. Dibaca 'o' walau ditulis 'wo'",
    examples: [
      { en: "パンを食べます。\nPan o tabemasu.", id: "Makan roti." },
      { en: "水を飲みます。\nMizu o nomimasu.", id: "Minum air." },
    ],
  },
  {
    text: "に",
    reading: "ni",
    type: "particle",
    register: "neutral",
    cefr: "N5",
    meaning: "partikel arah/waktu — 'ke', 'di', 'pada'",
    useWhen: "tujuan (ke sekolah), waktu spesifik (jam 7), penerima",
    examples: [
      { en: "7時に起きます。\nShichi-ji ni okimasu.", id: "Bangun jam 7." },
      { en: "友達に会います。\nTomodachi ni aimasu.", id: "Ketemu teman." },
    ],
  },
  {
    text: "で",
    reading: "de",
    type: "particle",
    register: "neutral",
    cefr: "N5",
    meaning: "partikel tempat kegiatan/alat — 'di', 'dengan'",
    useWhen: "tempat verba aktif terjadi, atau alat/cara",
    examples: [
      { en: "図書館で勉強します。\nToshokan de benkyō shimasu.", id: "Belajar di perpustakaan." },
      { en: "バスで行きます。\nBasu de ikimasu.", id: "Pergi naik bus." },
    ],
  },
  {
    text: "へ",
    reading: "e (ditulis 'he')",
    type: "particle",
    register: "neutral",
    cefr: "N5",
    meaning: "partikel arah — 'menuju'",
    useWhen: "mirip に untuk arah, lebih menekankan arah gerak. Dibaca 'e' walau ditulis 'he'",
    examples: [{ en: "日本へ行きます。\nNihon e ikimasu.", id: "Pergi ke Jepang." }],
  },

  // ── Kosakata N4 ──
  {
    text: "決める",
    reading: "きめる (kimeru)",
    type: "word",
    register: "neutral",
    cefr: "N4",
    meaning: "memutuskan",
    useWhen: "transitif (subjek memutuskan); pasangannya 決まる（きまる） intransitif — 'tertentu dengan sendirinya'",
    examples: [{ en: "旅行の日を決めます。\nRyokō no hi o kimemasu.", id: "Menentukan tanggal perjalanan." }],
  },
  {
    text: "経験",
    reading: "けいけん (keiken)",
    type: "word",
    register: "formal",
    cefr: "N4",
    meaning: "pengalaman",
    useWhen: "kata Sino-Japanese — sering di resume/biodata",
    examples: [{ en: "日本語を教えた経験があります。\nNihongo o oshieta keiken ga arimasu.", id: "Punya pengalaman mengajar bahasa Jepang." }],
  },
  {
    text: "そうですね",
    reading: "sō desu ne",
    type: "expression",
    register: "neutral",
    cefr: "N4",
    meaning: "iya juga sih / begitu ya",
    useWhen: "jeda mikir + setuju sopan — jangan diterjemahkan kata per kata",
    examples: [{ en: "そうですね。考えてみます。\nSō desu ne. Kangaete mimasu.", id: "Iya juga ya. Coba kupikir dulu." }],
  },

  // ── Kosakata N3 ──
  {
    text: "作業",
    reading: "さぎょう (sagyō)",
    type: "word",
    register: "formal",
    cefr: "N3",
    meaning: "pekerjaan/praktik kerja",
    useWhen: "konteks kerja/manual — beda dengan 仕事 (pekerjaan umum)",
    examples: [{ en: "この作業は簡単です。\nKono sagyō wa kantan desu.", id: "Pekerjaan ini gampang." }],
  },
  {
    text: "似る",
    reading: "にる (niru)",
    type: "word",
    register: "neutral",
    cefr: "N3",
    meaning: "mirip dengan",
    useWhen: "hampir selalu dalam bentuk ている: 似ている（にている） = mirip",
    examples: [{ en: "彼は父に似ています。\nKare wa chichi ni nite imasu.", id: "Dia mirip bapaknya." }],
  },

  // ── Kosakata N2 (level = perkiraan) ──
  {
    text: "促進",
    reading: "そくしん (sokushin)",
    type: "word",
    register: "formal",
    cefr: "N2",
    meaning: "penggalakan, percepatan",
    useWhen: "berita/dokumen resmi — mis. penggalakan ekonomi",
    examples: [{ en: "経済成長の促進が求められています。\nKeizai seichō no sokushin ga motomerarete imasu.", id: "Diperlukan penggalakan pertumbuhan ekonomi." }],
  },
  {
    text: "曖昧",
    reading: "あいまい (aimai)",
    type: "word",
    register: "neutral",
    cefr: "N2",
    meaning: "ambigu, nggak jelas",
    useWhen: "sering untuk deskripsi gaya komunikasi",
    examples: [{ en: "彼の答えは曖昧でした。\nKare no kotae wa aimai deshita.", id: "Jawabannya ambigu." }],
  },

  // ── Kosakata N1 (level = perkiraan) ──
  {
    text: "精神",
    reading: "せいしん (seishin)",
    type: "word",
    register: "formal",
    cefr: "N1",
    meaning: "jiwa, semangat, mental",
    useWhen: "tulisan formal; paling sering di 精神的（せいしんてき） mental, 精神力（せいしんりょく） kekuatan mental. Idiom 'sungguh-sungguh' yang standar itu 心を込める（こころをこめる）",
    examples: [{ en: "彼は精神的に強いです。\nKare wa seishinteki ni tsuyoi desu.", id: "Dia kuat secara mental." }],
  },
  {
    text: "覆う",
    reading: "おう (ō)",
    type: "word",
    register: "formal",
    cefr: "N1",
    meaning: "menutupi",
    useWhen: "verba N1 — bentuk て: 覆って（おって）",
    examples: [{ en: "雲が空を覆っています。\nKumo ga sora o ōtte imasu.", id: "Awan menutupi langit." }],
  },
];

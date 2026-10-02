/**
 * Kategori explore khusus bahasa Jepang (mode JA) — frasa & ungkapan JEPANG,
 * bukan terjemahan idiom Inggris. Seed = contoh referensi buat LLM.
 */
export const EXPLORE_CATEGORIES_JA: { slug: string; label: string; seed: string[] }[] = [
  {
    slug: "reaksi-jp",
    label: "Reaksi spontan",
    seed: ["やばい", "うそでしょ", "すごい", "えー", "マジで", "びっくりした"],
  },
  {
    slug: "semangat-jp",
    label: "Ngedoain / semangatin",
    seed: ["がんばって", "その調子", "大丈夫だよ", "きっとできる"],
  },
  {
    slug: "setuju-jp",
    label: "Setuju & nggak setuju",
    seed: ["そうだね", "たしかに", "いいね", "ちょっと難しいな", "無理かも"],
  },
  {
    slug: "obrolan-santai-jp",
    label: "Obrolan santai",
    seed: ["元気？", "ひま？", "あとでね", "ありがと", "また今度"],
  },
  {
    slug: "kantor-jp",
    label: "Di kantor",
    seed: ["お疲れさまです", "確認します", "少しお時間いいですか", "承知しました"],
  },
  {
    slug: "perasaan-jp",
    label: "Perasaan sehari-hari",
    seed: ["疲れた", "うれしい", "寂しい", "イライラする", "眠い"],
  },
];

/** Kategori explore — BLUEPRINT §8 seed. */
export const EXPLORE_CATEGORIES: { slug: string; label: string; seed: string[] }[] = [
  {
    slug: "reaksi-spontan",
    label: "Reaksi spontan",
    seed: ["yuck", "ew", "gross", "ugh", "whoa", "oops", "no way"],
  },
  {
    slug: "ngedoain-semangatin",
    label: "Ngedoain / semangatin",
    seed: ["good luck", "fingers crossed", "break a leg", "hang in there"],
  },
  {
    slug: "setuju-tidak-setuju",
    label: "Setuju & nggak setuju",
    seed: ["totally", "fair enough", "I'm not so sure", "no way"],
  },
  {
    slug: "obrolan-santai",
    label: "Obrolan santai",
    seed: ["what's up", "hang out", "catch up", "I'm down", "sounds good"],
  },
  {
    slug: "di-kantor",
    label: "Di kantor",
    seed: ["heads up", "touch base", "on the same page", "ballpark", "circle back"],
  },
  {
    slug: "chat-texting",
    label: "Chat & texting",
    seed: ["brb", "idk", "tbh", "imo", "ngl", "lol"],
  },
  {
    slug: "perasaan-sehari-hari",
    label: "Perasaan sehari-hari",
    seed: ["I'm beat", "I'm stoked", "bummed", "freaking out"],
  },
  {
    slug: "phrasal-verb-umum",
    label: "Phrasal verb umum",
    seed: ["give up", "figure out", "come up with", "look forward to"],
  },
  {
    slug: "idiom-umum",
    label: "Idiom umum",
    seed: ["piece of cake", "under the weather", "a blessing in disguise"],
  },
  {
    slug: "it-software",
    label: "Kerja IT & software",
    seed: ["push back", "bandwidth", "deep dive", "edge case", "ship it", "standup", "deploy", "rollback", "tech debt", "scope creep"],
  },
  {
    slug: "kantor-profesional",
    label: "Karir & profesional",
    seed: ["follow up", "take the lead", "on my plate", "touch base", "get back to you", "eod", "deadline-driven", "team player", "whiteboard", "1:1"],
  },
  {
    slug: "bisnis-negosiasi",
    label: "Bisnis & negosiasi",
    seed: ["win-win", "bottom line", "cut a deal", "leverage", "walk away", "counteroffer", "non-binding", "due diligence", "stakeholder", "close the deal"],
  },
  {
    slug: "email-dokumen",
    label: "Email & dokumen",
    seed: ["please find attached", "as per", "at your earliest convenience", "kind regards", "follow up on", "loop in", "to whom it may concern", "asap", "regarding", "apologize for the inconvenience"],
  },
  {
    slug: "wawancara-kerja",
    label: "Wawancara kerja",
    seed: ["tell me about yourself", "my strength is", "I thrive on", "cross-functional", "I owned the project", "growth mindset", "notice period", "salary expectations", "dress code", "offer letter"],
  },
];

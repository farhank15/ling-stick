import { ttsLang } from "~/lib/utils.shared";

/**
 * TTS warm-up — klik speaker PERTAMA selalu terasa lama karena browser baru
 * kala itu memuat engine + daftar suara (getVoices async, utterance pertama
 * sekaligus inisialisasi). Pemanasan dilakukan sekali saat app mount, jadi
 * klik berikutnya langsung bunyi.
 * matcha: cold speechSynthesis = first-click delay; warm-up di layout, bukan
 * per tombol (satu kali cukup, jangan tiap klik).
 */

let warmed = false;

function voices(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis?.getVoices() ?? [];
  } catch {
    return [];
  }
}

/** Suara terbaik buat lang ("ja-JP"/"en-US"): cocok prefix, fallback default. */
export function pickVoice(lang: string): SpeechSynthesisVoice | null {
  const list = voices();
  if (!list.length) return null;
  const short = lang.split("-")[0]!.toLowerCase();
  return (
    list.find((v) => v.lang.toLowerCase().startsWith(short) && v.localService) ??
    list.find((v) => v.lang.toLowerCase().startsWith(short)) ??
    list.find((v) => v.default) ??
    null
  );
}

/** Panaskan engine: paksa browser memuat suara sejak awal (bukan saat klik). */
export function warmUpTts(): void {
  if (warmed || typeof window === "undefined" || !window.speechSynthesis) return;
  warmed = true;
  try {
    // Pancing daftar suara (Chrome: kosong sampai event voiceschanged).
    voices();
    window.speechSynthesis.onvoiceschanged = () => voices();
    // Ucapkan teks kosong sekali — inisialisasi engine tanpa suara keluar.
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* TTS opsional — gagal diam-diam */
  }
}

/** Bicara dengan voice yang sudah dimuat (jatuh ke default kalau belum siap). */
export function speakText(text: string, lang?: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
  const target = lang ?? ttsLang(text);
  const u = new SpeechSynthesisUtterance(text);
  u.lang = target;
  const v = pickVoice(target);
  if (v) u.voice = v;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

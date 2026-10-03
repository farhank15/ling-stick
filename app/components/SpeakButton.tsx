import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { ttsLang } from "~/lib/utils.shared";
import { pickVoice, warmUpTts } from "~/lib/tts.client";

/**
 * SpeakButton — tombol speaker dengan feedback visual:
 * - Saat TTS masih memuat/memutar → icon jadi SPINNER (user tahu lagi bunyi, gak spam klik).
 * - Klik saat busy diabaikan (anti-spam).
 * - Reset otomatis pas `onend` / error + safety timeout kalau engine gagal diam-diam.
 * `className` = ukuran icon. `buttonClassName` = class tombol, dipakai apa adanya.
 * `children` = konten tambahan (teks "Dengarkan lagi" dsb.). `hideIcon` = icon cuma
 * muncul pas busy (buat tombol teks-only biar pas idle tetap bersih).
 */
export function SpeakButton({
  text,
  lang,
  className = "h-4 w-4",
  buttonClassName = "shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:text-teal-600 dark:text-zinc-500 dark:hover:text-teal-400",
  title = "Dengarkan",
  children,
  hideIcon = false,
}: {
  text: string;
  /** Paksa bahasa TTS (mis. "ja-JP"). Kosong → auto dari isi teks. */
  lang?: string;
  className?: string;
  buttonClassName?: string;
  title?: string;
  children?: ReactNode;
  hideIcon?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bersih-bersih kalau komponen unmount pas lagi nyala.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const click = useCallback(() => {
    if (busy) return; // anti-spam: satu suara dalam satu waktu
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    warmUpTts(); // pastikan engine sudah dipanaskan (aman dipanggil berulang)
    const u = new SpeechSynthesisUtterance(text);
    const target = lang ?? ttsLang(text);
    u.lang = target;
    const v = pickVoice(target);
    if (v) u.voice = v;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer.current) clearTimeout(timer.current);
      setBusy(false);
    };
    u.onend = finish;
    u.onerror = finish;
    // Safety: kalau engine gak manggil onend/onerror (bug beberapa browser),
    // reset sendiri setelah estimasi durasi + 6 detik.
    const est = Math.max(4000, text.length * 120);
    timer.current = setTimeout(finish, est + 6000);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setBusy(true);
  }, [busy, text, lang]);

  return (
    <button
      type="button"
      className={buttonClassName}
      title={busy ? "Lagi bunyi…" : title}
      aria-label={busy ? "Lagi bunyi" : title}
      aria-busy={busy}
      onClick={click}
    >
      {busy ? (
        <Loader2 className={`${className} animate-spin`} />
      ) : hideIcon ? null : (
        <Volume2 className={className} />
      )}
      {children}
    </button>
  );
}

/** Stopword EN+ID — jangan disorot (polusi hijau di mana-mana). */
const HIGHLIGHT_STOP = new Set(
  "yang,dari,untuk,dengan,adalah,pada,atau,ini,itu,dan,yaitu,the,and,for,with,from,that,this,have,will,what,when,your,you,are,was,were,has,had,not,but,all,can,their,there,them,then,than".split(","),
);

/**
 * Highlight — sorot frasa persis; kalau tidak cocok, sorot kata penting
 * (≥4 huruf, bukan stopword). Dipakai contoh EN di Terjemah & Library biar
 * kata yang dipelajari selalu kelihatan hijau.
 * matcha: contoh tanpa frasa persis tampil polos total.
 */
export function Highlight({ text, highlight }: { text: string; highlight: string }) {
  const t = highlight.trim();
  if (!t) return <>{text}</>;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const words = t
    .split(/\s+/)
    .filter((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length >= 4)
    .filter((w) => !HIGHLIGHT_STOP.has(w.toLowerCase()));
  const terms = [t, ...words];
  const re = new RegExp(`(${terms.map(esc).join("|")})`, "ig");
  const parts = text.split(re);
  const low = terms.map((x) => x.toLowerCase());
  return (
    <>
      {parts.map((p, i) =>
        low.includes(p.toLowerCase()) ? (
          <strong key={i} className="text-teal-700 dark:text-teal-400">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

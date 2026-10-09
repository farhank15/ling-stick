import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  Link,
  redirect,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Volume2,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { ttsLang } from "~/lib/utils.shared";
// Server fns HANYA dipakai di loader/action — import .server di module level
// bikin build client gagal (RRv7). Maka di-dynamic import; konstanta client-safe
// dari reading.shared.
import { isReadingLevelFor, readingLevels, type ReadingLevel } from "~/lib/reading.shared";
import { JaText, hasJa } from "~/components/JaText";
import { SpeakButton } from "~/components/SpeakButton";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Reading — LingStick" }];
export const handle = { title: "Reading" };

function speak(text: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang ?? ttsLang(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang(); // JA (JLPT) & EN (CEFR) — dua-duanya ada Reading

  const { getReading, listReadings, nextReading } = await import("~/lib/reading.server");
  const url = new URL(request.url);
  const openId = Number(url.searchParams.get("open")) || null;
  if (openId) {
    const reading = await getReading(lang, openId);
    if (!reading) throw redirect("/reading");
    return { mode: "reader" as const, lang, reading, list: [] };
  }

  const levelParam = url.searchParams.get("level");
  const level = isReadingLevelFor(lang, levelParam) ? levelParam! : null;
  return {
    mode: "list" as const,
    lang,
    level,
    levels: readingLevels(lang),
    reading: null,
    list: await listReadings(lang, level ?? undefined),
    // Graded path: bacaan berikutnya yang belum dibaca (termudah dulu).
    nextUp: level ? null : await nextReading(lang),
  };
}

type ReadingListItem = {
  id: number;
  title: string;
  titleEn: string | null;
  level: string;
  topic: string;
  wordCount: number;
  readCount: number;
};

/* ── Halaman list ── */
function ReadingList({
  list,
  level,
  lang,
  levels,
  nextUp,
}: {
  list: ReadingListItem[];
  level: string | null;
  lang: string;
  levels: readonly string[];
  nextUp: ReadingListItem | null;
}) {
  const toast = useToast();
  const navigation = useNavigation();
  const generating = navigation.state !== "idle";

  // Anti-spam + tahan layar "menulis" sampai selesai (generate LLM bisa 30-60 detik).
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genOk, setGenOk] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const generate = async () => {
    if (busy || generating) return; // debounce — sekali jalan sampai selesai
    setBusy(true);
    setGenError(null);
    setGenOk(null);
    const startedAt = Date.now();
    const genLevel = level ?? levels[0]!;
    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", level: genLevel }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Generate gagal");
      if (data.id == null) throw new Error("Generate gagal");
      // Langsung buka bacaan barunya.
      window.location.href = `/reading?open=${data.id}`;
    } catch (e) {
      // Response hilang di jalan tapi row kepalang masuk DB (kasus EN kemarin) →
      // tanya bacaan terbaru; kalau ada yang lebih baru dari mulai-generate,
      // itu pasti hasil generate ini — langsung buka, jangan tunjukin error.
      try {
        const r = await fetch("/api/reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "latest", level: genLevel, id: startedAt }),
        });
        const d = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: number };
        if (r.ok && d.ok && d.id != null) {
          window.location.href = `/reading?open=${d.id}`;
          return;
        }
      } catch {
        /* recovery gagal → tunjukin error asli */
      }
      setGenError(e instanceof Error ? e.message : "Generate gagal");
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (deleteId == null || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleteId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Gagal menghapus");
      toast("Bacaan dihapus");
      setDeleteId(null);
      window.location.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gagal menghapus");
      setDeleting(false);
    }
  };

  const delTarget = list.find((r) => r.id === deleteId);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {lang === "ja" ? (
          <>
            Bacaan pendek bahasa Jepang — berita, cerpen, topik sehari-hari. Kanji warna{" "}
            <span className="font-semibold text-teal-600 dark:text-teal-400">hijau</span> (kana
            tetap netral), hiragana kecil nempel di atas kanji; romaji &amp; arti disembunyikan
            default.
          </>
        ) : (
          <>Bacaan pendek bahasa Inggris per level CEFR — arti Indonesia disembunyikan default.</>
        )}
      </p>

      {/* Level chips — JA: N5-N1, EN: A1-C2 */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <Link to="/reading" className={`chip shrink-0 justify-center ${!level ? "chip-active" : ""}`}>
          Semua
        </Link>
        {levels.map((l) => (
          <Link
            key={l}
            to={`/reading?level=${l}`}
            className={`chip shrink-0 justify-center ${level === l ? "chip-active" : ""}`}
          >
            {l}
          </Link>
        ))}
      </div>

      {genOk ? (
        <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-300">
          {genOk}
        </div>
      ) : null}
      {genError ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          Gagal: {genError}
        </div>
      ) : null}

      {/* Graded path: lanjut ke bacaan berikutnya yang belum dibaca */}
      {nextUp ? (
        <Link
          to={`/reading?open=${nextUp.id}`}
          className="btn-primary mx-auto w-full max-w-xl justify-center gap-1.5"
        >
          <BookOpenCheck className="h-4 w-4" /> Lanjut baca: {nextUp.title} ({nextUp.level})
        </Link>
      ) : null}

      {/* Generate bacaan baru — debounce: disabled sampai selesai */}
      <button className="btn-primary mx-auto w-full max-w-xl" onClick={() => void generate()} disabled={busy || generating}>
        {busy || generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Menulis bacaan… (±30 detik)
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Bacaan baru {level ? `level ${level}` : `level ${levels[0]}`}
          </>
        )}
      </button>

      {list.length === 0 ? (
        <div className="card py-10 text-center">
          <BookOpenCheck className="mx-auto h-10 w-10 text-teal-600 dark:text-teal-400" strokeWidth={1.5} />
          <p className="mt-3 font-medium">Belum ada bacaan{level ? ` level ${level}` : ""}</p>
          <p className="mt-1 text-sm text-zinc-500">Tap tombol di atas — bacaan dibikin ±30 detik.</p>
        </div>
      ) : (
        // Daftar bacaan: 2 kolom di desktop.
        <div className="grid gap-2 lg:grid-cols-2">
          {list.map((r) => (
            <div
              key={r.id}
              className="card relative flex items-center gap-3 p-4 transition-colors hover:border-teal-300 dark:hover:border-teal-800"
            >
              <Link to={`/reading?open=${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  {r.level}
                </span>
                <span className="min-w-0 flex-1">
                  {hasJa(r.title) ? (
                    <JaText text={r.title} kanjiClassName="text-teal-700 dark:text-teal-400" className="block font-semibold" />
                  ) : (
                    <span className="block font-semibold">{r.title}</span>
                  )}
                  {/* Arti judul — FULL WRAP, gak di-truncate biar kebaca semua */}
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-500">
                    {r.titleEn ?? r.topic}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-400">
                    {r.wordCount} kata · dibaca {r.readCount}×
                  </span>
                </span>
              </Link>
              {/* Delete di luar Link biar gak nested-interactive */}
              <button
                className="absolute top-2 right-2 rounded-lg p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500 dark:text-zinc-600 dark:hover:bg-red-950"
                title="Hapus bacaan"
                aria-label={`Hapus ${r.title}`}
                onClick={() => setDeleteId(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {list.length > 0 && !busy && !generating ? (
        <button className="btn-secondary mx-auto w-full max-w-xl gap-1" onClick={() => void generate()}>
          <Plus className="h-4 w-4" /> Tambah bacaan {level ?? levels[0]}
        </button>
      ) : null}
      <p className="text-center text-xs text-zinc-400">
        Bisa dibaca berulang kali — tiap dibuka dihitung, tapi gak pernah habis.
      </p>

      <ConfirmModal
        open={deleteId != null}
        title="Hapus bacaan ini?"
        message={delTarget ? `“${delTarget.titleEn ?? delTarget.title}” akan dihapus permanen.` : ""}
        busy={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

/* ── Halaman baca ── */
function ReadingReader({
  reading,
}: {
  reading: {
    id: number;
    title: string;
    titleEn: string | null;
    level: string;
    body: {
      paragraphs: { text: string; kana: string; romaji?: string; arti?: string }[];
      vocab?: { text: string; kana?: string; meaning: string }[];
    };
  };
}) {
  const toast = useToast();
  // Romaji & arti hidden by default — nyalain per sesi baca.
  const [showRomaji, setShowRomaji] = useState(false);
  const [showArti, setShowArti] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  // EN gak punya romaji → chip Romaji disembunyikan total (bukan cuma nonaktif).
  const hasRomaji = reading.body.paragraphs.some((p) => Boolean(p.romaji));

  // Hitung sekali per bacaan.
  const counted = useRef<number | null>(null);
  useEffect(() => {
    if (counted.current === reading.id) return;
    counted.current = reading.id;
    void fetch("/api/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id: reading.id }),
    }).catch(() => {});
  }, [reading.id]);

  // Layar baca: lebar artikel di desktop (2xl), tombol tetap wajar.
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/reading" className="btn-ghost gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Daftar
        </Link>
        <span className="badge bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
          {reading.level}
        </span>
      </div>

      <div className="text-center">
        {hasJa(reading.title) ? (
          <h1 className="text-xl font-bold tracking-tight">
            <JaText text={reading.title} kanjiClassName="text-teal-700 dark:text-teal-400" className="text-xl font-bold" />
          </h1>
        ) : (
          <h1 className="text-xl font-bold tracking-tight">{reading.title}</h1>
        )}
        {reading.titleEn ? <p className="mt-0.5 text-xs text-zinc-400">{reading.titleEn}</p> : null}
      </div>

      {/* Toggle sesi baca: romaji (khusus JA), arti kalimat, arti kata */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {hasRomaji ? (
          <button
            className={`chip justify-center ${showRomaji ? "chip-active" : ""}`}
            onClick={() => setShowRomaji((v) => !v)}
            title="Tampilkan romaji di bawah tiap paragraf"
          >
            <Type className="h-3.5 w-3.5" /> Romaji
          </button>
        ) : null}
        <button
          className={`chip justify-center ${showArti ? "chip-active" : ""}`}
          onClick={() => setShowArti((v) => !v)}
          title="Tampilkan arti kalimat tiap paragraf"
        >
          <BookOpenCheck className="h-3.5 w-3.5" /> Arti kalimat
        </button>
        <button
          className={`chip justify-center ${showVocab ? "chip-active" : ""}`}
          onClick={() => setShowVocab((v) => !v)}
          title="Tampilkan daftar kosakata penting"
        >
          Kosakata
        </button>
      </div>

      {/* Isi bacaan */}
      <div className="card space-y-5 p-5">
        {reading.body.paragraphs.map((p, i) => (
          <div key={i} className="group">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 leading-loose">
                {hasJa(p.text) ? (
                  /* JA: kanji hijau + furigana per-run redup di atasnya (kana murni polos) */
                  <JaText
                    text={p.text}
                    reading={p.kana}
                    kanjiClassName="text-teal-700 dark:text-teal-400"
                    className="text-lg"
                  />
                ) : (
                  /* EN: tipografi readable — ukuran lega, leading longgar, kontras lembut */
                  <p className="text-[17px] leading-[1.9] text-zinc-800 dark:text-zinc-100">{p.text}</p>
                )}
                {showRomaji && p.romaji ? (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{p.romaji}</p>
                ) : null}
                {showArti ? (
                  <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                    {p.arti ?? "—"}
                  </p>
                ) : null}
              </div>
              <SpeakButton
                text={p.text}
                buttonClassName="shrink-0 rounded-lg p-1 text-zinc-300 opacity-0 transition-opacity hover:text-teal-600 group-hover:opacity-100 dark:text-zinc-600"
              />
            </div>
          </div>
        ))}
      </div>

      {/* matcha: blok "Arti kalimat" duplikat dibuang — arti cukup inline per paragraf biar EN gak baca terjemahan 2x */}

      {/* Kosakata penting — hidden by default */}
      {showVocab ? (
        reading.body.vocab && reading.body.vocab.length > 0 ? (
          <div className="card space-y-2">
            <p className="label">Kosakata penting</p>
            <ul className="space-y-1.5">
              {reading.body.vocab.map((v, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <SpeakButton
                    text={v.text}
                    className="h-3.5 w-3.5"
                    buttonClassName="shrink-0 rounded-lg p-0.5 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-300"
                  />
                  <span className="font-semibold">{v.text}</span>
                  {v.kana ? <span className="text-xs text-zinc-400">{v.kana}</span> : null}
                  <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-400">
                    — {v.meaning}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-center text-xs text-zinc-400">Bacaan ini gak punya daftar kosakata.</p>
        )
      ) : null}

      <div className="flex gap-2">
        <Link to="/reading" className="btn-secondary flex-1 justify-center">
          Daftar bacaan
        </Link>
        <SpeakButton
          text={reading.body.paragraphs.map((p) => p.text).join(" ")}
          className="h-4 w-4"
          buttonClassName="btn-primary flex-1 justify-center gap-1"
        >
          Bacakan semua
        </SpeakButton>
      </div>
      <button
        className="btn-ghost w-full justify-center text-xs"
        onClick={() => {
          toast("Bacaan tersimpan — bisa dibaca lagi kapan pun dari daftar");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        Baca ulang dari awal
      </button>
    </div>
  );
}

export default function ReadingPage() {
  const data = useLoaderData<typeof loader>();
  return (
    <div className="mx-auto max-w-md">
      {data.mode === "reader" && data.reading ? (
        <ReadingReader
          reading={{
            id: data.reading.id,
            title: data.reading.title,
            titleEn: data.reading.titleEn,
            level: data.reading.level,
            body: data.reading.body,
          }}
        />
      ) : (
        <ReadingList
          list={data.list}
          level={"level" in data ? data.level : null}
          lang={data.lang}
          levels={data.levels}
          nextUp={"nextUp" in data ? data.nextUp : null}
        />
      )}
    </div>
  );
}

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  Link,
  redirect,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Type,
  Volume2,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { ttsLang } from "~/lib/utils.shared";
// Server fns HANYA dipakai di loader/action — tapi import .server di module level
// bikin build client gagal (RRv7). Maka server fns di-dynamic import, konstanta
// client-safe dari reading.shared.
import { READING_LEVELS, isReadingLevel } from "~/lib/reading.shared";
import { JaText, hasJa } from "~/components/JaText";
import { SpeakButton } from "~/components/SpeakButton";
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
  if ((await getTargetLang()) !== "ja") throw redirect("/review"); // fitur khusus mode Jepang

  const { generateReading, getReading, listReadings } = await import("~/lib/reading.server");

  const url = new URL(request.url);
  const openId = Number(url.searchParams.get("open")) || null;
  if (openId) {
    const reading = await getReading(openId);
    if (!reading) throw redirect("/reading");
    return { mode: "reader" as const, reading, list: [] };
  }

  const levelParam = url.searchParams.get("level");
  const level = isReadingLevel(levelParam) ? levelParam : null;
  return { mode: "list" as const, level, reading: null, list: await listReadings(level ?? undefined) };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  if ((await getTargetLang()) !== "ja") {
    return Response.json({ error: "Khusus mode Jepang" }, { status: 400 });
  }
  const { bumpReadCount, generateReading, listReadings } = await import("~/lib/reading.server");
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    level?: string;
    variant?: number;
  };

  if (body.action === "read") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id nggak valid" }, { status: 400 });
    await bumpReadCount(id);
    return Response.json({ ok: true });
  }

  if (body.action === "generate") {
    const level = isReadingLevel(body.level) ? body.level : "N5";
    try {
      // Hitung row per level → variant = jumlah yang sudah ada (topik bergilir).
      const existing = await listReadings(level);
      const { id, title } = await generateReading(level, existing.length);
      return Response.json({ ok: true, id, title });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Generate gagal" },
        { status: 502 },
      );
    }
  }
  return Response.json({ error: "action nggak dikenal" }, { status: 400 });
}

/* ── Halaman list ── */
function ReadingList({
  list,
  level,
}: {
  list: {
    id: number;
    title: string;
    titleEn: string | null;
    level: string;
    topic: string;
    wordCount: number;
    readCount: number;
  }[];
  level: string | null;
}) {
  const toast = useToast();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const generating = navigation.state !== "idle";

  const generate = async (lv: string) => {
    try {
      const res = await fetch("/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", level: lv, variant: Date.now() % 7 }),
      });
      const data = (await res.json()) as { ok?: boolean; id?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Generate gagal");
      // Langsung buka bacaan barunya.
      window.location.href = `/reading?open=${data.id}`;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Generate gagal");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Bacaan pendek bahasa Jepang — berita, cerpen, topik sehari-hari. Kanji warna{" "}
        <span className="font-semibold text-teal-600 dark:text-teal-400">hijau</span> biar gampang
        dilirik, hiragana kecil nempel di atasnya; romaji &amp; arti disembunyikan default.
      </p>

      {/* Level chips */}
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <Link
          to="/reading"
          className={`chip shrink-0 justify-center ${!level ? "chip-active" : ""}`}
        >
          Semua
        </Link>
        {READING_LEVELS.map((l) => (
          <Link
            key={l}
            to={`/reading?level=${l}`}
            className={`chip shrink-0 justify-center ${level === l ? "chip-active" : ""}`}
          >
            {l}
          </Link>
        ))}
      </div>

      {/* Generate bacaan baru — level terpilih atau N5 */}
      <button className="btn-primary w-full" onClick={() => void generate(level ?? "N5")} disabled={generating}>
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Menulis bacaan…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Bacaan baru {level ? `level ${level}` : "N5"}
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
        <div className="space-y-2">
          {list.map((r) => (
            <Link
              key={r.id}
              to={`/reading?open=${r.id}`}
              className="card flex items-center gap-3 p-4 transition-colors hover:border-teal-300 dark:hover:border-teal-800"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                {r.level}
              </span>
              <span className="min-w-0 flex-1">
                {hasJa(r.title) ? (
                  <JaText text={r.title} className="block truncate font-semibold" />
                ) : (
                  <span className="block truncate font-semibold">{r.title}</span>
                )}
                <span className="block truncate text-xs text-zinc-500">
                  {r.titleEn ?? r.topic} · {r.wordCount} kata · dibaca {r.readCount}×
                </span>
              </span>
              <Volume2 className="h-4 w-4 shrink-0 text-zinc-300" />
            </Link>
          ))}
        </div>
      )}

      {list.length > 0 && !generating ? (
        <button className="btn-secondary w-full gap-1" onClick={() => void generate(level ?? "N5")}>
          <Plus className="h-4 w-4" /> Tambah bacaan {level ?? "N5"}
        </button>
      ) : null}
      <p className="text-center text-xs text-zinc-400">
        Bisa dibaca berulang kali — tiap dibuka dihitung, tapi gak pernah habis.
      </p>
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
      paragraphs: { text: string; kana: string; romaji?: string }[];
      vocab?: { text: string; kana?: string; meaning: string }[];
    };
  };
}) {
  const toast = useToast();
  // Romaji & arti vocab hidden by default — nyalain per sesi baca.
  const [showRomaji, setShowRomaji] = useState(false);
  const [showVocab, setShowVocab] = useState(false);

  // Hitung sekali per bacaan.
  const counted = useRef<number | null>(null);
  useEffect(() => {
    if (counted.current === reading.id) return;
    counted.current = reading.id;
    void fetch("/reading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id: reading.id }),
    }).catch(() => {});
  }, [reading.id]);

  return (
    <div className="space-y-4">
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
            <JaText text={reading.title} className="text-xl font-bold" />
          </h1>
        ) : (
          <h1 className="text-xl font-bold tracking-tight">{reading.title}</h1>
        )}
        {reading.titleEn ? <p className="mt-0.5 text-xs text-zinc-400">{reading.titleEn}</p> : null}
      </div>

      {/* Toggle sesi baca: romaji & arti */}
      <div className="flex justify-center gap-1.5">
        <button
          className={`chip justify-center ${showRomaji ? "chip-active" : ""}`}
          onClick={() => setShowRomaji((v) => !v)}
          title="Tampilkan romaji di bawah tiap paragraf"
        >
          <Type className="h-3.5 w-3.5" /> Romaji
        </button>
        <button
          className={`chip justify-center ${showVocab ? "chip-active" : ""}`}
          onClick={() => setShowVocab((v) => !v)}
          title="Tampilkan daftar kosakata penting"
        >
          <BookOpenCheck className="h-3.5 w-3.5" /> Arti kata
        </button>
      </div>

      {/* Isi bacaan */}
      <div className="card space-y-5 p-5">
        {reading.body.paragraphs.map((p, i) => (
          <div key={i} className="group">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 leading-loose">
                {hasJa(p.text) ? (
                  /* Kanji hijau + furigana redup di atasnya — gaya Reading */
                  <JaText
                    text={p.text}
                    reading={p.kana}
                    kanjiClassName="text-teal-700 dark:text-teal-400"
                    className="text-lg"
                  />
                ) : (
                  <p className="text-lg">{p.text}</p>
                )}
                {showRomaji && p.romaji ? (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{p.romaji}</p>
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

      {/* Vocab penting — hidden by default */}
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
                  <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-400">
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
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Baca ulang dari awal
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
        <ReadingList list={data.list} level={"level" in data ? data.level : null} />
      )}
    </div>
  );
}

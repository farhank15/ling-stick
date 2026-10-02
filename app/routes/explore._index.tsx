import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { exploreItems, items } from "~/lib/db/schema";
import { EXPLORE_CATEGORIES, EXPLORE_CATEGORIES_JA } from "~/lib/explore.categories";
import { getTargetLang } from "~/lib/lang.server";
import { JaText, hasJa } from "~/components/JaText";
import { and, eq, inArray, sql } from "drizzle-orm";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Explore — LingStick" }];
export const handle = { title: "Explore" };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  // "Expression of the day": 3 ekspresi acak dari cache, urutan stabil per hari.
  // Dijalankan paralel dengan query count kategori — hemat 1 round-trip Turso.
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  const lang = await getTargetLang();
  const [eotdRaw, counts] = await Promise.all([
    db
      .select()
      .from(exploreItems)
      .where(
        and(
          eq(exploreItems.hidden, 0),
          eq(exploreItems.lang, lang),
          // Ekspresi yang udah tersimpan di Library gak muncul lagi.
          sql`NOT EXISTS (SELECT 1 FROM items i WHERE i.text_norm = trim(lower(${exploreItems.text})))`,
        ),
      )
      .orderBy(sql`((id * 2654435761) + ${dayNumber}) % 1000000007`)
      .limit(3),
    // Jumlah ekspresi tersimpan per kategori (yang belum di-hide).
    db
      .select({ category: exploreItems.category, total: sql<number>`count(*)` })
      .from(exploreItems)
      .where(and(eq(exploreItems.hidden, 0), eq(exploreItems.lang, lang)))
      .groupBy(exploreItems.category),
  ]);

  // Tandai yang sudah ada di Library.
  const savedNorms = new Set<string>();
  if (eotdRaw.length > 0) {
    const saved = await db
      .select({ textNorm: items.textNorm })
      .from(items)
      .where(and(eq(items.lang, lang), inArray(items.textNorm, eotdRaw.map((r) => r.text.trim().toLowerCase()))));
    for (const s of saved) savedNorms.add(s.textNorm);
  }
  const eotd = eotdRaw.map((r) => ({
    ...r,
    saved: savedNorms.has(r.text.trim().toLowerCase()),
    // Kana penuh contoh pertama — sumber furigana di kartu EOTD.
    exampleKana: parseFirstKana(r.examplesJson),
  }));

  const countMap = Object.fromEntries(counts.map((c) => [c.category, Number(c.total)]));
  const pool = lang === "ja" ? EXPLORE_CATEGORIES_JA : EXPLORE_CATEGORIES;

  return {
    lang,
    categories: pool.map((c) => ({ ...c, total: countMap[c.slug] ?? 0 })),
    eotd,
  };
}

type EotdRow = {
  id: number;
  text: string;
  reading?: string | null;
  type: string | null;
  register: string | null;
  meaningId: string | null;
  useWhenId: string | null;
  exampleEn: string | null;
  exampleId: string | null;
  exampleKana?: string | null;
  saved: boolean;
};

export default function ExploreIndex() {
  const { lang, categories, eotd } = useLoaderData<typeof loader>();
  const ja = lang === "ja";
  const revalidator = useRevalidator();
  const toast = useToast();

  const [savedTexts, setSavedTexts] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [savingText, setSavingText] = useState<string | null>(null);

  const visible = eotd.filter((e: EotdRow) => !hiddenIds.has(e.id));

  const save = async (e: EotdRow) => {
    if (savingText || savedTexts.has(e.text)) return;
    setSavingText(e.text);
    try {
      const res = await fetch("/api/explore-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: e.text,
          type: e.type ?? "idiom",
          register: e.register ?? "informal",
          meaningId: e.meaningId ?? "",
          notesId: e.useWhenId ?? "",
          source: "Expression of the day",
          exampleEn: e.exampleEn ?? "",
          exampleId: e.exampleId ?? "",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSavedTexts((s) => new Set(s).add(e.text));
        toast(data.existed ? "Sudah ada di Library — contoh ditambah" : "Tersimpan ke Library");
      } else {
        toast("Gagal menyimpan");
      }
    } catch {
      toast("Gagal menyimpan");
    } finally {
      setSavingText(null);
    }
  };

  const hide = async (e: EotdRow) => {
    try {
      await fetch(`/api/explore/${e.id}/hide`, { method: "POST" });
      setHiddenIds((s) => new Set(s).add(e.id));
      toast("Ditandai udah tahu");
    } catch {
      toast("Gagal");
    }
  };

  const isSaved = (e: EotdRow) => e.saved || savedTexts.has(e.text);

  return (
    <div className="space-y-5">
      {/* Kategori — chip scroll sticky, langsung lompat ke kategori mana pun */}
      <div className="sticky top-13 z-10 -mx-4 bg-zinc-50/95 px-4 py-2 backdrop-blur dark:bg-zinc-950/95">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to={`/explore/${c.slug}`}
              className="chip min-h-8 shrink-0 gap-1 px-2.5 text-[11px]"
            >
              {c.label}
              {c.total > 0 ? (
                <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] tabular-nums text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {c.total}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </div>

      {/* Expression of the day */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label">Expression of the day</h2>
          <span className="text-[11px] text-zinc-400">3 acak tiap hari</span>
        </div>
        {visible.length === 0 ? (
          <div className="card">
            <p className="text-sm text-zinc-500">
              Belum ada konten. Buka salah satu kategori di bawah — ekspresi bakal
              digenerate (sekali saja) lalu muncul di sini tiap hari.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((e: EotdRow) => (
              <div key={e.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  {ja && hasJa(e.text) ? (
                    <p className="min-w-0 font-semibold">
                      <JaText text={e.text} reading={e.reading} className="font-semibold" />
                    </p>
                  ) : (
                    <p className="font-semibold">{e.text}</p>
                  )}
                  {isSaved(e) ? (
                    <span className="badge inline-flex shrink-0 items-center gap-1 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Tersimpan
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{e.meaningId}</p>
                {e.exampleEn ? (
                  <p className="mt-1.5 text-sm italic">
                    {ja && hasJa(e.exampleEn) ? (
                      /* kana penuh = furigana per kanji */
                      <JaText text={e.exampleEn} reading={e.exampleKana ?? undefined} className="text-sm italic" />
                    ) : (
                      <>“{e.exampleEn}”</>
                    )}
                  </p>
                ) : null}
                {e.exampleId ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{e.exampleId}</p>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    className="btn-primary flex-1"
                    disabled={isSaved(e) || savingText === e.text}
                    onClick={() => void save(e)}
                  >
                    {isSaved(e) ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Tersimpan
                      </>
                    ) : savingText === e.text ? (
                      "Menyimpan…"
                    ) : (
                      "Simpan"
                    )}
                  </button>
                  <button className="btn-secondary" onClick={() => void hide(e)}>
                    Udah tahu
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Grid kategori */}
      <section>
        <h2 className="label mb-2">Kategori</h2>
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <Link
              key={c.slug}
              to={`/explore/${c.slug}`}
              className="card flex min-h-20 flex-col justify-between transition-colors hover:border-teal-500 dark:hover:border-teal-500"
            >
              <span className="text-sm font-semibold">{c.label}</span>
              <span className="text-[11px] text-zinc-400">
                {c.total > 0 ? `${c.total} ekspresi tersimpan` : "belum dijelajahi"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Ambil kana penuh dari contoh pertama examplesJson (sumber furigana kartu EOTD). */
function parseFirstKana(json: string | null): string | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json) as { kana?: unknown }[];
    const first = Array.isArray(arr) ? arr[0] : undefined;
    return typeof first?.kana === "string" && first.kana.trim() ? first.kana.trim() : null;
  } catch {
    return null;
  }
}

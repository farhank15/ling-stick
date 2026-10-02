import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles, Volume2 } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { exploreItems, items, settings } from "~/lib/db/schema";
import { EXPLORE_CATEGORIES, EXPLORE_CATEGORIES_JA } from "~/lib/explore.categories";
import { getTargetLang } from "~/lib/lang.server";
import { JaText, hasJa } from "~/components/JaText";
import { SpeakButton } from "~/components/SpeakButton";
import { and, asc, eq, inArray } from "drizzle-orm";
import { saveExploreRow } from "~/lib/items.server";
import { useToast } from "~/components/Toast";

export const handle = { title: "Explore", ownHeader: true };
export const meta: MetaFunction = () => [{ title: "Explore — LingStick" }];

/** Lock anti dobel-generate per kategori (StrictMode / multi-tab). */
const genLocks = new Map<string, number>();

import { ttsLang } from "~/lib/utils.shared";

function speak(text: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang ?? ttsLang(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function autoGenKey(category: string) {
  return `explore_autogen:${category}`;
}

function categoriesFor(lang: string) {
  return lang === "ja" ? EXPLORE_CATEGORIES_JA : EXPLORE_CATEGORIES;
}

/** Loader CUMA baca DB — cepat. Row dianotasi `saved` (sudah ada di Library?). */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const category = String(params.category ?? "");
  const lang = await getTargetLang();
  const cat = categoriesFor(lang).find((c) => c.slug === category);
  if (!cat) throw new Response("Kategori tidak dikenal", { status: 404 });

  const rows = await db
    .select()
    .from(exploreItems)
    .where(
      and(
        eq(exploreItems.category, category),
        eq(exploreItems.hidden, 0),
        eq(exploreItems.lang, await getTargetLang()),
      ),
    )
    .orderBy(asc(exploreItems.id));

  const normTexts = rows.map((r) => r.text.trim().toLowerCase());
  const savedNorms = new Set<string>();
  if (normTexts.length > 0) {
    const saved = await db
      .select({ textNorm: items.textNorm })
      .from(items)
      .where(and(eq(items.lang, await getTargetLang()), inArray(items.textNorm, normTexts)));
    for (const s of saved) savedNorms.add(s.textNorm);
  }

  const [autoMarker] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, autoGenKey(category)))
    .limit(1);

  // Ekspresi yang udah ada di Library (tersimpan) dibuang dari daftar —
  // explore cuma nampilin yang belum diproses.
  const shown = rows.filter((r) => !savedNorms.has(r.text.trim().toLowerCase()));

  return {
    category,
    label: cat.label,
    lang,
    rows: shown.map((r) => ({
      id: r.id,
      text: r.text,
      reading: r.reading,
      type: r.type,
      register: r.register,
      meaningId: r.meaningId,
      useWhenId: r.useWhenId,
      exampleEn: r.exampleEn,
      exampleId: r.exampleId,
      examplesJson: r.examplesJson,
      saved: savedNorms.has(r.text.trim().toLowerCase()),
    })),
    autoGenStarted: Boolean(autoMarker),
  };
}

/** Action = generate batch ekspresi via LLM (dipanggil dari client). */
export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const category = String(params.category ?? "");
  const lang = await getTargetLang();
  const cat = categoriesFor(lang).find((c) => c.slug === category);
  if (!cat) return Response.json({ ok: false, error: "Kategori tidak dikenal" }, { status: 404 });

  const now = Date.now();
  if ((genLocks.get(category) ?? 0) > now) {
    return Response.json({ ok: true, added: 0, pending: true });
  }
  genLocks.set(category, now + 120_000);

  try {
    const form = await request.formData().catch(() => null);
    const variant = Number(form?.get("variant") ?? 0) || 0;

    const existingRows = await db
      .select({ text: exploreItems.text })
      .from(exploreItems)
      .where(eq(exploreItems.category, category));

    const { llmExplore } = await import("~/lib/llm.server");
    const { data } = await llmExplore(
      category,
      existingRows.map((r) => r.text),
      variant,
    );

    // Duplikat dicek via Set dari query yang sama (tanpa query tambahan).
    const existingSet = new Set(existingRows.map((r) => r.text));

    let added = 0;
    for (const e of data.expressions) {
      if (existingSet.has(e.text)) continue;
      await saveExploreRow({
        category,
        text: e.text,
        type: e.type,
        register: e.register,
        meaningId: e.meaning_id,
        useWhenId: e.use_when_id ?? "",
        examplesJson: JSON.stringify(e.examples ?? []),
        reading: e.reading || e.romaji ? [e.reading || "", e.romaji ? `(${e.romaji})` : ""].filter(Boolean).join(" ").trim() : undefined,
      });
      existingSet.add(e.text);
      added++;
    }

    // Tandai auto-generate pernah jalan → nggak diulang tiap buka halaman.
    await db
      .insert(settings)
      .values({ key: autoGenKey(category), value: "1" })
      .onConflictDoNothing();

    genLocks.delete(category);
    return Response.json({ ok: true, added });
  } catch (e) {
    genLocks.delete(category);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Generate gagal" },
      { status: 502 },
    );
  }
}

type Row = {
  id: number;
  text: string;
  reading?: string | null;
  type: string | null;
  register: string | null;
  meaningId: string | null;
  useWhenId: string | null;
  exampleEn: string | null;
  exampleId: string | null;
  examplesJson: string | null;
  saved: boolean;
};

export default function ExploreCategory() {
  const { category, label, lang, rows, autoGenStarted } = useLoaderData<typeof loader>();
  const ja = lang === "ja";
  const revalidator = useRevalidator();
  const genFetcher = useFetcher<{ ok: boolean; added?: number; error?: string }>();
  const toast = useToast();

  const [variant, setVariant] = useState(0);
  const [savedTexts, setSavedTexts] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const [savingText, setSavingText] = useState<string | null>(null);
  const startedFor = useRef<string | null>(null);

  const generating = genFetcher.state !== "idle";
  const visible = rows.filter((r) => !hiddenIds.has(r.id));
  const empty = visible.length === 0;
  const genError = genFetcher.data?.ok === false ? genFetcher.data.error : null;

  const startGenerate = (v: number) =>
    genFetcher.submit({ variant: String(v) }, { method: "post" });

  // Auto-generate HANYA sekali per kategori (penanda di DB), bukan tiap buka.
  useEffect(() => {
    if (
      rows.length === 0 &&
      !autoGenStarted &&
      !generating &&
      startedFor.current !== category
    ) {
      startedFor.current = category;
      startGenerate(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, autoGenStarted, generating, category]);

  // Selama generate, poll loader → kartu muncul satu-satu.
  useEffect(() => {
    if (!generating || revalidator.state !== "idle") return;
    const t = setInterval(() => revalidator.revalidate(), 1500);
    return () => clearInterval(t);
  }, [generating, revalidator]);

  const save = async (r: Row) => {
    if (savingText || savedTexts.has(r.text)) return;
    setSavingText(r.text);
    try {
      const res = await fetch("/api/explore-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: r.text,
          type: r.type ?? "idiom",
          register: r.register ?? "informal",
          meaningId: r.meaningId ?? "",
          notesId: r.useWhenId ?? "",
          source: `Explore — ${label}`,
          exampleEn: r.exampleEn ?? "",
          exampleId: r.exampleId ?? "",
          examples: parsedExamples(r.examplesJson),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSavedTexts((s) => new Set(s).add(r.text));
        // Hilangkan dari list — udah masuk Library, gak perlu muncul lagi di explore.
        setHiddenIds((s) => new Set(s).add(r.id));
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

  const hide = async (r: Row) => {
    try {
      await fetch(`/api/explore/${r.id}/hide`, { method: "POST" });
      setHiddenIds((s) => new Set(s).add(r.id));
      toast("Ditandai udah tahu");
    } catch {
      toast("Gagal");
    }
  };

  const isSaved = (r: Row) => r.saved || savedTexts.has(r.text);

  // Contoh kalimat 3–5 (dari examples_json); fallback 1 contoh lama bila kosong.
  const examplesOf = (r: Row): { en: string; id: string; kana?: string | null }[] => {
    const list = parsedExamples(r.examplesJson);
    if (list.length > 0) return list;
    return r.exampleEn ? [{ en: r.exampleEn, id: r.exampleId ?? "" }] : [];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/explore" className="btn-ghost px-2" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <h1 className="flex-1 text-xl font-bold tracking-tight">{label}</h1>
        <span className="text-xs text-zinc-400">{visible.length} ekspresi</span>
      </div>

      {/* Pindah kategori — chip scroll sticky, kategori aktif disorot */}
      <div className="sticky top-13 z-10 -mx-4 bg-zinc-50/95 px-4 py-2 backdrop-blur dark:bg-zinc-950/95">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {(ja ? EXPLORE_CATEGORIES_JA : EXPLORE_CATEGORIES).map((c) => (
            <Link
              key={c.slug}
              to={`/explore/${c.slug}`}
              className={`chip min-h-8 shrink-0 px-2.5 text-[11px] ${
                c.slug === category ? "chip-active" : ""
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>

      {empty && generating ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Menyusun ekspresi buat kategori “{label}”… (±10 detik)
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {empty && !generating && genError ? (
        <div className="card space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">Gagal generate: {genError}</p>
          <button className="btn-primary w-full" onClick={() => startGenerate(0)}>
            Coba lagi
          </button>
        </div>
      ) : null}

      {empty && !generating && !genError && rows.length === 0 ? (
        <button className="btn-primary w-full" onClick={() => startGenerate(0)}>
          <Sparkles className="h-4 w-4" /> Generate sekarang
        </button>
      ) : null}

      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {ja && hasJa(r.text) ? (
                  /* JA: kanji + furigana redup + romaji di-balik icon toggle */
                  <p className="min-w-0 truncate font-semibold">
                    <JaText text={r.text} reading={r.reading} kanjiClassName="text-teal-700 dark:text-teal-400" className="font-semibold" />
                  </p>
                ) : (
                  <p className="truncate font-semibold">{r.text}</p>
                )}
                <SpeakButton
                  text={r.text}
                  buttonClassName="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                />
              </div>
              {isSaved(r) ? (
                <span className="badge inline-flex shrink-0 items-center gap-1 bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Tersimpan
                </span>
              ) : null}
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{r.meaningId}</p>
            {r.useWhenId ? (
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                Kapan dipakai: {r.useWhenId}
              </p>
            ) : null}
            {examplesOf(r).length > 0 ? (
              <div className="mt-2 space-y-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <p className="label">Contoh</p>
                {examplesOf(r).map((ex, i) => {
                  const jpLine = ex.en.split("\n")[0] ?? ex.en;
                  const romajiLine = ex.en.includes("\n") ? ex.en.split("\n").slice(1).join(" ") : null;
                  return (
                  <div key={i}>
                    <div className="flex items-start gap-1.5">
                      {hasJa(jpLine) ? (
                        <div className="min-w-0 flex-1">
                          {/* kana penuh = sumber furigana per kanji */}
                          <JaText text={jpLine} romaji={romajiLine} reading={ex.kana ?? undefined} kanjiClassName="text-teal-700 dark:text-teal-400" className="text-sm" />
                        </div>
                      ) : (
                        <p className="flex-1 text-sm">{ex.en}</p>
                      )}
                      <SpeakButton
                        text={jpLine}
                        className="h-3.5 w-3.5"
                        buttonClassName="shrink-0 rounded-lg p-0.5 text-zinc-400 hover:text-teal-600 dark:hover:text-teal-300"
                        title="Dengarkan contoh"
                      />
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{ex.id}</p>
                  </div>
                  );
                })}
              </div>
            ) : null}
            <div className="mt-1.5 flex gap-1">
              {r.register ? (
                <span className="badge bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {r.register}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={isSaved(r) || savingText === r.text}
                onClick={() => void save(r)}
              >
                {isSaved(r) ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Tersimpan
                  </>
                ) : savingText === r.text ? (
                  "Menyimpan…"
                ) : (
                  "Simpan untuk dipelajari"
                )}
              </button>
              <button className="btn-secondary" onClick={() => void hide(r)}>
                Udah tahu
              </button>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 ? (
        <button
          className="btn-secondary w-full"
          onClick={() => {
            const next = variant + 1;
            setVariant(next);
            startGenerate(next);
          }}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Tambah ekspresi lain
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

/** Parse aman kolom examples_json → {en,id}[]. */
function parsedExamples(json: string | null): { en: string; id: string; kana?: string | null }[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is { en: string; id: string; kana?: string | null } =>
          typeof (x as { en?: unknown })?.en === "string" &&
          typeof (x as { id?: unknown })?.id === "string",
      )
      .slice(0, 5);
  } catch {
    return [];
  }
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse space-y-2">
      <div className="h-4 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-3 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="h-3 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800/60" />
    </div>
  );
}

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { exploreItems, items, settings } from "~/lib/db/schema";
import { EXPLORE_CATEGORIES } from "~/lib/explore.categories";
import { and, asc, eq, inArray } from "drizzle-orm";
import { saveExploreRow } from "~/lib/items.server";
import { useToast } from "~/components/Toast";

export const handle = { title: "Explore" };

/** Lock anti dobel-generate per kategori (StrictMode / multi-tab). */
const genLocks = new Map<string, number>();

function autoGenKey(category: string) {
  return `explore_autogen:${category}`;
}

/** Loader CUMA baca DB — cepat. Row dianotasi `saved` (sudah ada di Library?). */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const category = String(params.category ?? "");
  const cat = EXPLORE_CATEGORIES.find((c) => c.slug === category);
  if (!cat) throw new Response("Kategori tidak dikenal", { status: 404 });

  const rows = await db
    .select()
    .from(exploreItems)
    .where(and(eq(exploreItems.category, category), eq(exploreItems.hidden, 0)))
    .orderBy(asc(exploreItems.id));

  const normTexts = rows.map((r) => r.text.trim().toLowerCase());
  const savedNorms = new Set<string>();
  if (normTexts.length > 0) {
    const saved = await db
      .select({ textNorm: items.textNorm })
      .from(items)
      .where(inArray(items.textNorm, normTexts));
    for (const s of saved) savedNorms.add(s.textNorm);
  }

  const [autoMarker] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, autoGenKey(category)))
    .limit(1);

  return {
    category,
    label: cat.label,
    rows: rows.map((r) => ({
      id: r.id,
      text: r.text,
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
  const cat = EXPLORE_CATEGORIES.find((c) => c.slug === category);
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

    let added = 0;
    for (const e of data.expressions) {
      const before = await db
        .select({ id: exploreItems.id })
        .from(exploreItems)
        .where(and(eq(exploreItems.category, category), eq(exploreItems.text, e.text)))
        .limit(1);
      if (before.length > 0) continue;
      await saveExploreRow({
        category,
        text: e.text,
        type: e.type,
        register: e.register,
        meaningId: e.meaning_id,
        useWhenId: e.use_when_id ?? "",
        examplesJson: JSON.stringify(e.examples ?? []),
      });
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
  const { category, label, rows, autoGenStarted } = useLoaderData<typeof loader>();
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
  const examplesOf = (r: Row): { en: string; id: string }[] => {
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
        <span className="text-xs text-zinc-400">{rows.length} ekspresi</span>
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
              <p className="font-semibold">{r.text}</p>
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
                {examplesOf(r).map((ex, i) => (
                  <div key={i}>
                    <p className="text-sm">{ex.en}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{ex.id}</p>
                  </div>
                ))}
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
function parsedExamples(json: string | null): { en: string; id: string }[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (x): x is { en: string; id: string } =>
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

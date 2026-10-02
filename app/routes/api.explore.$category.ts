import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmExplore } from "~/lib/llm.server";
import { getExploreCategory, saveExploreRow } from "~/lib/items.server";
import { EXPLORE_CATEGORIES, EXPLORE_CATEGORIES_JA } from "~/lib/explore.categories";
import { getTargetLang } from "~/lib/lang.server";

/**
 * GET /api/explore/:category — kartu explore; generate via LLM kalau kosong,
 * hasil di-cache di DB (BLUEPRINT F4). Kategori & prompt ikut bahasa target:
 * JA = daftar kategori Jepang (EXPLORE_CATEGORIES_JA), EN = CEFR list.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const category = String(params.category ?? "");
  const lang = await getTargetLang();
  const pool = lang === "ja" ? EXPLORE_CATEGORIES_JA : EXPLORE_CATEGORIES;
  if (!pool.some((c) => c.slug === category)) {
    return Response.json({ error: "Kategori tidak dikenal" }, { status: 404 });
  }

  let rows = await getExploreCategory(category);

  if (rows.length === 0) {
    try {
      const { data } = await llmExplore(category);
      for (const e of data.expressions) {
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
      }
      rows = await getExploreCategory(category);
    } catch (e) {
      return Response.json(
        {
          error: e instanceof Error ? e.message : "Generate explore gagal",
          items: [],
        },
        { status: 502 },
      );
    }
  }

  return Response.json({ items: rows });
}

import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmExplore } from "~/lib/llm.server";
import { getExploreCategory, saveExploreRow } from "~/lib/items.server";
import { EXPLORE_CATEGORIES } from "~/lib/explore.categories";

/**
 * GET /api/explore/:category — kartu explore; generate via LLM kalau kosong,
 * hasil di-cache di DB (BLUEPRINT F4).
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const category = String(params.category ?? "");
  if (!EXPLORE_CATEGORIES.some((c) => c.slug === category)) {
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
          exampleEn: e.example_en,
          exampleId: e.example_id,
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

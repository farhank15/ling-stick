import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { items } from "~/lib/db/schema";
import { env } from "~/lib/env.server";
import { getTargetLang } from "~/lib/lang.server";
import { normalizeText } from "~/lib/utils.shared";
import { and, eq, like } from "drizzle-orm";

/**
 * GET /api/suggest?q= — autocomplete kata (BLUEPRINT §7).
 * Prioritas: item di Library sendiri → Datamuse (fallback, tanpa key).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const q = normalizeText(url.searchParams.get("q") ?? "").slice(0, 60);
  if (q.length < 2) return Response.json({ suggestions: [] });

  // 1) Dari library sendiri (paling relevan) — ter-scope bahasa aktif.
  const own = await db
    .select({ text: items.text })
    .from(items)
    .where(and(like(items.textNorm, `%${q}%`), eq(items.lang, await getTargetLang())))
    .limit(5);

  // 2) Datamuse ( gratis, tanpa key ) — gagal diam-diam.
  let external: string[] = [];
  try {
    const res = await fetch(
      `https://api.datamuse.com/sug?s=${encodeURIComponent(q)}&max=8`,
      { signal: AbortSignal.timeout(2500) },
    );
    if (res.ok) {
      const data = (await res.json()) as { word: string }[];
      external = data.map((d) => d.word);
    }
  } catch {
    /* offline / timeout → skip */
  }
  if (external.length === 0 && env.POOLSIDE_API_KEY === "") {
    /* tanpa fallback tambahan; cukup own + kosong */
  }

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const t of [...own.map((o) => o.text), ...external]) {
    const key = normalizeText(t);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(t);
    }
    if (merged.length >= 8) break;
  }
  return Response.json({ suggestions: merged });
}

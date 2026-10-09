import type { ActionFunctionArgs } from "react-router";
import { inArray, eq, and } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { items } from "~/lib/db/schema";
import { getTargetLang } from "~/lib/lang.server";
import { normalizeText } from "~/lib/utils.shared";
import { llmExtract } from "~/lib/llm.server";

/**
 * POST /api/extract { text } — ekstrak idiom/slang/reaksi/phrasal dari teks
 * tempel (BLUEPRINT F5). Maks 3000 karakter; hasil ≤ 15 ekspresi.
 * Return: { expressions, exists: boolean[] } — exists[i] true kalau teksnya
 * sudah ada di Library (1 query inArray, murah). Biar user pilih yang baru aja.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Teks kosong" }, { status: 400 });
  if (text.length > 3000) {
    return Response.json({ error: "Maksimal 3000 karakter" }, { status: 400 });
  }

  try {
    const { data, cached } = await llmExtract(text);
    const exprs = (data.expressions ?? []) as { text: string }[];
    let exists: boolean[] = exprs.map(() => false);
    const norms = [...new Set(exprs.map((e) => normalizeText(e.text)).filter(Boolean))];
    if (norms.length) {
      const lang = await getTargetLang();
      const rows = await db
        .select({ t: items.textNorm })
        .from(items)
        .where(and(inArray(items.textNorm, norms), eq(items.lang, lang)));
      const have = new Set(rows.map((r) => r.t));
      exists = exprs.map((e) => have.has(normalizeText(e.text)));
    }
    return Response.json({ expressions: data.expressions, exists, cached });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Ekstraksi gagal" },
      { status: 502 },
    );
  }
}

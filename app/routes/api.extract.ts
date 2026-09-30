import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmExtract } from "~/lib/llm.server";

/**
 * POST /api/extract { text } — ekstrak idiom/slang/reaksi/phrasal dari teks
 * tempel (BLUEPRINT F5). Maks 3000 karakter; hasil ≤ 15 ekspresi.
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
    return Response.json({ expressions: data.expressions, cached });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Ekstraksi gagal" },
      { status: 502 },
    );
  }
}

import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmGenerate } from "~/lib/llm.server";
import { findItemIdByText } from "~/lib/items.server";
import { normalizeText } from "~/lib/utils.shared";

/**
 * POST /api/generate { text } — makna, contoh 3 register, alternatif (Poolside,
 * Zod-validated, di-cache). BLUEPRINT F1/§7.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text || text.length > 120) {
    return Response.json({ error: "Teks wajib 1–120 karakter" }, { status: 400 });
  }

  const existingId = await findItemIdByText(text);
  try {
    const { data, cached, provider } = await llmGenerate(text);
    return Response.json({ result: data, cached, provider, duplicateOf: existingId });
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Generate gagal",
        // Capture tetap bisa simpan manual saat LLM gagal (BLUEPRINT §10).
        degraded: true,
        duplicateOf: existingId,
      },
      { status: 502 },
    );
  }
}

import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmTranslate } from "~/lib/llm.server";

/**
 * POST /api/translate { text, from, to, style, tone, prefer }
 * - prefer "lara": Lara dulu (fallback LLM) — dipakai halaman /translate
 * - prefer "llm" : langsung LLM + cache — dipakai auto-translate dashboard
 *   (hemat kuota Lara yang cuma 10k karakter/bulan, BLUEPRINT §8 catatan 1)
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    from?: string;
    to?: string;
    style?: "fluid" | "faithful" | "creative";
    tone?: string;
    prefer?: "lara" | "llm";
  };
  const text = (body.text ?? "").trim();
  if (!text || text.length > 5000) {
    return Response.json({ error: "Teks wajib 1–5000 karakter" }, { status: 400 });
  }
  // Kode BCP-47: ja khusus mode Jepang (dulu ternary en/id doang — "ja" jatuh ke en-US).
  const from = body.from === "id" ? "id-ID" : body.from === "ja" ? "ja-JP" : "en-US";
  const to = body.to === "en" ? "en-US" : body.to === "ja" ? "ja-JP" : "id-ID";
  const style = body.style ?? "fluid";
  const tone = body.tone?.trim() || undefined;
  const preferLlm = body.prefer === "llm";

  const { laraStatus, translateWithLara } = await import("~/lib/lara.server");
  const status = await laraStatus();

  if (preferLlm) {
    try {
      const { translation, cached } = await llmTranslate(text, from, to, style, tone);
      return Response.json({ translation, via: "llm", cached, quota: status });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "LLM gagal", quota: status },
        { status: 502 },
      );
    }
  }

  try {
    const result = await translateWithLara(text, from, to, style, tone);
    return Response.json({
      translation: result.translation,
      via: "lara",
      cached: result.cached,
      quota: status,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Lara gagal";
    try {
      const fallback = await llmTranslate(text, from, to, style, tone);
      return Response.json({
        translation: fallback.translation,
        via: "llm",
        cached: fallback.cached,
        note: reason,
        quota: status,
      });
    } catch (e2) {
      return Response.json(
        {
          error: `Lara: ${reason}; LLM: ${e2 instanceof Error ? e2.message : "gagal"}`,
          quota: status,
        },
        { status: 502 },
      );
    }
  }
}

import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmCheckSentence } from "~/lib/llm.server";
import { getItemDetail } from "~/lib/items.server";

/**
 * POST /api/check-sentence { itemId, sentence } — koreksi kalimat buatan sendiri
 * (BLUEPRINT F6).
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    itemId?: number;
    sentence?: string;
  };
  const itemId = Number(body.itemId);
  const sentence = (body.sentence ?? "").trim();
  if (!Number.isInteger(itemId) || !sentence || sentence.length > 300) {
    return Response.json({ error: "itemId & sentence (maks 300) wajib" }, { status: 400 });
  }

  const detail = await getItemDetail(itemId);
  if (!detail) return Response.json({ error: "Item tidak ada" }, { status: 404 });

  try {
    const { data, cached } = await llmCheckSentence(detail.item.text, sentence);
    return Response.json({ result: data, cached });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Cek kalimat gagal" },
      { status: 502 },
    );
  }
}

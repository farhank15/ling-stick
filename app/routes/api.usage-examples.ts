import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { llmCache } from "~/lib/db/schema";
import { llmConfigured } from "~/lib/llm.server";
import { hashKey, normalizeText } from "~/lib/utils.shared";

/**
 * POST /api/usage-examples { text, direction } — contoh penggunaan (3–5) +
 * cara baca (pronunciation) via LLM, di-cache.
 * direction "en2id": text = kata/kalimat EN → contoh EN + cara baca text-nya.
 * direction "id2en": text = kalimat ID → contoh EN + cara baca untuk hasil EN.
 */
const schema = z.object({
  pronunciation: z.string().min(1),
  examples: z
    .array(z.object({ en: z.string().min(1), id: z.string().min(1) }))
    .min(3)
    .max(5),
});

type Out = z.infer<typeof schema>;

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    direction?: string;
  };
  const text = (body.text ?? "").trim();
  if (!text || text.length > 500) {
    return Response.json({ error: "Teks wajib 1–500 karakter" }, { status: 400 });
  }
  const id2en = body.direction === "id2en";

  const cacheKey = hashKey("usage-ex:v1", normalizeText(text), id2en ? "id2en" : "en2id");
  const [hit] = await db.select().from(llmCache).where(eq(llmCache.key, cacheKey)).limit(1);
  if (hit) {
    try {
      const parsed = schema.safeParse(JSON.parse(hit.response));
      if (parsed.success && parsed.data) return Response.json({ result: parsed.data, cached: true });
    } catch {
      /* regenerasi */
    }
  }

  if (!llmConfigured()) {
    return Response.json({ error: "LLM belum dikonfigurasi" }, { status: 502 });
  }

  const system = `You are an English teacher for Indonesian speakers. Return ONLY valid JSON, no prose.
The user gives a word/phrase/sentence and its English translation context. Provide:
- "pronunciation": how to READ THE ENGLISH EXPRESSION aloud, in easy respelling for Indonesians (e.g. "neraka" → "neh-RAH-ka"), with stress hints. Always for the ENGLISH text, never Indonesian.
- "examples": 3 to 5 SHORT, natural, real-life ENGLISH sentences that show how the expression is used in everyday situations, each with a casual Indonesian translation.
- The English examples must NOT be literal translations of the input; they should be typical real-life usages.

JSON shape: { "pronunciation": string, "examples": [{ "en": string, "id": string }] }`;
  const user = `Teks: "${text.slice(0, 300)}"${id2en ? " (bahasa Indonesia — beri contoh pemakaian EN yang natural)" : " (bahasa Inggris)"}`;

  const { chatJsonRaw } = await import("~/lib/llm.server");
  try {
    const raw = await chatJsonRaw(system, user);
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data) {
      return Response.json({ error: "Format respons LLM tidak sesuai" }, { status: 502 });
    }
    const result = parsed.data;
    await db
      .insert(llmCache)
      .values({ key: cacheKey, response: JSON.stringify(result), createdAt: Date.now() })
      .onConflictDoNothing();
    return Response.json({ result, cached: false });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Gagal generate contoh" },
      { status: 502 },
    );
  }
}

import type { ActionFunctionArgs } from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { llmCache } from "~/lib/db/schema";
import { llmConfigured } from "~/lib/llm.server";
import { getTargetLang } from "~/lib/lang.server";
import { hashKey, normalizeText } from "~/lib/utils.shared";

/**
 * POST /api/usage-examples { text, direction } — contoh penggunaan (3–5) +
 * cara baca (pronunciation) via LLM, di-cache.
 * - "en2id": text EN → contoh EN + cara baca EN (mode EN)
 * - "ja2id": text JA → contoh JA + cara baca JA (mode JA)
 * - "id2en"/"id2ja": text ID → contoh bahasa target + cara baca hasilnya
 */
const schema = z.object({
  pronunciation: z.string().min(1),
  examples: z
    .array(z.object({ en: z.string().min(1), id: z.string().min(1) }))
    .min(3)
    .max(5),
});

type Out = z.infer<typeof schema>;

const jaSystem = `You are a Japanese language teacher for Indonesian speakers. Return ONLY valid JSON, no prose.
The user gives a Japanese word/phrase/sentence (or an Indonesian phrase to be expressed in Japanese). Provide:
- "pronunciation": how to READ THE JAPANESE TEXT aloud — kana reading, then romaji in parentheses. Example: "じゅんび (junbi)". Always for the JAPANESE text, never Indonesian.
- "examples": 3 to 5 SHORT, natural, real-life JAPANESE sentences showing how the expression is used in everyday situations, each with a casual Indonesian translation. Each "en" field = the Japanese sentence with its romaji on the SECOND line (two lines separated by \\n).
- The Japanese examples must NOT be literal translations of the input; they should be typical real-life usages.

JSON shape: { "pronunciation": string, "examples": [{ "en": string, "id": string }] }`;

const enSystem = `You are an English teacher for Indonesian speakers. Return ONLY valid JSON, no prose.
The user gives a word/phrase/sentence and its English translation context. Provide:
- "pronunciation": how to READ THE ENGLISH EXPRESSION aloud, in easy respelling for Indonesians (e.g. "neraka" → "neh-RAH-ka"), with stress hints. Always for the ENGLISH text, never Indonesian.
- "examples": 3 to 5 SHORT, natural, real-life ENGLISH sentences that show how the expression is used in everyday situations, each with a casual Indonesian translation.
- The English examples must NOT be literal translations of the input; they should be typical real-life usages.

JSON shape: { "pronunciation": string, "examples": [{ "en": string, "id": string }] }`;

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
  const lang = await getTargetLang();
  // Auto-arah dari isi teks kalau param gak dikenal: ada kana/kanji = sisi JP/EN.
  const looksJa = /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
  const direction = ["en2id", "id2en", "ja2id", "id2ja"].includes(body.direction ?? "")
    ? body.direction!
    : looksJa
      ? "ja2id"
      : lang === "ja"
        ? "id2ja"
        : "id2en";
  const isJaSide = direction === "ja2id" || direction === "id2ja";

  const cacheKey = hashKey("usage-ex:v2", normalizeText(text), direction);
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

  const system = isJaSide ? jaSystem : enSystem;
  const user = `Teks: "${text.slice(0, 300)}"${isJaSide ? " (bahasa Jepang — contoh & cara baca dalam bahasa Jepang)" : " (bahasa Inggris)"}`;

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

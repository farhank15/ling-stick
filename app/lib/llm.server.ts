import { eq, sql } from "drizzle-orm";
import { db, getRawClient } from "./db/client.server";
import { llmCache, llmUsage } from "./db/schema";
import { env } from "./env.server";
import { getTargetLang } from "./lang.server";
import {
  CHAT_SYSTEM,
  CHAT_SYSTEM_JA,
  CHECK_SENTENCE_SYSTEM,
  EXTRACT_SYSTEM,
  EXPLORE_CATEGORIES,
  GENERATE_SYSTEM,
  GENERATE_SYSTEM_JA,
  exploreSystem,
} from "./prompts";
import {
  chatOutputSchema,
  checkSentenceOutputSchema,
  exploreOutputSchema,
  extractOutputSchema,
  generateOutputSchema,
  type ChatOutput,
  type CheckSentenceOutput,
  type ExploreOutput,
  type ExtractOutput,
  type GenerateOutput,
} from "./schemas";
import { hashKey, normalizeText, todayStr } from "./utils.shared";

/**
 * Klien LLM dengan provider chain — BLUEPRINT §5 (modul tunggal, gampang ganti provider):
 *
 *   1. Groq     (utama — cepat)       GROQ_API_KEY + GROQ_MODEL
 *   2. Poolside (fallback)            POOLSIDE_API_KEY + POOLSIDE_MODEL
 *
 * - Validasi Zod + retry 1x per provider
 * - Cache hasil di llm_cache (key = prefix + input, provider-transparan)
 * - Rate-limit harian via llm_usage
 */

const TIMEOUT_MS = 30_000;

type Provider = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

/** Urutan provider: Groq dulu (cepat), Poolside fallback. */
function providers(): Provider[] {
  const list: Provider[] = [];
  if (env.GROQ_API_KEY) {
    list.push({
      name: "groq",
      baseUrl: env.GROQ_BASE_URL,
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
    });
  }
  if (env.POOLSIDE_API_KEY && env.POOLSIDE_MODEL) {
    list.push({
      name: "poolside",
      baseUrl: env.POOLSIDE_BASE_URL,
      apiKey: env.POOLSIDE_API_KEY,
      model: env.POOLSIDE_MODEL,
    });
  }
  return list;
}

export function llmConfigured(): boolean {
  return providers().length > 0;
}

function apiUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

class LlmError extends Error {}

/**
 * Rumah tangga llm_cache: buang entri >60 hari + sisakan 2000 terbaru.
 * Dipanggil dengan peluang kecil tiap kali cache ditulis — biaya ~0, cache gak bengkak.
 */
export async function pruneLlmCache(): Promise<void> {
  const client = getRawClient();
  const cutoff = Date.now() - 60 * 86_400_000;
  await client.execute({ sql: "DELETE FROM llm_cache WHERE created_at < ?", args: [cutoff] });
  await client.execute({
    sql: "DELETE FROM llm_cache WHERE key NOT IN (SELECT key FROM llm_cache ORDER BY created_at DESC LIMIT 2000)",
  });
}

function maybePruneLlmCache() {
  if (Math.random() < 0.05) void pruneLlmCache().catch(() => {});
}

function extractJsonText(raw: string): string {
  // Tahan kalau model membungkus JSON dalam ```json ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : raw).trim();
}

export async function chatJson<T>(
  system: string,
  user: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  cachePrefix: string,
  cacheInput: string,
): Promise<{ data: T; cached: boolean; provider: string }> {
  const chain = providers();
  if (chain.length === 0) {
    throw new LlmError("Belum ada API key LLM (GROQ_API_KEY / POOLSIDE_API_KEY) di .env");
  }

  const cacheKey = cachePrefix ? hashKey(cachePrefix, normalizeText(cacheInput)) : "";
  if (cacheKey) {
    const [hit] = await db.select().from(llmCache).where(eq(llmCache.key, cacheKey)).limit(1);
    if (hit) {
      try {
        const parsed = schema.safeParse(JSON.parse(hit.response));
        if (parsed.success && parsed.data)
          return { data: parsed.data, cached: true, provider: "cache" };
      } catch {
        /* cache rusak → regenerasi */
      }
    }
  }

  await checkDailyLimit();
  await bumpDailyUsage();

  let lastError = "";
  // Coba tiap provider berurutan (Groq → Poolside), masing-masing retry 1x.
  for (const p of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(apiUrl(p.baseUrl, "chat/completions"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${p.apiKey}`,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            model: p.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature: 0.4,
            response_format: { type: "json_object" },
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          // Auth/model error → provider ini memang bermasalah, langsung lompat
          // ke provider berikutnya (jangan buang waktu retry).
          if (res.status === 401 || res.status === 403 || res.status === 404) {
            lastError = `${p.name}: HTTP ${res.status}`;
            break;
          }
          throw new LlmError(`${p.name}: HTTP ${res.status} ${body.slice(0, 150)}`);
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        const parsed = schema.safeParse(JSON.parse(extractJsonText(content)));
        if (parsed.success && parsed.data) {
          const data = parsed.data;
          if (cacheKey) {
            await db
              .insert(llmCache)
              .values({ key: cacheKey, response: JSON.stringify(data), createdAt: Date.now() })
              .onConflictDoNothing();
            maybePruneLlmCache();
          }
          return { data, cached: false, provider: p.name };
        }
        lastError = `${p.name}: output tidak sesuai skema`;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  throw new LlmError(lastError || "Semua provider LLM gagal");
}

async function checkDailyLimit() {
  const [row] = await db
    .select()
    .from(llmUsage)
    .where(eq(llmUsage.day, todayStr()))
    .limit(1);
  if ((row?.calls ?? 0) >= env.DAILY_LLM_CALL_LIMIT) {
    throw new LlmError(
      `Batas harian LLM tercapai (${env.DAILY_LLM_CALL_LIMIT} panggilan). Coba besok lagi.`,
    );
  }
}

async function bumpDailyUsage() {
  await db
    .insert(llmUsage)
    .values({ day: todayStr(), calls: 1 })
    .onConflictDoUpdate({
      target: llmUsage.day,
      set: { calls: sql`${llmUsage.calls} + 1` },
    });
}

/* ── High-level helpers ─────────────────────────────────────── */

export async function llmGenerate(
  text: string,
): Promise<{ data: GenerateOutput; cached: boolean; provider: string }> {
  const clean = text.trim().slice(0, 120);
  const lang = await getTargetLang();
  // Mode JA: prompt Jepang — headword kanji + reading kana; input boleh arti Indonesia.
  const system = lang === "ja" ? GENERATE_SYSTEM_JA : GENERATE_SYSTEM;
  const user = lang === "ja" ? `Kata/frasa/arti: "${clean}"` : `Word or phrase: "${clean}"`;
  const cacheNs = lang === "ja" ? "generate:ja:v1" : "generate:v1";
  return chatJson(system, user, generateOutputSchema, cacheNs, `${cacheNs}|${clean}`);
}

export async function llmExtract(
  text: string,
): Promise<{ data: ExtractOutput; cached: boolean; provider: string }> {
  const clean = text.trim().slice(0, 3000);
  return chatJson(EXTRACT_SYSTEM, clean, extractOutputSchema, "extract:v1", clean);
}

export async function llmCheckSentence(
  itemText: string,
  sentence: string,
): Promise<{ data: CheckSentenceOutput; cached: boolean; provider: string }> {
  const user = `Target expression: "${itemText.trim().slice(0, 120)}"\nLearner sentence: "${sentence.trim().slice(0, 300)}"`;
  return chatJson(
    CHECK_SENTENCE_SYSTEM,
    user,
    checkSentenceOutputSchema,
    "check-sentence:v1",
    `${itemText}|${sentence}`,
  );
}

export async function llmExplore(
  categorySlug: string,
  existing: string[] = [],
  variant = 0,
): Promise<{ data: ExploreOutput; cached: boolean; provider: string }> {
  const cat = EXPLORE_CATEGORIES.find((c) => c.slug === categorySlug);
  if (!cat) throw new LlmError("Kategori tidak dikenal");
  const avoid = existing.length
    ? ` Do NOT repeat or paraphrase these existing expressions: ${existing.slice(0, 50).join("; ")}. Give completely fresh ones.`
    : "";
  const user = `Category: "${cat.label}". Seed examples (reference only, extend don't copy): ${cat.seed.join(", ")}.${avoid}`;
  return chatJson(
    exploreSystem(cat.label),
    user,
    exploreOutputSchema,
    "explore:v2",
    `${categorySlug}|v${variant}`,
  );
}

/**
 * Chat dengan Ling — instructor bahasa Inggris. Tanpa cache (jawaban harus
 * kontekstual), history dikirim sebagai transkrip teks di user message.
 */
export async function llmChat(
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Promise<{ data: ChatOutput; provider: string }> {
  const transcript = history
    .slice(-8)
  .map((m) => `${m.role === "user" ? "Learner" : "Ling"}: ${m.content.slice(0, 500)}`)
    .join("\n");
  const user = transcript
    ? `Conversation so far:
${transcript}

Learner's new message: "${message.slice(0, 1000)}"`
    : `Learner's message: "${message.slice(0, 1000)}"`;
  const lang = await getTargetLang();
  const { data, provider } = await chatJson(
    lang === "ja" ? CHAT_SYSTEM_JA : CHAT_SYSTEM,
    user,
    chatOutputSchema,
    "", // sengaja kosong — chat tidak di-cache
    "",
  );
  return { data, provider };
}

/**
 * Chat JSON generik: balikin konten mentah dari model (belum divalidasi).
 * Dipakai route yang punya skema Zod sendiri; pakai provider chain yang sama.
 */
export async function chatJsonRaw(system: string, user: string): Promise<string> {
  const chain = providers();
  if (chain.length === 0) throw new LlmError("Belum ada API key LLM di .env");

  await checkDailyLimit();
  await bumpDailyUsage();

  let lastError = "";
  for (const p of chain) {
    try {
      const res = await fetch(apiUrl(p.baseUrl, "chat/completions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.4,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          lastError = `${p.name}: HTTP ${res.status}`;
          break;
        }
        throw new LlmError(`${p.name}: HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new LlmError(`${p.name}: respons kosong`);
      return content;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new LlmError(lastError || "Semua provider LLM gagal");
}

/**
 * Terjemah teks bebas via LLM (fallback Lara / mode hemat kuota).
 * Pakai provider chain yang sama, tapi output teks biasa (bukan JSON).
 */
export async function llmTranslate(
  text: string,
  from: string,
  to: string,
  style: string,
  tone?: string,
): Promise<{ translation: string; cached: boolean }> {
  const cacheKey = hashKey("translate-llm:v1", normalizeText(text), from, to, style, tone ?? "");
  const [hit] = await db.select().from(llmCache).where(eq(llmCache.key, cacheKey)).limit(1);
  if (hit) {
    return { translation: JSON.parse(hit.response).translation, cached: true };
  }

  const dir = from.startsWith("en") ? "ke Indonesia" : "ke Inggris";
  const styleNote =
    style === "faithful"
      ? "Translate literally, preserving structure."
      : style === "creative"
        ? "Translate creatively, prioritizing feel over literalness."
        : "Translate naturally, as a fluent native speaker would.";
  const prompt = `Translate the following text ${dir}. ${styleNote}${tone ? ` Tone: ${tone}.` : ""} Return ONLY the translation text, nothing else.\n\n${text}`;

  const chain = providers();
  if (chain.length === 0) throw new LlmError("Belum ada API key LLM di .env");

  let lastError = "";
  for (const p of chain) {
    try {
      const res = await fetch(apiUrl(p.baseUrl, "chat/completions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model: p.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });
      if (!res.ok) throw new LlmError(`${p.name}: HTTP ${res.status}`);
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const out = json.choices?.[0]?.message?.content?.trim();
      if (!out) throw new LlmError(`${p.name}: respons kosong`);
      await db
        .insert(llmCache)
        .values({ key: cacheKey, response: JSON.stringify({ translation: out }), createdAt: Date.now() })
        .onConflictDoNothing();
      maybePruneLlmCache();
      return { translation: out, cached: false };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new LlmError(lastError || "Terjemah LLM gagal");
}

/** Daftar model per provider — buat memilih model di settings. */
export async function listModels(): Promise<{ provider: string; models: string[] }[]> {
  const out: { provider: string; models: string[] }[] = [];
  for (const p of providers()) {
    try {
      const res = await fetch(apiUrl(p.baseUrl, "models"), {
        headers: { Authorization: `Bearer ${p.apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new LlmError(`HTTP ${res.status}`);
      const json = (await res.json()) as { data?: { id?: string }[] };
      out.push({
        provider: p.name,
        models: (json.data ?? []).map((m) => m.id ?? "").filter(Boolean),
      });
    } catch {
      out.push({ provider: p.name, models: [] });
    }
  }
  return out;
}

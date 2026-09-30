import { Credentials, Translator } from "@translated/lara";
import { eq, sql } from "drizzle-orm";
import { db } from "./db/client.server";
import { llmCache, laraUsage } from "./db/schema";
import { env } from "./env.server";
import { hashKey, monthStr } from "./utils.shared";

/**
 * Lara Translate — BLUEPRINT F7. Kuota Free kecil (10k karakter/bulan):
 * dipakai on-demand, dihitung per bulan (lara_usage), hasil di-cache (llm_cache
 * dengan prefix "lara:v1"), dan selalu ada fallback ke LLM di route.
 */

let cached: Translator | null = null;

function client(): Translator {
  if (!cached) {
    if (!env.LARA_ACCESS_KEY_ID || !env.LARA_ACCESS_KEY_SECRET) {
      throw new Error("LARA_ACCESS_KEY_ID / LARA_ACCESS_KEY_SECRET belum diset di .env");
    }
    cached = new Translator(
      new Credentials(env.LARA_ACCESS_KEY_ID, env.LARA_ACCESS_KEY_SECRET),
    );
  }
  return cached;
}

export function laraConfigured(): boolean {
  return Boolean(env.LARA_ACCESS_KEY_ID && env.LARA_ACCESS_KEY_SECRET);
}

async function usageThisMonth(): Promise<number> {
  const [row] = await db
    .select()
    .from(laraUsage)
    .where(eq(laraUsage.month, monthStr()))
    .limit(1);
  return row?.chars ?? 0;
}

export async function laraStatus(): Promise<{
  used: number;
  limit: number;
  remaining: number;
  configured: boolean;
}> {
  const used = await usageThisMonth();
  const limit = env.LARA_MONTHLY_CHAR_LIMIT;
  return { used, limit, remaining: Math.max(0, limit - used), configured: laraConfigured() };
}

export type TranslateResult = {
  translation: string;
  cached: boolean;
  via: "lara";
};

export async function translateWithLara(
  text: string,
  from: string,
  to: string,
  style: "fluid" | "faithful" | "creative",
  tone?: string,
): Promise<TranslateResult> {
  const clean = text.trim();
  if (!clean) throw new Error("Teks kosong");

  const { remaining } = await laraStatus();
  if (remaining < clean.length) {
    throw new Error(
      `Kuota Lara bulan ini tinggal ${remaining} karakter — kurang untuk ${clean.length} karakter.`,
    );
  }

  const cacheKey = hashKey(
    "lara:v1",
    clean,
    from,
    to,
    style,
    tone ?? "",
  );
  const [hit] = await db.select().from(llmCache).where(eq(llmCache.key, cacheKey)).limit(1);
  if (hit) {
    return { translation: JSON.parse(hit.response).translation, cached: true, via: "lara" };
  }

  const options: {
    style: "fluid" | "faithful" | "creative";
    instructions?: string[];
    timeoutInMillis: number;
  } = {
    style,
    timeoutInMillis: 20_000,
  };
  if (tone) options.instructions = [tone];

  const result = await client().translate(clean, from, to, options);
  const translation = result.translation;

  const chars = clean.length;
  db.transaction((tx) => {
    tx.insert(llmCache)
      .values({ key: cacheKey, response: JSON.stringify({ translation }), createdAt: Date.now() })
      .onConflictDoNothing()
      .run();
    tx.insert(laraUsage)
      .values({ month: monthStr(), chars })
      .onConflictDoUpdate({
        target: laraUsage.month,
        set: { chars: sql`${laraUsage.chars} + ${chars}` },
      })
      .run();
  });

  return { translation, cached: false, via: "lara" };
}

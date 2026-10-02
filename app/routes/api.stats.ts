import type { LoaderFunctionArgs } from "react-router";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { items, llmUsage, quizSets } from "~/lib/db/schema";
import { getTargetLang } from "~/lib/lang.server";
import { laraStatus } from "~/lib/lara.server";
import { todayStr } from "~/lib/utils.shared";

/** Cache in-memory 60 detik — buka ulang halaman = instan (data statistik gak perlu realtime). */
const statsCache = new Map<string, { at: number; data: unknown }>();
const STATS_TTL = 60_000;

/** GET /api/stats — data statistik untuk halaman Pengaturan. */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang();

  const cached = statsCache.get(lang);
  if (cached && Date.now() - cached.at < STATS_TTL) {
    return Response.json(cached.data);
  }

  const since = Date.now() - 7 * 86_400_000;

  // Dulu 6 query BERURUTAN ke Turso remote → halaman kerasa lama banget.
  // Sekarang SEMUA paralel = secepat query terlama (1 round-trip bolak-balik).
  const [statusRows, recentRows, llmRows, quiz, lara, knownCount] = await Promise.all([
    db
      .select({ status: items.status, total: sql<number>`count(*)` })
      .from(items)
      .where(eq(items.lang, lang))
      .groupBy(items.status),
    db
      .select({
        day: sql<string>`date(${items.createdAt} / 1000, 'unixepoch', 'localtime')`,
        total: sql<number>`count(*)`,
      })
      .from(items)
      .where(and(gte(items.createdAt, since), eq(items.lang, lang)))
      .groupBy(sql`1`),
    db.select().from(llmUsage).orderBy(desc(llmUsage.day)).limit(7),
    db
      .select({
        day: quizSets.day,
        title: quizSets.title,
        total: quizSets.total,
        done: quizSets.done,
        correct: quizSets.correct,
        completed: quizSets.completed,
      })
      .from(quizSets)
      .orderBy(desc(quizSets.day))
      .limit(7),
    laraStatus(),
    db
      .select({ total: sql<number>`count(*)` })
      .from(items)
      .where(and(eq(items.status, "known"), eq(items.lang, lang))),
  ]);

  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.total)]));

  // Item baru 7 hari terakhir (per hari).
  const recentMap = Object.fromEntries(recentRows.map((r) => [r.day, Number(r.total)]));
  const last7: { day: string; total: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = todayStr(d);
    last7.push({ day: key, total: recentMap[key] ?? 0 });
  }

  // Pemakaian LLM 7 hari.
  const llmMap = Object.fromEntries(llmRows.map((r) => [r.day, r.calls]));
  const llm7: { day: string; calls: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = todayStr(d);
    llm7.push({ day: key, calls: llmMap[key] ?? 0 });
  }

  // Streak latihan: hari beruntun dengan set completed (dari riwayat terbaru ke belakang).
  let streak = 0;
  const daySet = new Set(quiz.filter((q) => q.completed).map((q) => q.day));
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    if (daySet.has(todayStr(d))) streak++;
    else if (i > 0) break;
  }

  const data = {
    byStatus: {
      learning: byStatus.learning ?? 0,
      known: byStatus.known ?? 0,
      archived: byStatus.archived ?? 0,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    },
    last7,
    llm7,
    quiz,
    streak,
    lara,
    knownTotal: Number(knownCount[0]?.total ?? 0),
  };
  statsCache.set(lang, { at: Date.now(), data });
  return data;
}

import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./db/client.server";
import { chatMessages, chatSessions } from "./db/schema";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type StoredSuggestion = {
  text: string;
  meaning_id: string;
  examples: { en: string; id: string }[];
};

/** Semua sesi (terbaru dulu) + jumlah pesan via GROUP BY (anti-subquery ambigu). */
export async function listSessions() {
  const rows = await db
    .select({ id: chatSessions.id, title: chatSessions.title, updatedAt: chatSessions.updatedAt })
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50);
  const counts = await db
    .select({
      sessionId: chatMessages.sessionId,
      total: sql<number>`count(*)`,
      lastContent: sql<string>`min(content)`,
    })
    .from(chatMessages)
    .groupBy(chatMessages.sessionId);
  const countMap = new Map(counts.map((c) => [c.sessionId, Number(c.total)]));
  // Pesan terakhir per sesi — pakai SQL mentah berkualifikasi penuh (subquery
  // correlated dengan interpolasi kolom drizzle terbukti ambigu di libsql).
  const lasts = await db.all<{ session_id: number; content: string }>(sql`
    SELECT m.session_id AS session_id, m.content AS content
    FROM chat_messages m
    WHERE m.id IN (SELECT MAX(id) FROM chat_messages GROUP BY session_id)
  `);
  const lastMap = new Map(lasts.map((l) => [l.session_id, l.content]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
    messageCount: countMap.get(r.id) ?? 0,
    lastMessage: (lastMap.get(r.id) ?? "").slice(0, 80),
  }));
}

export async function createSession(title?: string) {
  const now = Date.now();
  const [row] = await db
    .insert(chatSessions)
    .values({ title: title?.trim().slice(0, 80) || "Obrolan baru", createdAt: now, updatedAt: now })
    .returning();
  return row;
}

export async function getSession(id: number) {
  const [row] = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
  return row ?? null;
}

export async function getMessages(sessionId: number) {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.id));
}

/** Nama obrolan otomatis dari pesan pertama user. */
function autoTitle(firstUserMsg: string): string {
  const clean = firstUserMsg.trim().replace(/\s+/g, " ");
  if (!clean) return "Obrolan baru";
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

/**
 * Simpan pasangan user+assistant & update sesi.
 * Judul otomatis dari pertanyaan pertama sesi itu.
 */
export async function appendMessages(opts: {
  sessionId: number;
  user: string;
  assistant: string;
  suggestions?: StoredSuggestion[];
  isFirstExchange: boolean;
}) {
  const now = Date.now();
  await db.transaction(async (tx) => {
    await tx.insert(chatMessages).values([
      { sessionId: opts.sessionId, role: "user", content: opts.user, createdAt: now },
      {
        sessionId: opts.sessionId,
        role: "assistant",
        content: opts.assistant,
        suggestionsJson: opts.suggestions?.length
          ? JSON.stringify(opts.suggestions)
          : null,
        createdAt: now + 1,
      },
    ]);
    await tx
      .update(chatSessions)
      .set({
        updatedAt: now,
        ...(opts.isFirstExchange ? { title: autoTitle(opts.user) } : {}),
      })
      .where(eq(chatSessions.id, opts.sessionId));
  });
}

export async function deleteSession(id: number) {
  await db.delete(chatSessions).where(eq(chatSessions.id, id));
}

export async function deleteAllSessions() {
  await db.delete(chatSessions);
}

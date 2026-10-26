import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { llmChat } from "~/lib/llm.server";
import {
  appendMessages,
  createSession,
  getMessages,
  getSession,
  historyWindow,
  type StoredSuggestion,
} from "~/lib/chat.server";

/**
 * POST /api/chat — tanya Ling (instructor bahasa Inggris).
 * Body: { message, sessionId? } → pesan disimpan di DB (Turso), history
 * diambil dari server (bukan dikirim client) supaya aman & konsisten.
 * Return: { ok, sessionId, reply, suggestions }
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    sessionId?: number;
    /** Sekali pakai: jawab tanpa membuat/menulis sesi chat (Tanya Ling di
     *  review & rute). Dulu tiap klik bikin sesi baru → riwayat chat sampah. */
    ephemeral?: boolean;
  };
  const message = (body.message ?? "").trim().slice(0, 1000);
  if (!message) {
    return Response.json({ error: "Pesan kosong" }, { status: 400 });
  }

  if (body.ephemeral) {
    try {
      const { data } = await llmChat([], message);
      return Response.json({
        ok: true,
        reply: data.reply,
        suggestions: (data.suggestions ?? []) as StoredSuggestion[],
      });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Ling lagi nggak bisa jawab" },
        { status: 502 },
      );
    }
  }

  // Sesi: pakai yang ada atau bikin baru.
  let sessionId = Number(body.sessionId);
  let isFirstExchange = false;
  if (Number.isInteger(sessionId) && sessionId > 0) {
    const session = await getSession(sessionId);
    if (!session) {
      return Response.json({ error: "Sesi nggak ditemukan" }, { status: 404 });
    }
    isFirstExchange = (await getMessages(sessionId)).length === 0;
  } else {
    const created = await createSession();
    sessionId = created.id;
    isFirstExchange = true;
  }

  // History dari DB — pesan pertama + sebanyak mungkin pesan terakhir (budget
  // karakter), bukan 8 pesan terakhir yang bikin topik sesi panjang hilang.
  const prior = await getMessages(sessionId);
  const history = historyWindow(prior).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const { data } = await llmChat(history, message);
    const suggestions = (data.suggestions ?? []) as StoredSuggestion[];
    await appendMessages({
      sessionId,
      user: message,
      assistant: data.reply,
      suggestions,
      isFirstExchange,
    });
    return Response.json({ ok: true, sessionId, reply: data.reply, suggestions });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Ling lagi nggak bisa jawab" },
      { status: 502 },
    );
  }
}

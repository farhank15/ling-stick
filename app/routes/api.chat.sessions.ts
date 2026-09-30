import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import {
  createSession,
  deleteAllSessions,
  deleteSession,
  getMessages,
  getSession,
  listSessions,
} from "~/lib/chat.server";

/**
 * GET /api/chat/sessions            → daftar sesi
 * GET /api/chat/sessions?id=1       → detail 1 sesi + semua pesannya
 * POST  { action: "create" }        → sesi baru
 * POST  { action: "delete", id }    → hapus 1 sesi
 * POST  { action: "clear" }         → hapus SEMUA sesi
 */
export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  if (Number.isInteger(id) && id > 0) {
    const session = await getSession(id);
    if (!session) return Response.json({ error: "Nggak ditemukan" }, { status: 404 });
    const messages = await getMessages(id);
    return Response.json({ session, messages });
  }
  return Response.json({ sessions: await listSessions() });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    title?: string;
  };

  switch (body.action) {
    case "create":
      return Response.json({ ok: true, session: await createSession(body.title) });
    case "delete": {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return Response.json({ error: "id nggak valid" }, { status: 400 });
      }
      await deleteSession(id);
      return Response.json({ ok: true });
    }
    case "clear":
      await deleteAllSessions();
      return Response.json({ ok: true });
    default:
      return Response.json({ error: "action tidak dikenal" }, { status: 400 });
  }
}

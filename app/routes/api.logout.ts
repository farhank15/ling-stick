import type { ActionFunctionArgs } from "react-router";
import { clearCookieHeader, destroySession, requireUser } from "~/lib/auth.server";

/** POST /api/logout — hapus sesi dari DB + bersihkan cookie. */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  await destroySession(request);
  const cookie = await clearCookieHeader();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

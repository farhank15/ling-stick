import type { ActionFunctionArgs } from "react-router";
import { clearCookieHeader, logout, requireUser } from "~/lib/auth.server";

/** POST /api/logout — hapus sesi di SQLite + cookie. */
export async function action({ request }: ActionFunctionArgs) {
  const sid = await requireUser(request);
  await logout(sid);
  const cookie = await clearCookieHeader();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

import type { ActionFunctionArgs } from "react-router";
import { clearCookieHeader, logout, requireUser } from "~/lib/auth.server";

/** POST /api/logout — hapus cookie sesi (sesi stateless, tak ada state server). */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  await logout();
  const cookie = await clearCookieHeader();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

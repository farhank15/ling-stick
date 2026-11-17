import type { ActionFunctionArgs } from "react-router";
import { clearCookieHeader, destroySession, requireUser } from "~/lib/auth.server";
import { inUserContext } from "~/lib/user-context";

/** POST /api/logout — hapus sesi dari DB + bersihkan cookie. */
export function action(...args: Parameters<typeof _action>) {
  return inUserContext(() => _action(...args));
}

async function _action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  await destroySession(request);
  const cookie = await clearCookieHeader();
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

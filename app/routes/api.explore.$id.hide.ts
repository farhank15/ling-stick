import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { inUserContext } from "~/lib/user-context";
import { hideExploreItem } from "~/lib/items.server";

/** POST /api/explore/:id/hide — tandai "udah tahu" (sembunyikan dari explore). */
export function action(...args: Parameters<typeof _action>) {
  return inUserContext(() => _action(...args));
}

async function _action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id tidak valid" }, { status: 400 });
  }
  await hideExploreItem(id);
  return Response.json({ ok: true });
}

import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { hideExploreItem } from "~/lib/items.server";

/** POST /api/explore/:id/hide — tandai "udah tahu" (sembunyikan dari explore). */
export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id tidak valid" }, { status: 400 });
  }
  await hideExploreItem(id);
  return Response.json({ ok: true });
}

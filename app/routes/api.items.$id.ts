import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { deleteItem, getItemDetail, updateItem } from "~/lib/items.server";

/** PATCH/DELETE /api/items/:id — edit / hapus (BLUEPRINT §7). */
export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id tidak valid" }, { status: 400 });
  }

  if (request.method === "DELETE") {
    await deleteItem(id);
    return Response.json({ ok: true });
  }

  if (request.method === "PATCH") {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Parameters<typeof updateItem>[1] = {};
    if (typeof body.text === "string") patch.text = body.text;
    if (typeof body.type === "string") patch.type = body.type;
    if (typeof body.register === "string") patch.register = body.register;
    if (typeof body.meaningId === "string") patch.meaningId = body.meaningId;
    if (typeof body.notesId === "string") patch.notesId = body.notesId;
    if (typeof body.source === "string") patch.source = body.source;
    if (typeof body.status === "string") patch.status = body.status;
    if (typeof body.hideMeaning === "number") patch.hideMeaning = body.hideMeaning;
    await updateItem(id, patch);
    const detail = await getItemDetail(id);
    return Response.json({ ok: true, item: detail?.item ?? null });
  }

  return Response.json({ error: "Method tidak didukung" }, { status: 405 });
}

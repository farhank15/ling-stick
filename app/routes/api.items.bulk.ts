import type { ActionFunctionArgs } from "react-router";
import { inArray } from "drizzle-orm";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import { items } from "~/lib/db/schema";
import { deleteItem, markKnown, markLearning } from "~/lib/items.server";

/**
 * POST /api/items/bulk { action: "known"|"learning"|"delete", ids: number[] }
 * Aksi massal dari Library (centang multi).
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    ids?: unknown;
  };
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map(Number)
    .filter((n) => Number.isInteger(n));
  if (ids.length === 0) {
    return Response.json({ error: "ids kosong" }, { status: 400 });
  }

  switch (body.action) {
    case "known":
      await db.update(items).set({ status: "known" }).where(inArray(items.id, ids));
      break;
    case "learning":
      await db.update(items).set({ status: "learning" }).where(inArray(items.id, ids));
      break;
    case "delete":
      for (const id of ids) await deleteItem(id);
      break;
    default:
      void markKnown;
      void markLearning;
      return Response.json({ error: "action tidak dikenal" }, { status: 400 });
  }
  return Response.json({ ok: true, affected: ids.length });
}

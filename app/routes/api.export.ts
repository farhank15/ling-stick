import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { db } from "~/lib/db/client.server";
import {
  alternatives,
  cards,
  examples,
  exploreItems,
  itemTags,
  items,
  reviewLogs,
  tags,
} from "~/lib/db/schema";

/** GET /api/export — backup JSON seluruh data (BLUEPRINT P2 / §7). */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const payload = {
    exportedAt: new Date().toISOString(),
    items: await db.select().from(items),
    examples: await db.select().from(examples),
    alternatives: await db.select().from(alternatives),
    tags: await db.select().from(tags),
    itemTags: await db.select().from(itemTags),
    cards: await db.select().from(cards),
    reviewLogs: await db.select().from(reviewLogs),
    exploreItems: await db.select().from(exploreItems),
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="lingstick-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

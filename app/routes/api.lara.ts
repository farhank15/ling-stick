import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { laraStatus } from "~/lib/lara.server";

/** GET /api/lara — sisa kuota Lara bulan ini (BLUEPRINT F7 AC). */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return Response.json(await laraStatus());
}

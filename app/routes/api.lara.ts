import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { inUserContext } from "~/lib/user-context";
import { laraStatus } from "~/lib/lara.server";

/** GET /api/lara — sisa kuota Lara bulan ini (BLUEPRINT F7 AC). */
export function loader(...args: Parameters<typeof _loader>) {
  return inUserContext(() => _loader(...args));
}

async function _loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return Response.json(await laraStatus());
}

import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { inUserContext } from "~/lib/user-context";
import { env } from "~/lib/env.server";
import { listModels } from "~/lib/llm.server";

/** GET /api/models — daftar model per provider (Groq & Poolside). */
export function loader(...args: Parameters<typeof _loader>) {
  return inUserContext(() => _loader(...args));
}

async function _loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  try {
    const providers = await listModels();
    return Response.json({
      providers,
      current: { groq: env.GROQ_MODEL, poolside: env.POOLSIDE_MODEL },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Gagal mengambil model" },
      { status: 502 },
    );
  }
}

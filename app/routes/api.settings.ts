import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { inUserContext } from "~/lib/user-context";
import { getTargetLang, setTargetLang, isTargetLang } from "~/lib/lang.server";

/**
 * POST /api/settings — JSON settings (pengaturan kartu baru/hari, bahasa target).
 * Resource route TANPA komponen: response action dikembalikan mentah (JSON).
 * matcha: raw fetch() ke document route (/settings) selalu dibalas HTML dokumen
 * → res.json() throw → toast "Gagal menyimpan" palsu padahal tersimpan.
 * Jangan taruh JSON action di document route.
 */
export function action(...args: Parameters<typeof _action>) {
  return inUserContext(() => _action(...args));
}

async function _action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    lang?: string;
    newCardsPerDay?: number;
    retention?: number;
    maxInterval?: number;
  };

  if (typeof body.retention === "number" || typeof body.maxInterval === "number") {
    const { setFsrsSettings } = await import("~/lib/prefs.server");
    const saved = await setFsrsSettings({ retention: body.retention, maxInterval: body.maxInterval });
    return Response.json({ ok: true, ...saved });
  }

  if (typeof body.newCardsPerDay === "number") {
    const { setNewCardsPerDay } = await import("~/lib/prefs.server");
    const saved = await setNewCardsPerDay(body.newCardsPerDay);
    return Response.json({ ok: true, newCardsPerDay: saved });
  }

  if (!isTargetLang(body.lang)) {
    return Response.json({ ok: false, error: "Bahasa tidak dikenal" }, { status: 400 });
  }
  await setTargetLang(body.lang);
  return Response.json({ ok: true, lang: body.lang });
}

export function loader(...args: Parameters<typeof _loader>) {
  return inUserContext(() => _loader(...args));
}

async function _loader({ request }: { request: Request }) {
  await requireUser(request);
  return Response.json({ lang: await getTargetLang() });
}

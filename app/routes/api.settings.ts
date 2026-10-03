import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang, setTargetLang, isTargetLang } from "~/lib/lang.server";

/**
 * POST /api/settings — JSON settings (pengaturan kartu baru/hari, bahasa target).
 * Resource route TANPA komponen: response action dikembalikan mentah (JSON).
 * matcha: raw fetch() ke document route (/settings) selalu dibalas HTML dokumen
 * → res.json() throw → toast "Gagal menyimpan" palsu padahal tersimpan.
 * Jangan taruh JSON action di document route.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    lang?: string;
    newCardsPerDay?: number;
  };

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

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  return Response.json({ lang: await getTargetLang() });
}

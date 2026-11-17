import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { inUserContext } from "~/lib/user-context";

/**
 * Catatan + Tanya-Jawab per step Rute.
 * GET /api/route?stepId=ja-n5-001 → { note, qa }
 * POST { stepId, note } → simpan catatan bebas
 * POST { stepId, qa: { q, a } } → simpan 1 Tanya-Jawab Ling
 */
export function loader(...args: Parameters<typeof _loader>) {
  return inUserContext(() => _loader(...args));
}

async function _loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const stepId = new URL(request.url).searchParams.get("stepId") ?? "";
  if (!stepId) return Response.json({ error: "stepId wajib" }, { status: 400 });
  const { getStepNotes } = await import("~/lib/route.progress");
  return Response.json(await getStepNotes(stepId));
}

export function action(...args: Parameters<typeof _action>) {
  return inUserContext(() => _action(...args));
}

async function _action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    stepId?: string;
    note?: string;
    qa?: { q?: string; a?: string };
  };
  const stepId = (body.stepId ?? "").trim();
  if (!stepId) return Response.json({ error: "stepId wajib" }, { status: 400 });
  const { saveStepNote, addStepQA } = await import("~/lib/route.progress");

  if (body.qa && (body.qa.q ?? "").trim() && (body.qa.a ?? "").trim()) {
    const qa = await addStepQA(stepId, body.qa.q!, body.qa.a!);
    return Response.json({ ok: true, qa });
  }
  if (typeof body.note === "string") {
    await saveStepNote(stepId, body.note);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "note atau qa wajib" }, { status: 400 });
}

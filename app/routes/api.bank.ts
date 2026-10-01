import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import {
  generateBankWords,
  listBank,
  getBankStats,
  markKnown,
  resetStatus,
  startLearning,
  isCefr,
} from "~/lib/bank.server";

/**
 * GET /api/bank              → semua entri + stat
 * GET /api/bank?cefr=B1      → filter level
 * GET /api/bank?status=learning
 * GET /api/bank?stats=1      → hanya stat (badge count)
 * POST { id, action: "learn"|"know"|"reset" }
 * POST { action: "generate", level, count, topic? } → generate kata baru via LLM
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);

  if (url.searchParams.get("stats")) {
    return Response.json(await getBankStats());
  }

  const [entries, stats] = await Promise.all([
    listBank({
      cefr: url.searchParams.get("cefr") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    }),
    getBankStats(),
  ]);
  return Response.json({ entries, stats });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    action?: string;
    level?: string;
    count?: number;
    topic?: string;
  };

  if (body.action === "generate") {
    const level = isCefr(body.level) ? body.level : "B1";
    const count = Math.min(30, Math.max(5, Number(body.count) || 10));
    try {
      const res = await generateBankWords({ level, count, topic: body.topic });
      return Response.json({ ok: true, ...res });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Generate gagal" },
        { status: 500 },
      );
    }
  }

  if (!Number.isInteger(body.id)) {
    return Response.json({ error: "id wajib" }, { status: 400 });
  }
  try {
    if (body.action === "learn") {
      await startLearning(body.id!);
      return Response.json({ ok: true, status: "learning" });
    }
    if (body.action === "know") {
      await markKnown(body.id!);
      return Response.json({ ok: true, status: "known" });
    }
    if (body.action === "reset") {
      await resetStatus(body.id!);
      return Response.json({ ok: true, status: "new" });
    }
    return Response.json({ error: "action tidak dikenal" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Gagal" },
      { status: 400 },
    );
  }
}

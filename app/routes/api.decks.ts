import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { deleteDeck, importDeck, listDecks, type ImportRow } from "~/lib/decks.server";

/**
 * GET /api/decks → daftar deck.
 * POST { op:"import", meta, rows } → impor TSV yang sudah di-parse klien.
 * POST { op:"delete", deckId } → hapus deck + isi.
 * Resource route TANPA komponen (JSON mentah).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const { getTargetLang } = await import("~/lib/lang.server");
  return Response.json({ decks: await listDecks(await getTargetLang()) });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    op?: string;
    deckId?: number;
    meta?: { name?: string; lang?: string; level?: string; source?: string; license?: string };
    rows?: ImportRow[];
  };
  if (body.op === "delete" && Number.isInteger(body.deckId)) {
    const removed = await deleteDeck(body.deckId!);
    return Response.json({ ok: true, removed });
  }
  if (body.op === "import" && body.meta && Array.isArray(body.rows)) {
    try {
      const r = await importDeck(
        {
          name: body.meta.name ?? "",
          lang: body.meta.lang ?? "ja",
          level: body.meta.level,
          source: body.meta.source,
          license: body.meta.license,
        },
        body.rows.slice(0, 10_000),
      );
      return Response.json({ ok: true, ...r });
    } catch (e) {
      return Response.json(
        { ok: false, error: e instanceof Error ? e.message : "Impor gagal" },
        { status: 400 },
      );
    }
  }
  return Response.json({ ok: false, error: "op tidak dikenal" }, { status: 400 });
}

import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { isReadingLevelFor, readingLevels, type ReadingLevel } from "~/lib/reading.shared";

/**
 * POST /api/reading — JSON actions buat halaman Reading (baca/hapus/generate/latest).
 * Resource route TANPA komponen: response action dikembalikan mentah (JSON).
 * matcha: dulu action tinggal di reading.tsx (document route) → raw fetch()
 * selalu dapat HTML dokumen, res.json() throw → "Generate gagal" palsu padahal
 * row kepalang masuk DB. Jangan taruh JSON action di document route.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang();
  const { bumpReadCount, deleteReading, generateReading, listReadings } = await import(
    "~/lib/reading.server"
  );
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: number;
    level?: string;
  };

  if (body.action === "read") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id nggak valid" }, { status: 400 });
    await bumpReadCount(id);
    return Response.json({ ok: true });
  }

  if (body.action === "delete") {
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "id nggak valid" }, { status: 400 });
    await deleteReading(id);
    return Response.json({ ok: true });
  }

  // Recovery generate: kalau response generate hilang di jalan (timeout koneksi
  // setelah row kepalang masuk DB), client tanya bacaan terbaru setelah timestamp
  // ini — kalau ada, langsung dibuka biar gak perlu refresh manual.
  if (body.action === "latest") {
    const after = Number(body.id);
    const level: ReadingLevel = isReadingLevelFor(lang, body.level)
      ? body.level!
      : (readingLevels(lang)[0]! as ReadingLevel);
    const [row] = await listReadings(lang, level);
    if (row && (!Number.isFinite(after) || row.createdAt > after)) {
      return Response.json({ ok: true, id: row.id, title: row.title });
    }
    return Response.json({ ok: false });
  }

  if (body.action === "generate") {
    const level: ReadingLevel = isReadingLevelFor(lang, body.level)
      ? body.level!
      : (readingLevels(lang)[0]! as ReadingLevel);
    try {
      // Hitung row per level → topik bergilir dari jumlah yang sudah ada.
      const existing = await listReadings(lang, level);
      const { id, title } = await generateReading(lang, level, existing.length);
      return Response.json({ ok: true, id, title });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Generate gagal" },
        { status: 502 },
      );
    }
  }
  return Response.json({ error: "action nggak dikenal" }, { status: 400 });
}

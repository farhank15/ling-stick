import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { requireUser } from "~/lib/auth.server";
import {
  addExamplesToItem,
  findItemIdByText,
  saveItem,
  DuplicateItemError,
  type ItemType,
} from "~/lib/items.server";
import { readBody } from "~/lib/parse.server";

/**
 * POST /api/items — simpan item + contoh + alternatif + buat kartu (BLUEPRINT §7).
 * GET /api/items?q=&type=&register=&status=&tag= — list library.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = await readBody<{
    text?: string;
    type?: ItemType;
    register?: string;
    meaningId?: string;
    notesId?: string;
    source?: string;
    confidence?: string;
    reading?: string;
    examples?: {
      senseLabel?: string;
      register?: string;
      en?: string;
      idText?: string;
      isContext?: boolean;
    }[];
    alternatives?: { text?: string; register?: string; nuanceId?: string; useWhenId?: string }[];
    tagNames?: string[];
    addExamplesTo?: string;
    _redirect?: string;
  }>(request);

  // Submit form biasa (non-JS fallback) → redirect balik, jangan balikin JSON mentah.
  if (body._redirect) {
    const id = await findItemIdByText(body.text ?? "");
    const to = id ? `/library/${id}` : "/";
    return redirect(to, 303);
  }

  // Fallback manual: arti diketik sendiri kalau LLM gagal (BLUEPRINT §10).
  const examples = (body.examples ?? [])
    .filter((e) => (e.en ?? "").trim() && (e.idText ?? "").trim())
    .map((e) => ({
      senseLabel: e.senseLabel,
      register: e.register || "neutral",
      en: e.en!,
      idText: e.idText!,
      isContext: e.isContext,
    }));

  // Tambah contoh ke item yang sudah ada — TIDAK butuh teks baru (validasi teks dilewati).
  if (body.addExamplesTo) {
    if (examples.length === 0) {
      return Response.json({ error: "Contoh kalimat wajib diisi" }, { status: 400 });
    }
    const addTo = Number(body.addExamplesTo);
    if (Number.isInteger(addTo)) await addExamplesToItem(addTo, examples);
    return Response.json({ ok: true, id: body.addExamplesTo, addedToExisting: true });
  }

  const text = (body.text ?? "").trim();
  if (!text || text.length > 200) {
    if (body._redirect) return redirect("/?error=teks-kosong", 303);
    return Response.json({ error: "Teks wajib 1–200 karakter" }, { status: 400 });
  }

  const type: ItemType = body.type ?? "word";
  try {
    const id = await saveItem({
      text,
      type,
      register: body.register,
      reading: body.reading,
      meaningId: body.meaningId,
      notesId: body.notesId,
      source: body.source,
      confidence: body.confidence,
      examples: examples.length
        ? examples
        : // minimal: tanpa contoh pun boleh simpan (edit belakangan).
          [],
      alternatives: (body.alternatives ?? [])
        .filter((a) => (a.text ?? "").trim())
        .map((a) => ({
          text: a.text!,
          register: a.register,
          nuanceId: a.nuanceId,
          useWhenId: a.useWhenId,
        })),
      tagNames: body.tagNames,
    });
    return Response.json({ ok: true, id });
  } catch (e) {
    if (e instanceof DuplicateItemError) {
      return Response.json(
        { error: e.message, duplicateOf: e.existingId },
        { status: 409 },
      );
    }
    const dupId = await findItemIdByText(text);
    if (dupId) return Response.json({ error: "Item sudah ada", duplicateOf: dupId }, { status: 409 });
    return Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}

export async function loader({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const { listItems } = await import("~/lib/items.server");
  const rows = await listItems({
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    register: url.searchParams.get("register") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    limit: Number(url.searchParams.get("limit") ?? 100),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });
  return Response.json({ items: rows });
}

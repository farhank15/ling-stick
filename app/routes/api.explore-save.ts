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

const TYPES: ItemType[] = [
  "word",
  "phrasal_verb",
  "idiom",
  "collocation",
  "slang",
  "reaction",
  "sentence",
];

/**
 * POST /api/explore-save — simpan ekspresi dari Explore / EOTD ke Library.
 * Body JSON: { text, type, register, meaningId, notesId?, source?, exampleEn?, exampleId? }
 * Kalau item sudah ada → contoh (kalau ada) ditambahkan ke item lama.
 */
export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = await readBody<{
    text?: string;
    type?: string;
    register?: string;
    meaningId?: string;
    notesId?: string;
    source?: string;
    exampleEn?: string;
    exampleId?: string;
    examples?: { en?: string; id?: string }[];
  }>(request);

  // Submit form biasa (non-JS) → redirect balik, jangan balikin JSON mentah.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return redirect("/explore", 303);
  }

  const text = (body.text ?? "").trim();
  if (!text || text.length > 200) {
    return Response.json({ error: "Teks wajib 1–200 karakter" }, { status: 400 });
  }

  const type = TYPES.includes(body.type as ItemType) ? (body.type as ItemType) : "idiom";
  const register = ["formal", "neutral", "informal", "slang"].includes(body.register ?? "")
    ? body.register!
    : "informal";

  // Contoh: array 3–5 dari Explore; fallback ke 1 contoh lama (exampleEn/exampleId).
  const fromList = (body.examples ?? [])
    .map((e) => ({ en: (e?.en ?? "").trim(), id: (e?.id ?? "").trim() }))
    .filter((e) => e.en)
    .slice(0, 5)
    .map((e) => ({ register: "neutral", en: e.en, idText: e.id || "(belum ada terjemahan)" }));
  const examples = fromList.length
    ? fromList
    : (body.exampleEn ?? "").trim()
      ? [
          {
            register: "neutral",
            en: body.exampleEn!.trim(),
            idText: (body.exampleId ?? "").trim() || "(belum ada terjemahan)",
          },
        ]
      : [];

  // Sudah ada? Tambahkan contoh baru ke item lama (kalau ada), jangan duplikat.
  const existingId = await findItemIdByText(text);
  if (existingId) {
    await addExamplesToItem(existingId, examples);
    return Response.json({ ok: true, id: existingId, existed: true });
  }

  try {
    const id = await saveItem({
      text,
      type,
      register,
      meaningId: body.meaningId,
      notesId: body.notesId,
      source: body.source,
      confidence: "medium",
      examples,
    });
    return Response.json({ ok: true, id, existed: false });
  } catch (e) {
    if (e instanceof DuplicateItemError) {
      await addExamplesToItem(e.existingId, examples);
      return Response.json({ ok: true, id: e.existingId, existed: true });
    }
    return Response.json({ error: "Gagal menyimpan" }, { status: 500 });
  }
}

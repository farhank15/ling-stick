import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth.server";
import {
  getKanjiCardDetail,
  getKanjiDetail,
  getKanjiQueue,
  rateKanjiCard,
  setKanjiKnown,
  type KanjiMode,
} from "~/lib/kanji.server";
import { enrichKanji } from '~/lib/kanji-enrich.server';

/**
 * GET /api/kanji?mode=recognition → antrean flashcard kanji N5
 * GET /api/kanji?detail=食 → detail 1 kartu
 * POST { kanji, mode, rating 1..4 } → nilai FSRS
 */
const MODES = ["recognition", "recall", "reading", "production"] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const url = new URL(request.url);
  const detail = url.searchParams.get("detail");
  if (detail) {
    // Detail penuh (bacaan + komponen + vocab + SVG) untuk halaman Aksara.
    const d = await getKanjiDetail(detail);
    if (!d) return Response.json({ error: "Kanji tidak ada" }, { status: 404 });
    return Response.json({ detail: d });
  }
  const card = url.searchParams.get("card");
  if (card) {
    const d = await getKanjiCardDetail(card);
    if (!d) return Response.json({ error: "Kanji tidak ada" }, { status: 404 });
    return Response.json({ card: d });
  }
  const mode = (url.searchParams.get("mode") ?? "recognition") as KanjiMode;
  if (!MODES.includes(mode as (typeof MODES)[number])) {
    return Response.json({ error: "mode tidak dikenal" }, { status: 400 });
  }
  // Level dari tab aktif (N5..N1) — tanpa ini drill selalu menarik N5.
  const lvl = Number((url.searchParams.get("level") ?? "N5").replace(/^N/i, ""));
  const jlpt = Number.isInteger(lvl) && lvl >= 1 && lvl <= 5 ? lvl : 5;
  return Response.json({ cards: await getKanjiQueue(mode, 20, jlpt) });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const body = (await request.json().catch(() => ({}))) as {
    kanji?: string;
    mode?: string;
    rating?: number;
    known?: boolean;
    enrich?: string;
  };

  // Lengkapi data kanji dari LLM (komponen/radikal/JLPT) — sebelum maupun sesudah simpan.
  if (body.enrich) {
    const ch = body.enrich.trim();
    if (!ch) return Response.json({ error: 'kanji wajib' }, { status: 400 });
    try {
      return Response.json(await enrichKanji(ch));
    } catch (e) {
      let msg = 'Gagal melengkapi kanji';
      if (e instanceof Error) msg = e.message;
      return Response.json({ error: msg }, { status: 502 });
    }
  }
  const kanji = (body.kanji ?? "").trim();
  // Tanda "dikenal" manual dari sheet detail — jalur terpisah dari rating FSRS.
  if (typeof body.known === "boolean") {
    if (!kanji) return Response.json({ error: "kanji wajib" }, { status: 400 });
    return Response.json(await setKanjiKnown(kanji, body.known));
  }
  const mode = body.mode as KanjiMode;
  const rating = Number(body.rating);
  if (!kanji || !MODES.includes(mode as (typeof MODES)[number]) || ![1, 2, 3, 4].includes(rating)) {
    return Response.json({ error: "kanji, mode & rating 1..4 wajib" }, { status: 400 });
  }
  return Response.json(await rateKanjiCard(kanji, mode, rating as 1 | 2 | 3 | 4));
}

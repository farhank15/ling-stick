import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useFetcher, useLoaderData, useNavigation } from "react-router";
import { ArrowLeft, CheckCircle2, Lightbulb, Loader2, Sparkles, TriangleAlert, Volume2 } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "~/components/ConfirmModal";
import { SpeakButton } from "~/components/SpeakButton";
import { useToast } from "~/components/Toast";
import { JaText, hasJa, splitReading } from "~/components/JaText";
import { requireUser } from "~/lib/auth.server";
import { deleteItem, getItemDetail, markLearning, updateItem } from "~/lib/items.server";
import { redirect } from "react-router";

export const meta: MetaFunction = () => [{ title: "Detail Item — LingStick" }];

import { ttsLang } from "~/lib/utils.shared";

function speak(text: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang ?? ttsLang(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request);
  const id = Number(params.id);
  const detail = await getItemDetail(id);
  if (!detail) throw redirect("/library", 303);
  return detail;
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireUser(request);
  const id = Number(params.id);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    await deleteItem(id);
    return redirect("/library", 303);
  }
  if (intent === "toggle-hide-meaning") {
    const detail = await getItemDetail(id);
    await updateItem(id, { hideMeaning: detail?.item.hideMeaning ? 0 : 1 });
    return redirect(`/library/${id}`, 303);
  }
  if (intent === "reactivate") {
    await markLearning(id);
    return redirect(`/library/${id}`, 303);
  }
  return null;
}

export default function ItemDetail() {
  const { item, examples, alternatives, card } = useLoaderData<typeof loader>();
  const toast = useToast();
  const nav = useNavigation();
  const fetcher = useFetcher();
  const [confirming, setConfirming] = useState(false);
  // Generate contoh kalimat via AI — hasil disimpan permanen ke item.
  const [genEx, setGenEx] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  // List contoh yang tampil — contoh baru langsung ditambahkan di sini biar
  // sukses kelihatan instan (dulu cuma masuk DB, list dari loader tidak
  // berubah → kelihatan "tidak terjadi apa-apa" sampai refresh manual).
  // matcha: sukses tanpa toast + tanpa update list = false-failed.
  const [liveExamples, setLiveExamples] = useState(examples);

  const generateExamples = async () => {
    if (genEx.busy) return;
    setGenEx({ busy: true, error: null });
    try {
      // TANPA direction — server tentukan arah dari bahasa target aktif + isi teks
      // (dulu regex ASCII: kanji wo/kore dianggap EN → contoh jadi bahasa Inggris).
      const res = await fetch("/api/usage-examples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: item.text.slice(0, 300) }),
      });
      const data = await res.json();
      if (!res.ok || !data.result) throw new Error(data.error || "Gagal generate");
      const fresh = (data.result.examples as { en: string; id: string; romaji?: string | null }[]).slice(0, 5);
      const save = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addExamplesTo: String(item.id),
          examples: fresh.map((e) => ({
            register: "neutral",
            // JA: romaji dilipat bank-style ("kalimat\nromaji") biar baris
            // romaji tampil di detail (tabel examples gak punya kolom kana).
            en: e.romaji ? `${e.en.trim()}\n${e.romaji.trim()}` : e.en,
            idText: e.id,
          })),
        }),
      });
      const saved = await save.json();
      if (!save.ok) throw new Error(saved.error || "Gagal menyimpan contoh");
      setLiveExamples((list) => [
        ...list,
        ...fresh.map((e, i) => ({
          id: -Date.now() - i,
          itemId: item.id,
          register: "neutral",
          senseLabel: null as string | null,
          isContext: 0 as number,
          en: e.romaji ? `${e.en.trim()}\n${e.romaji.trim()}` : e.en,
          idText: e.id,
        })),
      ]);
      toast(`${fresh.length} contoh tersimpan`);
    } catch (e) {
      setGenEx({ busy: false, error: e instanceof Error ? e.message : "Gagal generate" });
      return;
    }
    setGenEx({ busy: false, error: null });
  };

  const busy = nav.state !== "idle" || fetcher.state !== "idle";
  const checkResult = (fetcher.data as { result?: CheckResult } | undefined)?.result;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/library" className="btn-ghost px-2" aria-label="Kembali">
          <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
        </Link>
        <h1 className="flex-1 text-xl font-bold tracking-tight">{item.text}</h1>
      </div>

      <div className="flex gap-1.5">
        <span className="badge bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {item.type}
        </span>
        <span className="badge bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
          {item.register}
        </span>
        {item.status !== "learning" ? (
          <span className="badge bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
            {item.status === "known" ? "sudah hafal" : "arsip"}
          </span>
        ) : null}
        {item.confidence === "low" ? (
          <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            conf. rendah
          </span>
        ) : null}
      </div>

      {item.hideMeaning ? (
        <p className="text-sm italic text-zinc-400">arti disembunyikan (self-test) — ketuk tombol di bawah buat lihat</p>
      ) : item.meaningId ? (
        <p className="text-base font-medium">{item.meaningId}</p>
      ) : null}
      {item.notesId ? (
        <p className="text-sm italic text-zinc-500">
          <Lightbulb className="mr-1 inline h-3.5 w-3.5" /> {item.notesId}
        </p>
      ) : null}
      {item.source ? (
        <p className="text-xs text-zinc-400">Sumber: {item.source}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Form method="post">
          <input type="hidden" name="intent" value="toggle-hide-meaning" />
          <button className="btn-secondary" type="submit">
            {item.hideMeaning ? "Tampilkan arti" : "Sembunyikan arti"}
          </button>
        </Form>
        <FetcherButton
          to="/api/review"
          body={{ itemId: item.id, action: "known" }}
          label="Tandai sudah hafal"
        />
      </div>

      {card ? (
        <p className="text-xs text-zinc-400">
          Review: {card.reps}× diulang · due{" "}
          {new Date(card.due).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
          })}
        </p>
      ) : null}

      {/* Contoh */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="label">Contoh kalimat</h2>
          <button
            className="btn-ghost inline-flex items-center gap-1 text-xs disabled:opacity-50"
            disabled={genEx.busy}
            onClick={() => void generateExamples()}
          >
            {genEx.busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            )}
            {genEx.busy ? "Lagi generate…" : "Generate contoh (AI)"}
          </button>
        </div>
        {genEx.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {genEx.error}
          </p>
        ) : null}
        {liveExamples.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada contoh — tap “Generate contoh (AI)” di atas.</p>
        ) : (
          liveExamples.map((ex) => (
            <div key={ex.id} className="card">
              <div className="flex items-center gap-1.5">
                <span className="badge bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {ex.register}
                </span>
                {ex.senseLabel ? (
                  <span className="text-[11px] text-zinc-400">{ex.senseLabel}</span>
                ) : null}
                {ex.isContext ? (
                  <span className="badge bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                    dari sumber
                  </span>
                ) : null}
                <span className="flex-1" />
                <SpeakButton
                  text={ex.en}
                  buttonClassName="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                  title="Dengarkan contoh"
                />
              </div>
              {(() => {
                const jpLine = ex.en.split("\n")[0] ?? ex.en;
                const romajiLine = ex.en.includes("\n") ? ex.en.split("\n").slice(1).join(" ") : null;
                // JA: furigana per kanji + romaji baris ke-2. EN: polos + highlight.
                if (hasJa(jpLine)) {
                  return (
                    <>
                      <p className="mt-1.5 text-sm">
                        <JaText text={jpLine} kanjiClassName="text-teal-700 dark:text-teal-400" className="text-sm" />
                      </p>
                      {romajiLine ? (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">{romajiLine}</p>
                      ) : null}
                    </>
                  );
                }
                return (
                  <p className="mt-1.5 text-sm">
                    <Highlighted text={ex.en} highlight={item.text} />
                  </p>
                );
              })()}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{ex.idText}</p>
            </div>
          ))
        )}
      </section>

      {/* Alternatif */}
      {alternatives.length > 0 ? (
        <section className="space-y-2">
          <h2 className="label">Cara lain ngomong</h2>
          {alternatives.map((a) => (
            <div key={a.id} className="card">
              <p className="text-sm font-medium">
                {a.text}
                {a.register ? (
                  <span className="badge ml-1.5 bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                    {a.register}
                  </span>
                ) : null}
              </p>
              {a.nuanceId ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{a.nuanceId}</p>
              ) : null}
              {a.useWhenId ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Kapan: {a.useWhenId}</p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {/* Cek kalimatku (F6) */}
      <section className="space-y-2">
        <h2 className="label">Cek kalimatku</h2>
        <fetcher.Form method="post" action="/api/check-sentence">
          <input type="hidden" name="itemId" value={item.id} />
          <textarea
            className="input min-h-16"
            name="sentence"
            placeholder={`Tulis kalimatmu pakai “${item.text}”…`}
            required
          />
          <button className="btn-primary mt-2 w-full" type="submit" disabled={busy}>
            {busy ? "Memeriksa…" : "Koreksi kalimat"}
          </button>
        </fetcher.Form>
        {checkResult ? (
          <div
            className={`card ${checkResult.correct ? "border-teal-300 dark:border-teal-700" : "border-amber-300 dark:border-amber-700"}`}
          >
            <p className="text-sm font-medium">
              {checkResult.correct ? (
                <span className="inline items-center gap-1">
                  <CheckCircle2 className="inline h-4 w-4" /> Sudah bagus!
                </span>
              ) : (
                <span className="inline items-center gap-1">
                  <TriangleAlert className="inline h-4 w-4" /> Ada yang bisa diperbaiki
                </span>
              )}
            </p>
            {checkResult.better ? (
              <p className="mt-1 text-sm">
                Versi lebih natural: <span className="font-medium">{checkResult.better}</span>
              </p>
            ) : null}
            {checkResult.explanation_id ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {checkResult.explanation_id}
              </p>
            ) : null}
            {checkResult.register_note_id ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Register: {checkResult.register_note_id}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Hapus */}
      <button className="btn-danger w-full" type="button" onClick={() => setConfirming(true)}>
        Hapus item
      </button>

      <ConfirmModal
        open={confirming}
        title="Hapus item ini?"
        message={`“${item.text}” beserta kartu reviewnya akan dihapus permanen.`}
        busy={busy}
        onConfirm={() => {
          const fd = new FormData();
          fd.set("intent", "delete");
          fetcher.submit(fd, { method: "post" });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function FetcherButton({ to, body, label }: { to: string; body: unknown; label: string }) {
  const fetcher = useFetcher();
  return (
    <button
      className="btn-secondary"
      type="button"
      disabled={fetcher.state !== "idle"}
      onClick={() =>
        fetcher.submit(body as never, {
          method: "post",
          action: to,
          encType: "application/json" as never,
        })
      }
    >
      {label}
    </button>
  );
}

function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const t = highlight.trim();
  if (!t) return <>{text}</>;
  const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === t.toLowerCase() ? (
          <strong key={i} className="text-teal-700 dark:text-teal-400">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

type CheckResult = {
  correct: boolean;
  better: string;
  explanation_id: string;
  register_note_id: string;
};

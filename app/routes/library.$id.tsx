import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useFetcher, useLoaderData, useNavigation } from "react-router";
import { ArrowLeft, CheckCircle2, Lightbulb, TriangleAlert, Volume2 } from "lucide-react";
import { useState } from "react";
import { ConfirmModal } from "~/components/ConfirmModal";
import { requireUser } from "~/lib/auth.server";
import { deleteItem, getItemDetail, markLearning, updateItem } from "~/lib/items.server";
import { redirect } from "react-router";

export const meta: MetaFunction = () => [{ title: "Detail Item — LingStick" }];

function speak(text: string, lang = "en-US") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
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
  const nav = useNavigation();
  const fetcher = useFetcher();
  const [confirming, setConfirming] = useState(false);

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
        <h2 className="label">Contoh kalimat</h2>
        {examples.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada contoh.</p>
        ) : (
          examples.map((ex) => (
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
                <button
                  className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-teal-600 dark:hover:bg-zinc-800"
                  title="Dengarkan contoh"
                  aria-label="Dengarkan contoh"
                  onClick={() => speak(ex.en)}
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-sm">
                <Highlighted text={ex.en} highlight={item.text} />
              </p>
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

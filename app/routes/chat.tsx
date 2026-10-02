import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { JaText, hasJa } from "~/components/JaText";
import { SpeakButton } from "~/components/SpeakButton";
import { ConfirmModal } from "~/components/ConfirmModal";
import { MarkdownLite } from "~/components/MarkdownLite";
import { useToast } from "~/components/Toast";

export const meta: MetaFunction = () => [{ title: "Chat dengan Ling — LingStick" }];
export const handle = { title: "Chat dengan Ling" };

type Suggestion = { text: string; reading?: string; meaning_id: string; examples: { en: string; id: string }[] };
type Msg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; suggestions?: Suggestion[] };
type SessionRow = {
  id: number;
  title: string;
  updatedAt: number;
  messageCount: number;
  lastMessage: string;
};
type ConfirmState = { kind: "one" | "all"; id?: number; title?: string } | null;

/** Pesan pembuka sesuai bahasa target aktif — gak ngunci ke bahasa Inggris. */
function openingFor(lang: string): Msg {
  const content =
    lang === "ja"
      ? "Hai! Aku **Ling**, temen belajar bahasa Jepangmu. Tanya apa aja:\n- Kosakata & kanji baru\n- Partikel dan tata bahasa (bentuk て, bentuk た, keigo)\n- Cara ngomong formal vs santai\n- Minta contoh percakapan\n\nKalau ada kosakata menarik, aku kasih tombol simpan langsung ke Library ya."
      : "Hai! Aku **Ling**, temen belajar bahasamu. Tanya apa aja:\n- Kata baru, idiom, phrasal verb\n- Grammar yang bikin bingung\n- Cara ngomong formal vs santai\n- Minta contoh percakapan\n\nKalau ada kosakata menarik, aku kasih tombol simpan langsung ke Library ya.";
  return { role: "assistant", content };
}

function startersFor(lang: string): string[] {
  return lang === "ja"
    ? [
        "Apa bedanya は dan が?",
        "Kasih 3 ekspresi buat ngobrol santai",
        "Biar sopan: cara bilang \"saya nggak jadi\" dalam bahasa Jepang",
        "Kapan pakai に dan へ?",
      ]
    : [
        "Apa bedanya \"used to\" dan \"be used to\"?",
        "Kasih 3 idiom buat ngobrol santai",
        "Biar gaul: cara bilang \"saya nggak jadi\"",
        "Kapan pakai \"affect\" vs \"effect\"?",
      ];
}

function parseSuggestions(json: string | null): Suggestion[] | undefined {
  if (!json) return undefined;
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) ? (arr as Suggestion[]) : undefined;
  } catch {
    return undefined;
  }
}

import { ttsLang } from "~/lib/utils.shared";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return { lang: await getTargetLang() };
}

function speak(s: string, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(s);
  u.lang = lang ?? ttsLang(s);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function Chat() {
  const { lang } = useLoaderData<typeof loader>();
  const ja = lang === "ja";
  const toast = useToast();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>(() => [openingFor(lang)]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [savedTexts, setSavedTexts] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const refreshSessions = async () => {
    try {
      const r = await fetch("/api/chat/sessions");
      const d = await r.json();
      setSessions(d.sessions ?? []);
    } catch {
      /* diam */
    }
  };

  useEffect(() => {
    void refreshSessions();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  // Quick replies: saran kata terakhir + starter — makin lama makin kontekstual.
  const quickReplies = useMemo(() => {
    const fromSuggestions = msgs
      .flatMap((m) => (m.role === "assistant" ? (m.suggestions ?? []) : []))
      .map((s) => s.text)
      .filter(Boolean);
    const unique = [...new Set(fromSuggestions)].slice(-2);
    const starters = startersFor(lang).slice(0, 3 - Math.min(2, unique.length));
    return [...unique, ...starters].slice(0, 3);
  }, [msgs, lang]);

  const newChat = () => {
    setSessionId(null);
    setMsgs([openingFor(lang)]);
    setHistOpen(false);
  };

  const openSession = async (id: number) => {
    setHistOpen(false);
    setLoadingSession(true);
    try {
      const r = await fetch(`/api/chat/sessions?id=${id}`);
      const d = await r.json();
      if (d.session) {
        setSessionId(d.session.id);
        const loaded: Msg[] = (d.messages ?? []).map(
          (m: { role: string; content: string; suggestionsJson: string | null }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            suggestions: parseSuggestions(m.suggestionsJson),
          }),
        );
        setMsgs(loaded.length > 0 ? loaded : [openingFor(lang)]);
      }
    } catch {
      toast("Gagal memuat obrolan");
    } finally {
      setLoadingSession(false);
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "…" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSessionId(data.sessionId);
        setMsgs((m) => [
          ...m.slice(0, -1),
          {
            role: "assistant" as const,
            content: data.reply,
            suggestions: data.suggestions ?? [],
          },
        ]);
        void refreshSessions();
      } else {
        setMsgs((m) => [
          ...m.slice(0, -1),
          { role: "assistant" as const, content: `Maaf, gagal: ${data.error ?? "?"}` },
        ]);
      }
    } catch {
      setMsgs((m) => [
        ...m.slice(0, -1),
        { role: "assistant" as const, content: "Server nggak merespons. Coba lagi ya." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const saveSuggestion = async (s: Suggestion) => {
    if (savedTexts.has(s.text) || saving) return;
    setSaving(s.text);
    try {
      const res = await fetch("/api/explore-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: s.text.slice(0, 120),
          type: "word",
          register: "neutral",
          meaningId: s.meaning_id,
          source: "Chat — Ling",
          examples: s.examples.map((e) => ({ en: e.en, id: e.id })),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSavedTexts((set) => new Set(set).add(s.text));
        toast(data.existed ? "Sudah ada di Library" : "Tersimpan ke Library");
      } else {
        toast(data.error ?? "Gagal menyimpan");
      }
    } catch {
      toast("Gagal menyimpan");
    } finally {
      setSaving(null);
    }
  };

  const copyMsg = async (idx: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      toast("Gagal menyalin");
    }
  };

  const doDelete = async () => {
    if (!confirm) return;
    try {
      const body = confirm.kind === "all" ? { action: "clear" } : { action: "delete", id: confirm.id };
      const res = await fetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        if (confirm.kind === "all" || confirm.id === sessionId) newChat();
        toast(confirm.kind === "all" ? "Semua obrolan dihapus" : "Obrolan dihapus");
      } else {
        toast(data.error ?? "Gagal menghapus");
      }
    } catch {
      toast("Gagal menghapus");
    } finally {
      setConfirm(null);
      void refreshSessions();
    }
  };

  return (
    <div className="relative flex flex-1 flex-col space-y-3">
      {/* Header kecil: riwayat + obrolan baru — sticky di bawah app header */}
      <div className="sticky top-13 z-10 -mx-4 flex items-center justify-between gap-2 bg-zinc-50/95 px-4 py-1.5 backdrop-blur dark:bg-zinc-950/95">
        <div className="relative">
          <button className="chip min-h-9 gap-1.5" onClick={() => setHistOpen((o) => !o)} aria-label="Riwayat obrolan">
            <History className="h-4 w-4" /> Riwayat
            {sessions.length > 0 ? (
              <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] dark:bg-zinc-800">
                {sessions.length}
              </span>
            ) : null}
          </button>
          {histOpen ? (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setHistOpen(false)} />
              <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-80 max-w-[85vw] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-3.5 py-2 dark:border-zinc-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Riwayat obrolan</p>
                  {sessions.length > 0 ? (
                    <button
                      className="inline-flex items-center gap-1 text-[11px] text-red-500 hover:underline"
                      onClick={() => setConfirm({ kind: "all" })}
                    >
                      <Trash2 className="h-3 w-3" /> Hapus semua
                    </button>
                  ) : null}
                </div>
                {sessions.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-zinc-500">Belum ada obrolan tersimpan.</p>
                ) : (
                  <ul>
                    {sessions.map((s) => (
                      <li key={s.id} className="group flex items-stretch">
                        <button
                          className="min-w-0 flex-1 px-3.5 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                          onClick={() => void openSession(s.id)}
                        >
                          <span className="block truncate text-sm font-medium">{s.title}</span>
                          <span className="block truncate text-[11px] text-zinc-500">
                            {s.lastMessage || `${s.messageCount} pesan`}
                          </span>
                        </button>
                        <button
                          className="px-3 text-zinc-300 hover:text-red-500 dark:text-zinc-600"
                          aria-label={`Hapus ${s.title}`}
                          onClick={() => setConfirm({ kind: "one", id: s.id, title: s.title })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
        <button className="chip min-h-9 gap-1.5" onClick={newChat} aria-label="Obrolan baru">
          <MessageSquarePlus className="h-4 w-4" /> Baru
        </button>
      </div>

      {/* Area pesan */}
      <div className="space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
                m.role === "user"
                  ? "rounded-br-md bg-teal-600 text-sm leading-relaxed text-white"
                  : "card rounded-bl-md shadow-none"
              }`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap">{m.content}</p>
              ) : m.content === "…" && i === msgs.length - 1 && busy ? (
                <span className="inline-flex items-center gap-1 py-1" aria-label="Ling lagi ngetik">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="sr-only">Ling lagi ngetik…</span>
                </span>
              ) : (
                <>
                  <MarkdownLite text={m.content} />
                  {/* Aksi bubble: salin + dengar */}
                  <div className="mt-1.5 flex items-center gap-0.5 opacity-50 transition-opacity hover:opacity-100">
                    <button
                      className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => void copyMsg(i, m.content)}
                      title="Salin jawaban"
                      aria-label="Salin jawaban"
                    >
                      {copiedIdx === i ? (
                        <Check className="h-3.5 w-3.5 text-teal-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <SpeakButton
                      text={m.content}
                      lang="id-ID"
                      className="h-3.5 w-3.5"
                      buttonClassName="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      title="Dengarkan jawaban"
                    />
                  </div>
                  {m.suggestions && m.suggestions.length > 0 ? (
                    <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                      <p className="label inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Kata baru — simpan?
                      </p>
                      {m.suggestions.map((s) => (
                        <div key={s.text} className="rounded-xl bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
                          <div className="flex items-start justify-between gap-2">
                            {hasJa(s.text) ? (
                              <p className="min-w-0 flex-1 font-semibold">
                                <JaText text={s.text} reading={s.reading} kanjiClassName="text-teal-700 dark:text-teal-400" className="font-semibold" />
                              </p>
                            ) : (
                              <p className="font-semibold">{s.text}</p>
                            )}
                            <button
                              className="btn-secondary min-h-7 shrink-0 gap-1 px-2 text-[11px]"
                              disabled={savedTexts.has(s.text) || saving === s.text}
                              onClick={() => void saveSuggestion(s)}
                            >
                              {savedTexts.has(s.text) ? (
                                <>
                                  <BookmarkCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />{" "}
                                  Tersimpan
                                </>
                              ) : (
                                <>
                                  <Bookmark className="h-3.5 w-3.5" /> Simpan
                                </>
                              )}
                            </button>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{s.meaning_id}</p>
                          {s.examples[0] ? (
                            <p className="mt-1 flex items-start gap-1 text-xs italic text-zinc-500 dark:text-zinc-500">
                              <span>“{s.examples[0].en}” — {s.examples[0].id}</span>
                              <SpeakButton
                                text={s.examples[0].en}
                                className="h-3 w-3"
                                buttonClassName="shrink-0 not-italic"
                                title="Dengarkan contoh"
                              />
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ))}
        {loadingSession ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat obrolan…
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {/* Quick replies — kontekstual */}
      {!busy && !loadingSession ? (
        <div className="flex flex-wrap gap-1.5">
          {quickReplies.map((s) => (
            <button key={s} className="chip min-h-8 max-w-full text-[11px]" onClick={() => void send(s)}>
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="sticky bottom-24 mt-auto">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <textarea
            className="input-area min-h-11 flex-1 resize-none py-2.5"
            placeholder="Tanya Ling apa aja…"
            rows={1}
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          <button
            className="btn-primary h-11 w-11 shrink-0 rounded-xl p-0"
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Kirim"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      <ConfirmModal
        open={confirm !== null}
        title={confirm?.kind === "all" ? "Hapus semua obrolan?" : "Hapus obrolan ini?"}
        message={
          confirm?.kind === "all"
            ? "Semua riwayat chat dengan Ling akan dihapus permanen."
            : `“${confirm?.title ?? ""}” akan dihapus permanen.`
        }
        busy={false}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

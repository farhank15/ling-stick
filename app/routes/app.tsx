import type { LoaderFunctionArgs, UIMatch } from "react-router";
import {
  Link,
  Outlet,
  useLocation,
  useMatches,
  useNavigation,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, ListChecks } from "lucide-react";
import {
  Compass,
  Languages,
  Library,
  MessageCircle,
  Plus,
  Repeat,
  Settings,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return null;
}

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Tambah", icon: Plus },
  { to: "/library", label: "Library", icon: Library },
  { to: "/bank", label: "Bank", icon: BookMarked },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/review", label: "Review", icon: Repeat },
  { to: "/explore", label: "Explore", icon: Compass },
];

export default function AppLayout() {
  const location = useLocation();
  const nav = useNavigation();
  const matches = useMatches() as UIMatch[];
  const leaf = matches[matches.length - 1];
  const handle = (leaf?.handle ?? {}) as { title?: string; ownHeader?: boolean };

  // Notifikasi beneran: dropdown list (latihan hari ini + riwayat), dot kalau belum selesai.
  const [quizPending, setQuizPending] = useState<{ total: number; done: number; completed: boolean } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [history, setHistory] = useState<{ day: string; title: string; total: number; done: number; correct: number; completed: number }[]>([]);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const loadNotifs = () => {
    fetch("/api/quiz?status=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.pending) setQuizPending(d.pending);
      })
      .catch(() => {});
    fetch("/api/quiz?history=1")
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    loadNotifs();
  }, [location.pathname]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-zinc-50/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <img
            src="/lingstick.png"
            alt="LingStick"
            className="h-7 w-7 rounded-lg object-contain"
          />
          LingStick
        </Link>
        <div className="flex items-center gap-1">
          <div className="relative" ref={notifRef}>
            <button
              className="relative rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              title="Notifikasi"
              aria-label="Notifikasi"
              onClick={() => setNotifOpen((o) => !o)}
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              {quizPending && !quizPending.completed ? (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-teal-500" />
              ) : null}
            </button>
            {notifOpen ? (
              <div className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
                  <p className="text-sm font-semibold">Notifikasi</p>
                </div>
                {quizPending ? (
                  <Link
                    to="/review"
                    className="flex items-start gap-2.5 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    onClick={() => setNotifOpen(false)}
                  >
                    {quizPending.completed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    ) : (
                      <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
                    )}
                    <span className="text-sm">
                      {quizPending.completed ? (
                        <>
                          <span className="block font-medium">Latihan hari ini selesai</span>
                          <span className="block text-xs text-zinc-500">
                            {quizPending.done}/{quizPending.total} dijawab — mantap!
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block font-medium">Latihan hari ini nunggu</span>
                          <span className="block text-xs text-zinc-500">
                            sisa {quizPending.total - quizPending.done} dari {quizPending.total} soal
                          </span>
                        </>
                      )}
                    </span>
                  </Link>
                ) : (
                  <p className="px-4 py-3 text-sm text-zinc-500">Belum ada latihan. Simpan kosakata dulu.</p>
                )}
                {history.length > 0 ? (
                  <div className="border-t border-zinc-100 dark:border-zinc-800">
                    <p className="label px-4 pt-2.5">Riwayat</p>
                    <ul className="pb-1">
                      {history.slice(0, 4).map((h) => (
                        <li key={h.day} className="flex items-center justify-between px-4 py-1.5 text-xs">
                          <span className="text-zinc-600 dark:text-zinc-400">{h.title}</span>
                          <span className={h.completed ? "text-teal-700 dark:text-teal-400" : "text-zinc-400"}>
                            {h.completed ? `${h.correct}/${h.total}` : `${h.done}/${h.total}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <Link
            to="/translate"
            className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Terjemah"
          >
            <Languages className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <Link
            to="/settings"
            className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Pengaturan"
          >
            <Settings className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      <main className={`flex-1 px-4 pb-36 pt-4 ${nav.state !== "idle" ? "opacity-60 transition-opacity" : ""}`}>
        {/* Halaman dgn header sendiri (mis. detail explore) pasang h1-nya sendiri */}
        {handle.title && !handle.ownHeader ? (
          <h1 className="mb-4 text-xl font-bold tracking-tight">{handle.title}</h1>
        ) : null}
        <Outlet />
      </main>

      {/* Floating bottom nav — bar melayang rounded + pill di item aktif */}
      <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="mx-auto grid max-w-md grid-cols-6 gap-1 rounded-2xl border border-zinc-200/80 bg-white/90 p-1.5 shadow-lg shadow-zinc-900/5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-black/20">
          {NAV.map((n) => {
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-all ${
                  active
                    ? "bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-400"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <n.icon
                  className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`}
                  strokeWidth={active ? 2 : 1.75}
                />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

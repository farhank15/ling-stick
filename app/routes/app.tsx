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
  Plus,
  Repeat,
  Settings,
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
  { to: "/review", label: "Review", icon: Repeat },
  { to: "/explore", label: "Explore", icon: Compass },
];

export default function AppLayout() {
  const location = useLocation();
  const nav = useNavigation();
  const matches = useMatches() as UIMatch[];
  const leaf = matches[matches.length - 1];
  const handle = (leaf?.handle ?? {}) as { title?: string };

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
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200 bg-zinc-50/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
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

      <main className={`flex-1 px-4 pb-28 pt-4 ${nav.state !== "idle" ? "opacity-60 transition-opacity" : ""}`}>
        {handle.title ? (
          <h1 className="mb-4 text-xl font-bold tracking-tight">{handle.title}</h1>
        ) : null}
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive(n.to)
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-zinc-500 dark:text-zinc-500"
              }`}
            >
              <n.icon className="h-5 w-5" strokeWidth={1.75} />
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

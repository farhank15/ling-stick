import type { LoaderFunctionArgs, UIMatch } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useMatches,
  useNavigation,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, ListChecks } from "lucide-react";
import {
  Compass,
  House,
  Languages,
  Library,
  MessageCircle,
  Repeat,
  Settings,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  return { lang: await getTargetLang() };
}

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Home", icon: House },
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
  const { lang } = useLoaderData<typeof loader>();
  const isJa = lang === "ja";

  // Notifikasi beneran: dropdown list (latihan hari ini + riwayat), dot kalau belum selesai.
  const [quizPending, setQuizPending] = useState<{ total: number; done: number; completed: boolean } | null>(null);
  const [periodic, setPeriodic] = useState<{
    toefl: { exists: boolean; completed: boolean };
    bulanan: { available: boolean; exists: boolean; completed: boolean };
  } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [history, setHistory] = useState<{ day: string; title: string; total: number; done: number; correct: number; completed: number }[]>([]);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const loadNotifs = () => {
    // Dot bel cuma butuh status (ringan). Riwayat (14 set + order JSON) hanya
    // diambil saat bel dibuka — dulu ikut tiap pindah page, buang 1 request.
    // matcha: 2 fetch per pathname change → 1; history lazy di onToggleNotif.
    fetch("/api/quiz?status=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.pending) setQuizPending(d.pending);
        if (d.periodic) setPeriodic(d.periodic);
      })
      .catch(() => {});
  };

  const onToggleNotif = () => {
    setNotifOpen((o) => {
      if (!o) {
        fetch("/api/quiz?history=1")
          .then((r) => r.json())
          .then((d) => setHistory(d.history ?? []))
          .catch(() => {});
      }
      return !o;
    });
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
      {/* z-40: header + dropdown notif harus di atas SEMUA sticky konten (toolbar library z-20, chips explore z-10, dst) */}
      <header className="sticky top-0 z-40 flex items-center justify-between bg-zinc-50/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
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
              onClick={onToggleNotif}
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              {/* Dot notif: SATU dot merah — nyala kalau ada latihan harian yang belum
                  selesai. Tes periodik cukup dari Review, gak perlu dot dobel/tripel. */}
              {quizPending && !quizPending.completed ? (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
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
                {/* Tes periodik di dropdown notif */}
                {periodic ? (
                  <Link
                    to="/review"
                    className="flex items-start gap-2.5 border-t border-zinc-100 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    onClick={() => setNotifOpen(false)}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          periodic.bulanan.available && !periodic.bulanan.completed
                            ? "bg-amber-500"
                            : !periodic.toefl.completed
                              ? "bg-indigo-500"
                              : "bg-teal-500"
                        }`}
                      />
                    </span>
                    <span className="text-sm">
                      {periodic.bulanan.available && !periodic.bulanan.completed ? (
                        <>
                          <span className="block font-medium">{isJa ? "JLPT Bulanan siap" : "Uji Bulanan siap"}</span>
                          <span className="block text-xs text-zinc-500">
                            50 soal campuran — ngukur progres sebulan ini
                          </span>
                        </>
                      ) : !periodic.toefl.completed ? (
                        <>
                          <span className="block font-medium">
                            {isJa ? "Tes JLPT minggu ini nunggu" : "TOEFL Test minggu ini nunggu"}
                          </span>
                          <span className="block text-xs text-zinc-500">
                            {isJa ? "40 soal gaya JLPT · timer 25 menit" : "40 soal · 3 section · timer 25 menit"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block font-medium">Tes periodik aman</span>
                          <span className="block text-xs text-zinc-500">
                            {isJa
                              ? "JLPT minggu ini & JLPT Bulanan sudah selesai"
                              : "TOEFL minggu ini & Uji Bulanan sudah selesai"}
                          </span>
                        </>
                      )}
                    </span>
                  </Link>
                ) : null}
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
            prefetch="intent"
            className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Terjemah"
          >
            <Languages className="h-5 w-5" strokeWidth={1.75} />
          </Link>
          <Link
            to="/settings"
            prefetch="intent"
            className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            title="Pengaturan"
          >
            <Settings className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </div>
      </header>
      {/* Bar loading global saat pindah page — umpan balik instan biar jeda
          loader kerasa responsif, bukan macet. */}
      <div className="h-0.5 w-full bg-transparent">
        {nav.state !== "idle" ? (
          <div className="h-0.5 origin-left animate-pulse bg-teal-500 transition-all" style={{ width: "70%" }} />
        ) : null}
      </div>

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
                prefetch="intent"
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

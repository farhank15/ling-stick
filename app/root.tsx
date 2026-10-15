import type { LinksFunction, MetaFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from "react-router";
import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { ToastProvider } from "./components/Toast";
import stylesheet from "./app.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "manifest", href: "/manifest.json" },
  { rel: "icon", href: "/lingstick.png", type: "image/png", sizes: "32x32" },
  {
    rel: "apple-touch-icon",
    href: "/lingstick-reactangle.png",
  },
];

export const meta: MetaFunction = () => [
  { title: "LingStick" },
  {
    name: "description",
    content: "Personal English learning app: capture, review, explore.",
  },
  { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
  { name: "theme-color", content: "#0d9488" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Tema aksen sebelum paint — baca localStorage biar ga kedip teal dulu. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("lingstick-theme");if(t&&t!=="teal")document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) { window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); }); }`,
          }}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <OfflineBanner />
      <Outlet />
    </ToastProvider>
  );
}

/** Banner offline global — di semua page. Mutasi butuh internet; baca lokal tetap jalan. */
function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center justify-center gap-1.5 bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white"
    >
      <CloudOff className="h-4 w-4 shrink-0" />
      Offline — halaman tersimpan tetap bisa dibaca, tapi aksi baru butuh internet.
    </div>
  );
}

/**
 * Error boundary global — menangkap error loader/action/render di SEMUA route
 * yang tak punya boundary sendiri. Tampil bersih + bisa retry, bukan blank.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  let title = "Ada yang rusak";
  let desc = "Coba muat ulang — kalau masih gagal, kembali dan ulangi.";
  let code: number | null = null;
  if (isRouteErrorResponse(error)) {
    code = error.status;
    if (error.status === 404) {
      title = "Halaman tidak ada";
      desc = "Alamatnya salah atau sudah dipindah.";
    } else if (error.status === 403 || error.status === 401) {
      title = "Sesi habis";
      desc = "Login lagi buat lanjut.";
    } else {
      title = `Server error ${error.status}`;
    }
  } else if (error instanceof TypeError && /fetch|network|load/i.test(error.message)) {
    title = "Internet putus";
    desc = "Periksa koneksi, lalu muat ulang.";
  } else if (error instanceof Error && error.message) {
    desc = error.message.slice(0, 200);
  }

  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
            <TriangleAlert className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="mt-4 text-lg font-bold">
            {title}
            {code !== null && code !== 404 ? <span className="text-zinc-400"> · {code}</span> : null}
          </p>
          <p className="mt-1 max-w-xs text-sm text-zinc-500">{desc}</p>
          <div className="mt-6 flex gap-2">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" /> Muat ulang
            </button>
            <button className="btn-secondary" onClick={() => window.history.back()}>
              Kembali
            </button>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

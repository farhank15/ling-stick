import type { LinksFunction, MetaFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
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
      <Outlet />
    </ToastProvider>
  );
}

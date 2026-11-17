import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  isAuthenticated,
  login,
  loginUsername,
  ownerEstablished,
  sessionCookieHeader,
} from "~/lib/auth.server";
import { env } from "~/lib/env.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (await isAuthenticated(request)) throw redirect("/", 303);
  return {
    passwordConfigured: Boolean(env.APP_PASSWORD),
    ownerReady: await ownerEstablished(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const bootstrap = form.get("bootstrap") === "1";

  if (bootstrap) {
    const password = String(form.get("password") ?? "");
    const sid = await login(password);
    if (!sid) return { error: "Password salah" };
    const cookie = await sessionCookieHeader(sid);
    return redirect("/", { status: 303, headers: { "Set-Cookie": cookie } });
  }

  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const sid = await loginUsername(username, password);
  if (!sid) return { error: "Username atau password salah" };
  const cookie = await sessionCookieHeader(sid);
  return redirect("/", { status: 303, headers: { "Set-Cookie": cookie } });
}

export default function Login() {
  const data = useActionData<typeof action>() as { error: string } | undefined;
  const loaderData = useLoaderData<typeof loader>();
  const nav = useNavigation();

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <img
            src="/lingstick.png"
            alt="LingStick"
            className="mx-auto mb-3 h-16 w-16 rounded-2xl object-contain"
          />
          <h1 className="text-2xl font-bold tracking-tight">LingStick</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Masuk buat mulai nyimpen kosakata
          </p>
        </div>

        {!loaderData.ownerReady ? (
          <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            <strong>Pemilik data lama?</strong> Login dulu lewat seksi "Pemilik" di bawah untuk
            mengklaim data — setelah itu teman boleh daftar.
          </div>
        ) : null}

        <Form method="post" className="space-y-3">
          {data?.error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {data.error}
            </p>
          ) : null}
          <input
            className="input text-center"
            type="text"
            name="username"
            placeholder="Username"
            autoComplete="username"
            required
            autoFocus
            minLength={3}
            maxLength={24}
          />
          <input
            className="input text-center"
            type="password"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            required
          />
          <button className="btn-primary w-full" type="submit" disabled={nav.state !== "idle"}>
            {nav.state !== "idle" ? "Memeriksa…" : "Masuk"}
          </button>
        </Form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Belum punya akun?{" "}
          <Link to="/register" className="font-medium text-teal-600 hover:underline dark:text-teal-400">
            Daftar
          </Link>
        </p>

        {loaderData.passwordConfigured ? (
          <div className="mt-6 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <p className="label mb-2">Pemilik (bootstrap)</p>
            <Form method="post" className="space-y-2">
              {data?.error ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                  {data.error}
                </p>
              ) : null}
              <input type="hidden" name="bootstrap" value="1" />
              <input
                className="input text-center"
                type="password"
                name="password"
                placeholder="APP_PASSWORD"
                autoComplete="current-password"
                required
              />
              <button className="btn-secondary w-full" type="submit" disabled={nav.state !== "idle"}>
                Klaim data &amp; masuk sebagai pemilik
              </button>
            </Form>
          </div>
        ) : null}
      </div>
    </main>
  );
}

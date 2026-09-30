import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { isAuthenticated, login, sessionCookieHeader } from "~/lib/auth.server";
import { env } from "~/lib/env.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (await isAuthenticated(request)) throw redirect("/", 303);
  if (!env.APP_PASSWORD) {
    return {
      error:
        "APP_PASSWORD belum diset. Salin .env.example jadi .env lalu isi password.",
    };
  }
  return { error: null as string | null };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const sid = await login(password);
  if (!sid) {
    return { error: "Password salah" };
  }
  const cookie = await sessionCookieHeader(sid);
  return redirect("/", {
    status: 303,
    headers: { "Set-Cookie": cookie },
  });
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

        <Form method="post" className="space-y-3">
          {loaderData?.error ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              {loaderData.error}
            </p>
          ) : null}
          {data?.error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {data.error}
            </p>
          ) : null}
          <input
            className="input text-center"
            type="password"
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            autoFocus
          />
          <button className="btn-primary w-full" type="submit" disabled={nav.state !== "idle"}>
            {nav.state !== "idle" ? "Memeriksa…" : "Masuk"}
          </button>
        </Form>
      </div>
    </main>
  );
}

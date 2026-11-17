import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import {
  createSession,
  isAuthenticated,
  ownerEstablished,
  registerAccount,
  sessionCookieHeader,
} from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (await isAuthenticated(request)) throw redirect("/", 303);
  return { ownerReady: await ownerEstablished() };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password !== confirm) {
    return { error: "Konfirmasi password tidak cocok" };
  }
  const result = await registerAccount(username, password);
  if (!result.ok) return { error: result.error };
  const cookie = await sessionCookieHeader(await createSession(result.user.id));
  return redirect("/", { status: 303, headers: { "Set-Cookie": cookie } });
}

export default function Register() {
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
          <h1 className="text-2xl font-bold tracking-tight">Buat akun</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Satu akun = satu data kosakata sendiri
          </p>
        </div>

        {!loaderData.ownerReady ? (
          <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
            Pemilik belum mengklaim data. <strong>Login dulu dengan APP_PASSWORD</strong> (halaman
            login) untuk jadi pemilik &amp; mempertahankan data lama — setelah itu teman boleh daftar.
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
            placeholder="Username (3–24 karakter)"
            autoComplete="username"
            required
            autoFocus
            minLength={3}
            maxLength={24}
            pattern="[a-zA-Z0-9_-]+"
            title="Huruf, angka, tanda hubung, atau garis bawah."
          />
          <input
            className="input text-center"
            type="password"
            name="password"
            placeholder="Password (min. 8 karakter)"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <input
            className="input text-center"
            type="password"
            name="confirm"
            placeholder="Ulangi password"
            autoComplete="new-password"
            required
            minLength={8}
          />
          <button className="btn-primary w-full" type="submit" disabled={nav.state !== "idle"}>
            {nav.state !== "idle" ? "Membuat akun…" : "Daftar"}
          </button>
        </Form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          Sudah punya akun?{" "}
          <Link to="/login" className="font-medium text-teal-600 hover:underline dark:text-teal-400">
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}

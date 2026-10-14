import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ArrowRight } from "lucide-react";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { listItems } from "~/lib/items.server";
import { QuickTranslate } from "~/components/QuickTranslate";
import { RecentItems } from "~/components/RecentItems";
import { Capture } from "~/components/Capture";
import { DashboardStats } from "~/components/DashboardStats";

export const meta: MetaFunction = () => [{ title: "LingStick" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang();
  const recent = await listItems({ limit: 5 });
  // Kartu lanjutan rute (JA saja) — 1 query set + file md lokal, murah.
  let routeCard: { order: number; title: string; segDone: number; segTotal: number; xp: number } | null = null;
  if (lang === "ja") {
    try {
      const { getRouteMap } = await import("~/lib/route.progress");
      const map = await getRouteMap();
      if (map.next) {
        const segSteps = map.steps.filter((s) => s.step.segment === map.next!.step.segment);
        routeCard = {
          order: map.next.step.order,
          title: map.next.step.title_id,
          segDone: segSteps.filter((s) => s.state === "passed").length,
          segTotal: segSteps.length,
          xp: map.xp,
        };
      }
    } catch {
      /* rute opsional — home tetap jalan */
    }
  }
  return { recent, lang, routeCard };
}

/** Menu aksara Jepang — khusus mode JA. Bank tetap pusat frasa/kosakata. */
const AKSARA_CARDS = [
  {
    script: "hiragana",
    glyph: "あ",
    title: "Hiragana",
    desc: "Kana bunyi asli bahasa Jepang",
  },
  {
    script: "katakana",
    glyph: "ア",
    title: "Katakana",
    desc: "Kata serapan & onomatope",
  },
  {
    script: "kanji",
    glyph: "漢",
    title: "Kanji",
    desc: "Per level N5–N1 + latihan",
  },
] as const;

export default function Index() {
  const { recent, lang, routeCard } = useLoaderData<typeof loader>();
  return (
    <>
      {/* Laptop: bento 2 kolom (aksi kiri, riwayat kanan); HP tetap susun vertikal. */}
      <div className="space-y-5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-4 lg:space-y-0">
      <div className="space-y-5 lg:col-span-3">
        {routeCard ? (
          <Link
            to="/rute"
            prefetch="intent"
            className="card group flex items-center gap-3 border-teal-200 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-500/10 dark:border-teal-900"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-lg font-extrabold text-white">
              {routeCard.order}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300">
                Rute N5 · {routeCard.segDone}/{routeCard.segTotal} segmen ini · {routeCard.xp} XP
              </span>
              <span className="block truncate font-semibold">Lanjutkan Step {routeCard.order}: {routeCard.title}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <span
                  className="block h-full bg-teal-600 dark:bg-teal-500"
                  style={{ width: `${(routeCard.segDone / Math.max(1, routeCard.segTotal)) * 100}%` }}
                />
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
        <QuickTranslate />
        {lang === "ja" ? (
          <section className="space-y-2">
            <p className="label px-1">Aksara Jepang</p>
            <div className="grid grid-cols-3 gap-2">
              {AKSARA_CARDS.map((c) => (
                <Link
                  key={c.script}
                  to={`/aksara?script=${c.script}`}
                  prefetch="intent"
                  className="card group flex flex-col items-center gap-0.5 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-500/10 dark:hover:border-teal-800"
                >
                  <span className="text-3xl font-bold leading-none transition-transform group-hover:scale-110">{c.glyph}</span>
                  <span className="mt-1.5 text-sm font-semibold">{c.title}</span>
                  <span className="text-[10px] leading-tight text-zinc-500">{c.desc}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        <Capture />
      </div>
      <div className="lg:col-span-2 lg:sticky lg:top-20">
        <RecentItems items={recent} />
      </div>
      </div>
      {/* Statistik di bawah — biar aksi utama yang menyapa duluan. */}
      <div className="mt-5">
        <DashboardStats />
      </div>
    </>
  );
}

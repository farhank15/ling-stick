import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { getTargetLang } from "~/lib/lang.server";
import { listItems } from "~/lib/items.server";
import { QuickTranslate } from "~/components/QuickTranslate";
import { RecentItems } from "~/components/RecentItems";
import { Capture } from "~/components/Capture";

export const meta: MetaFunction = () => [{ title: "LingStick" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const recent = await listItems({ limit: 5 });
  return { recent, lang: await getTargetLang() };
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
  const { recent, lang } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-5">
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
                className="card flex flex-col items-center gap-0.5 p-3 text-center transition-colors hover:border-teal-300 dark:hover:border-teal-800"
              >
                <span className="text-3xl font-bold leading-none">{c.glyph}</span>
                <span className="mt-1.5 text-sm font-semibold">{c.title}</span>
                <span className="text-[10px] leading-tight text-zinc-500">{c.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <Capture />
      <RecentItems items={recent} />
    </div>
  );
}

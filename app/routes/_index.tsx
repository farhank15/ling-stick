import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from 'react-router';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { requireUser } from '~/lib/auth.server';
import { getTargetLang } from '~/lib/lang.server';
import { listItems } from '~/lib/items.server';
import { getKanjiWidgetLevel, setKanjiWidgetLevel } from '~/lib/prefs.server';
import { listKanji, getKanjiDetail, getKanjiLevelsAvailable, type KanjiDetail } from '~/lib/kanji.server';
import { QuickTranslate } from '~/components/QuickTranslate';
import { RecentItems } from '~/components/RecentItems';
import { Capture } from '~/components/Capture';
import { DashboardStats } from '~/components/DashboardStats';
import { KanjiWidget } from '~/components/KanjiWidget';
import { WeatherWidget } from '~/components/WeatherWidget';

export const meta: MetaFunction = () => [{ title: 'LingStick' }];

const SLEMAN = { lat: -7.7167, lon: 110.356 };

type WeatherCurrent = {
  temperature_2m: number;
  weather_code: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
};

type RouteCard = { order: number; title: string; segDone: number; segTotal: number; xp: number };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);
  const lang = await getTargetLang();
  const recentP = listItems({ limit: 5 });
  const routeP =
    lang === 'ja'
      ? import('~/lib/route.progress').then((m) => m.getRouteMap())
      : Promise.resolve(null);
  const levelP = lang === 'ja' ? getKanjiWidgetLevel() : Promise.resolve(5);
  const [recent, map, level] = await Promise.all([recentP, routeP, levelP]);

  let levels: number[] = [];
  if (lang === 'ja') levels = await getKanjiLevelsAvailable();

  const kanjiP = lang === 'ja' ? pickKanjiOfTheHour(level) : Promise.resolve(null);
  const weatherP = lang === 'ja' ? fetchSlemanWeather() : Promise.resolve(null);
  const [kanjiDetail, weather] = await Promise.all([kanjiP, weatherP]);

  let routeCard: RouteCard | null = null;
  try {
    if (map?.next) {
      const segSteps = map.steps.filter((s) => s.step.segment === map.next!.step.segment);
      routeCard = {
        order: map.next.step.order,
        title: map.next.step.title_id,
        segDone: segSteps.filter((s) => s.state === 'passed').length,
        segTotal: segSteps.length,
        xp: map.xp,
      };
    }
  } catch {
    // rute opsional, home tetap jalan
  }
  return { recent, lang, routeCard, kanjiLevel: level, kanjiDetail, weather, kanjiLevels: levels };
}

async function pickKanjiOfTheHour(level: number): Promise<KanjiDetail | null> {
  const list = await listKanji({ jlpt: level, limit: 300 });
  if (list.length === 0) return null;
  const hour = Math.floor(Date.now() / 3600000);
  let h = 2166136261;
  const s = hour + ':' + level;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % list.length;
  return getKanjiDetail(list[idx].char);
}

async function fetchSlemanWeather(): Promise<WeatherCurrent | null> {
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=' +
      SLEMAN.lat +
      '&longitude=' +
      SLEMAN.lon +
      '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&timezone=auto';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.current as WeatherCurrent) ?? null;
  } catch {
    return null;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = form.get('intent');
  if (intent === 'setKanjiLevel') {
    const lv = Number(form.get('level'));
    await setKanjiWidgetLevel(lv);
    return { ok: true as const };
  }
  return { ok: false as const };
}

const AKSARA_CARDS = [
  { script: 'hiragana', glyph: 'あ', title: 'Hiragana', desc: 'Kana bunyi asli bahasa Jepang' },
  { script: 'katakana', glyph: 'ア', title: 'Katakana', desc: 'Kata serapan & onomatope' },
  { script: 'kanji', glyph: '漢', title: 'Kanji', desc: 'Per level N5-N1 + latihan' },
] as const;

export default function Index() {
  const { recent, lang, routeCard, kanjiLevel, kanjiDetail, weather, kanjiLevels } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  useEffect(() => {
    if (lang !== 'ja') return;
    const id = setInterval(() => revalidator.revalidate(), 3600000);
    return () => clearInterval(id);
  }, [lang, revalidator]);

  return (
    <div className='space-y-5'>
      <QuickTranslate />

      {lang === 'ja' ? (
        <section className='grid gap-4 sm:grid-cols-2'>
          <KanjiWidget detail={kanjiDetail} level={kanjiLevel} available={kanjiLevels} />
          <WeatherWidget weather={weather} />
        </section>
      ) : null}

      {routeCard ? (
        <Link
          to='/rute'
          prefetch='intent'
          className='card group flex min-w-0 items-center gap-3 border-teal-200 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-500/10 dark:border-teal-900'
        >
          <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-lg font-extrabold text-white'>
            {routeCard.order}
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block text-[11px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-300'>
              Rute N5 · {routeCard.segDone}/{routeCard.segTotal} segmen ini · {routeCard.xp} XP
            </span>
            <span className='block truncate font-semibold'>Lanjutkan Step {routeCard.order}: {routeCard.title}</span>
            <span className='mt-1 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800'>
              <span
                className='block h-full bg-teal-600 dark:bg-teal-500'
                style={{ width: (routeCard.segDone / Math.max(1, routeCard.segTotal)) * 100 + '%' }}
              />
            </span>
          </span>
          <ArrowRight className='h-4 w-4 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5' />
        </Link>
      ) : null}

      <div className='grid gap-5 lg:grid-cols-5 lg:items-start'>
        <div className='min-w-0 space-y-5 lg:col-span-3'>
          {lang === 'ja' ? (
            <section className='space-y-2'>
              <p className='label px-1'>Aksara Jepang</p>
              <div className='grid grid-cols-3 gap-2'>
                {AKSARA_CARDS.map((c) => (
                  <Link
                    key={c.script}
                    to={'/aksara?script=' + c.script}
                    prefetch='intent'
                    className='card group flex flex-col items-center gap-0.5 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-lg hover:shadow-teal-500/10 dark:hover:border-teal-800'
                  >
                    <span className='text-3xl font-bold leading-none transition-transform group-hover:scale-110'>{c.glyph}</span>
                    <span className='mt-1.5 text-sm font-semibold'>{c.title}</span>
                    <span className='text-[10px] leading-tight text-zinc-500'>{c.desc}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          <Capture />
        </div>
        <div className='hidden lg:col-span-2 lg:block' />
      </div>

      <RecentItems items={recent} />

      <DashboardStats />
    </div>
  );
}

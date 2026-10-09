import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Flame, Target, TrendingUp } from "lucide-react";

type Stats = {
  byStatus: { learning: number; known: number; archived: number; total: number };
  last7: { day: string; total: number }[];
  quiz: { day: string; title: string; total: number; done: number; correct: number; completed: number }[];
  streak: number;
  knownTotal: number;
};

/** Ringkasan perkembangan di dashboard home — versi ringkas dari Statistik Pengaturan
 *  + donut penguasaan & akurasi 7 hari yang belum ada di mana pun.
 *  Data dari /api/stats (cache server 60 dtk). CSS murni, tanpa lib chart. */
export function DashboardStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.byStatus) setStats(d as Stats);
      })
      .catch(() => {});
  }, []);

  if (!stats) {
    return (
      <section aria-label="Perkembangan">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="label">Perkembangan</p>
        </div>
        <div className="card animate-pulse p-4" aria-hidden>
          <div className="flex h-14 items-end gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex-1 rounded-t bg-zinc-100 dark:bg-zinc-800/60" style={{ height: `${25 + ((i * 13) % 50)}%` }} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const { learning, known, total } = stats.byStatus;
  const mastery = total > 0 ? Math.round((known / total) * 100) : 0;
  const maxNew = Math.max(1, ...stats.last7.map((d) => d.total));
  const doneQuiz = stats.quiz.filter((q) => q.completed);
  const accuracy =
    doneQuiz.length > 0
      ? Math.round(
          (doneQuiz.reduce((a, q) => a + q.correct, 0) /
            Math.max(1, doneQuiz.reduce((a, q) => a + q.total, 0))) *
            100,
        )
      : null;

  const tiles = [
    { icon: Flame, tint: "text-amber-500", value: String(stats.streak), label: "hari beruntun" },
    { icon: Target, tint: "text-teal-600 dark:text-teal-400", value: accuracy !== null ? `${accuracy}%` : "—", label: "akurasi 7 hari" },
    { icon: TrendingUp, tint: "text-zinc-400", value: String(known), label: "kata hafal" },
  ];

  return (
    <section aria-label="Perkembangan">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="label">Perkembangan</p>
        <Link to="/review" className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400">
          Latihan →
        </Link>
      </div>

      <div className="card space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl bg-zinc-50 px-2 py-2.5 text-center dark:bg-zinc-800/50">
              <p className="flex items-center justify-center gap-1 text-lg font-bold tabular-nums">
                <t.icon className={`h-4 w-4 ${t.tint}`} />
                {t.value}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{t.label}</p>
            </div>
          ))}
        </div>

        <div className="grid items-center gap-4 md:grid-cols-2">
          <div>
            <p className="label mb-1.5">Kata baru — 7 hari</p>
            <div className="flex h-14 items-end gap-1.5">
              {stats.last7.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-teal-500/80 dark:bg-teal-500/60"
                    style={{ height: `${(d.total / maxNew) * 100}%`, minHeight: d.total ? 4 : 2 }}
                    title={`${d.day}: ${d.total} kata`}
                  />
                  <span className="text-[9px] tabular-nums text-zinc-400">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Donut penguasaan — conic-gradient CSS murni */}
            <div
              className="relative h-16 w-16 shrink-0 rounded-full"
              style={{
                background: `conic-gradient(var(--color-teal-600, #0d9488) 0% ${mastery}%, var(--color-zinc-200, #e4e4e7) ${mastery}% 100%)`,
              }}
              title={`${known} hafal dari ${total} kata`}
            >
              <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-white dark:bg-zinc-900">
                <span className="text-xs font-bold tabular-nums">{mastery}%</span>
              </div>
            </div>
            <div className="min-w-0 text-xs text-zinc-500">
              <p>
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">{known} hafal</span> · {learning}{" "}
                dipelajari
              </p>
              <p className="mt-1">
                {mastery >= 70
                  ? "Mantap — pertahankan streak!"
                  : mastery >= 40
                    ? "Progres oke — gas ke 70%!"
                    : "Fondasi dulu — 1 set sehari cukup."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

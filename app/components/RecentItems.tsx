import { Link } from "react-router";
import { ArrowRight } from "lucide-react";

type Row = {
  id: number;
  text: string;
  type: string;
  register: string;
  meaningId: string | null;
  firstExampleEn: string | null;
};

/** Kumpulan item terakhir yang disimpan — dashboard. */
export function RecentItems({ items }: { items: Row[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">Tersimpan terakhir</h2>
        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
        >
          Semua <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id}>
            <Link
              to={`/library/${r.id}`}
              className="card block transition-colors hover:border-teal-500 dark:hover:border-teal-500"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{r.text}</span>
                <span className="badge shrink-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {r.register}
                </span>
              </div>
              {r.meaningId ? (
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{r.meaningId}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

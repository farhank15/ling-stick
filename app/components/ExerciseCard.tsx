import { useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import { JaText, hasJa } from "~/components/JaText";

export function ExerciseCard({
  front,
  answer,
  distractors,
  kana,
  romaji,
  explain_id,
}: {
  front: string;
  answer: string;
  distractors: string[];
  kana?: string;
  romaji?: string;
  explain_id?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const reading = kana ? (romaji ? `${kana} (${romaji})` : kana) : (romaji || undefined);
  const options = [{ text: answer, correct: true }, ...distractors.map((d) => ({ text: d, correct: false }))];
  return (
    <div className="card space-y-2 p-3.5">
      <div className="jp text-[15px] font-medium leading-relaxed text-zinc-900 dark:text-zinc-50">
        {hasJa(front) ? (
          <JaText text={front} reading={reading} romaji={romaji} className="leading-relaxed" />
        ) : (
          <p className="leading-relaxed">{front}</p>
        )}
      </div>
      {revealed ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {options.map((o, i) => (
              <span key={i} className={`badge gap-1 px-2 py-1 text-[12px] ${o.correct ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                {o.correct ? <Check className="h-3 w-3" /> : null}
                {o.text}
              </span>
            ))}
          </div>
          {explain_id ? <p className="text-[13px] leading-relaxed text-muted">{explain_id}</p> : null}
        </div>
      ) : null}
      <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950" aria-expanded={revealed} onClick={() => setRevealed((v) => !v)}>
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {revealed ? "Sembunyikan jawaban" : "Lihat jawaban"}
      </button>
    </div>
  );
}

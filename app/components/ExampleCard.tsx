import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { JaText, hasJa } from "~/components/JaText";
import { SpeakButton } from "~/components/SpeakButton";

export type Register = "formal" | "kasual" | "anime";

const REG_CLS: Record<Register, string> = {
  formal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  kasual: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  anime: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
const REG_LABEL: Record<Register, string> = {
  formal: "formal",
  kasual: "kasual",
  anime: "anime",
};

export function ExampleCard({
  jp,
  kana,
  romaji,
  arti_id,
  pola_ref,
  register,
}: {
  jp: string;
  kana: string;
  romaji?: string;
  arti_id: string;
  pola_ref?: string;
  register: Register;
}) {
  const [revealed, setRevealed] = useState(false);
  const reading = kana ? (romaji ? `${kana} (${romaji})` : kana) : (romaji || undefined);
  return (
    <div className="card flex gap-3 p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`badge font-bold ${REG_CLS[register]}`}>{REG_LABEL[register]}</span>
          {pola_ref ? <span className="chip px-2 py-0.5 text-[10px]">{pola_ref}</span> : null}
        </div>
        <div className="jp mt-2 font-medium text-zinc-900 dark:text-zinc-50">
          {hasJa(jp) ? (
            <JaText text={jp} reading={reading} romaji={romaji} kanjiClassName="text-teal-700 dark:text-teal-300" className="leading-relaxed" />
          ) : (
            <p className="leading-relaxed">{jp}</p>
          )}
        </div>
        <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950" aria-expanded={revealed} onClick={() => setRevealed((v) => !v)}>
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {revealed ? "Sembunyikan terjemahan" : "Lihat terjemahan"}
        </button>
        {revealed ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{arti_id}</p> : null}
      </div>
      <SpeakButton text={jp} lang="ja-JP" className="h-5 w-5" buttonClassName="mt-0.5 shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-teal-50 hover:text-teal-600 dark:text-zinc-500 dark:hover:bg-teal-950 dark:hover:text-teal-400" />
    </div>
  );
}

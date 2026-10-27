import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

/**
 * StateBlock - blok status reusable (empty / loading / error).
 * Dipakai di halaman rute & lesson buat ganti konten kosong/gagal tanpa
 * duplikasi markup. `action` = tombol di bawah (mis. coba lagi).
 */
export function StateBlock({
  tone,
  title,
  message,
  action,
  className = "",
}: {
  tone: "empty" | "loading" | "error";
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  const map = {
    empty: { Icon: Inbox, cls: "text-zinc-400 dark:text-zinc-500" },
    loading: { Icon: Loader2, cls: "text-teal-500 animate-spin" },
    error: { Icon: AlertTriangle, cls: "text-red-500 dark:text-red-400" },
  } as const;
  const { Icon, cls } = map[tone];
  return (
    <div
      className={`card flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className={`h-8 w-8 ${cls}`} aria-hidden />
      {title ? <p className="font-semibold">{title}</p> : null}
      {message ? <p className="max-w-sm text-sm text-muted">{message}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

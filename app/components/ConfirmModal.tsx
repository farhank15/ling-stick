import { useEffect } from "react";
import { Loader2, Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Modal konfirmasi aksi destruktif (hapus item, bulk delete, dsb). */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Hapus",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={() => !busy && onCancel()}
      role="presentation"
    >
      <div
        className="card w-full max-w-sm space-y-3 p-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>
        <div className="flex gap-2 pt-1">
          <button className="btn-secondary flex-1" type="button" onClick={onCancel} disabled={busy}>
            Batal
          </button>
          <button className="btn-danger flex-1 gap-1.5" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

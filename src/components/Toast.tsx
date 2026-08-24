import { useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import clsx from "clsx";

export type ToastState = { kind: "success" | "error"; message: string };

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  return (
    <div
      className={clsx(
        "animate-fade-in-up mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-card",
        toast.kind === "success"
          ? "border-sage/30 bg-sage/10 text-sage-dark"
          : "border-ember/30 bg-ember/10 text-ember-dark",
      )}
    >
      {toast.kind === "success" ? (
        <CheckCircle2 size={16} />
      ) : (
        <AlertCircle size={16} />
      )}
      {toast.message}
    </div>
  );
}

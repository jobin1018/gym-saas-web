import clsx from "clsx";

type Status = "active" | "past_due" | "expired" | "cancelled";

const STYLES: Record<Status, string> = {
  active: "bg-sage/10 text-sage-dark",
  past_due: "bg-amberflag/15 text-amberflag",
  expired: "bg-ember/10 text-ember-dark",
  cancelled: "bg-line text-muted",
};

const DOT_STYLES: Record<Status, string> = {
  active: "bg-sage",
  past_due: "bg-amberflag",
  expired: "bg-ember",
  cancelled: "bg-muted",
};

const LABELS: Record<Status, string> = {
  active: "Active",
  past_due: "Payment due",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", DOT_STYLES[status])} />
      {LABELS[status]}
    </span>
  );
}

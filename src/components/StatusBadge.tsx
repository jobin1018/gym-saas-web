import clsx from "clsx";

type Status = "active" | "past_due" | "expired" | "cancelled" | "frozen";

const STYLES: Record<Status, string> = {
  active: "bg-sage/10 text-sage-dark",
  past_due: "bg-amberflag/15 text-amberflag",
  expired: "bg-ember/10 text-ember-dark",
  cancelled: "bg-line text-muted",
  // Cool/neutral, deliberately outside the warm warning palette (amber/
  // ember) the other non-active states use — "paused, not a problem" reads
  // as calm, not urgent. sky isn't in the app's custom palette (ink/paper/
  // ember/sage/amberflag/line/muted) but Tailwind's default scale is still
  // available since tailwind.config.js only *extends* colors, never
  // replaces them.
  frozen: "bg-sky-500/10 text-sky-700",
};

const DOT_STYLES: Record<Status, string> = {
  active: "bg-sage",
  past_due: "bg-amberflag",
  expired: "bg-ember",
  cancelled: "bg-muted",
  frozen: "bg-sky-500",
};

const LABELS: Record<Status, string> = {
  active: "Active",
  past_due: "Payment due",
  expired: "Expired",
  cancelled: "Cancelled",
  frozen: "Frozen",
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

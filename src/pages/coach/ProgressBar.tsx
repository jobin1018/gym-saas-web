import clsx from "clsx";

// A bar rather than a ring: the rest of the app (StatCard, StatusBadge) is
// entirely flat/rectangular with no circular elements anywhere, so a bar
// reads as "part of this app" at a glance where an SVG ring would feel
// imported from somewhere else. Judgment call: flagged for review.
export function ProgressBar({
  value,
  max,
  tone = "ember",
  label,
}: {
  value: number;
  max: number;
  tone?: "ember" | "sage";
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">{label}</span>
          <span className="font-medium text-ink">
            {value}/{max}
          </span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-line/70">
        <div
          className={clsx(
            "h-full rounded-full transition-all duration-300",
            tone === "ember" ? "bg-ember" : "bg-sage",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

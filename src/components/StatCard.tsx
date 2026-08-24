import type { ReactNode } from "react";
import clsx from "clsx";

export function StatCard({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "good";
  icon?: ReactNode;
}) {
  return (
    <div className="group rounded-xl2 border border-line/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        {icon && (
          <span
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
              tone === "warn" && "bg-gradient-to-br from-ember/20 to-ember/5 text-ember",
              tone === "good" && "bg-gradient-to-br from-sage/20 to-sage/5 text-sage-dark",
              tone === "default" && "bg-gradient-to-br from-ink/10 to-ink/[0.03] text-ink",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={clsx(
          "mt-3 font-display text-3xl font-semibold tracking-tight",
          tone === "warn" && "text-ember-dark",
          tone === "good" && "text-sage-dark",
        )}
      >
        {value}
      </p>
    </div>
  );
}

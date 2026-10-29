import {
  durationWithBonusLabel,
  formatLongDate,
  formatRupees,
  isBundle,
  monthsLabel,
  type PlanPricing,
} from "../lib/bundlePricing";
import type { DurationEdit } from "../lib/membershipDuration";

// Edit-mode only (MemberFormModal renders it under `mode === "edit"`): the
// member's current membership as read-only text, an editable duration next to
// it, a live preview of the new end date/total, and the payment confirmation.
export function DurationEditSection({
  d,
  currentPlan,
  onConfirmPayments,
  busy,
}: {
  d: DurationEdit;
  currentPlan: PlanPricing | undefined;
  onConfirmPayments: () => void;
  busy: boolean;
}) {
  if (d.loadFailed) {
    return (
      <p className="text-xs text-muted">
        Couldn't load this membership's duration — close and reopen to change it.
      </p>
    );
  }
  if (!d.membership) return null;

  const m = d.membership;
  const o = d.outcome;
  const disabled = !!d.disabledReason;

  return (
    <div className="space-y-3 rounded-lg border border-line/70 p-3">
      <p className="text-xs text-muted">
        Current membership:{" "}
        <span className="font-medium text-ink">
          {currentPlan?.name ?? "—"} ·{" "}
          {durationWithBonusLabel(m.duration_months, m.bonus_months)} · ends{" "}
          {formatLongDate(m.current_period_end)}
          {m.total_price != null && <> · {formatRupees(m.total_price)}</>}
        </span>
      </p>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Duration (months)
        </label>
        <input
          inputMode="numeric"
          value={d.durationInput}
          disabled={disabled}
          onChange={(e) => d.setDurationInput(e.target.value)}
          className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow disabled:bg-paper disabled:text-muted"
        />
        {d.disabledReason && (
          <p className="mt-1 text-xs text-muted">{d.disabledReason}</p>
        )}
        {d.errors.duration && (
          <p className="mt-1 text-xs text-ember-dark">{d.errors.duration}</p>
        )}
      </div>

      {o && (
        <div className="space-y-3">
          {o.requiresTotal && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                New total price (₹)
              </label>
              <input
                inputMode="decimal"
                value={d.totalInput}
                onChange={(e) => d.setTotalInput(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
              <p className="mt-1 text-xs text-muted">
                Suggested: {formatRupees(o.suggestedTotal)}{" "}
                {o.suggestionBasis === "bundle_total"
                  ? "(the bundle's price)"
                  : `(monthly rate × ${d.newDuration} months)`}
                .{" "}
                <button
                  type="button"
                  onClick={() => d.setTotalInput(String(o.suggestedTotal))}
                  className="focus-ring rounded font-medium text-ember-dark underline"
                >
                  Use this
                </button>
              </p>
              {isBundle(currentPlan) && !o.atBundleShape && (
                <p className="mt-1 text-xs text-muted">
                  This is a bundle plan, so its free months reset to 0 at any
                  other duration.
                </p>
              )}
              {d.errors.total && (
                <p className="mt-1 text-xs text-ember-dark">{d.errors.total}</p>
              )}
            </div>
          )}

          <p className="text-xs text-muted">
            New end date:{" "}
            <span className="font-medium text-ink">{formatLongDate(o.newEnd)}</span>
            , new total:{" "}
            <span className="font-medium text-ink">
              {o.newTotal != null ? formatRupees(o.newTotal) : "—"}
            </span>
            {o.atBundleShape && o.newBonus > 0 && (
              <> ({monthsLabel(o.newBonus)} free)</>
            )}
          </p>
        </div>
      )}

      {d.awaitingPaymentsConfirm && (
        <div className="rounded-lg border border-amberflag/30 bg-amberflag/10 p-3 text-sm">
          <p className="text-ink">
            This member already has a payment recorded. Changing the duration
            changes the end date but not the payment. Continue?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmPayments}
              className="focus-ring rounded-lg bg-ember px-3 py-1.5 text-xs font-medium text-white hover:bg-ember-dark disabled:opacity-60"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={() => d.setAwaitingPaymentsConfirm(false)}
              className="focus-ring rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-paper"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

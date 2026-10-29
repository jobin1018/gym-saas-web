import { addMonths } from "../lib/memberWrites";
import {
  durationWithBonusLabel,
  formatLongDate,
  formatRupees,
  isBundle,
  monthsLabel,
  pricingForNewMembership,
  type PlanPricing,
} from "../lib/bundlePricing";

// Shown under the plan picker on both add-member forms (MemberFormModal and
// the WhatsApp magic-link page) when the selected plan is a bundle. Renders
// nothing for an ordinary plan, so those forms look exactly as before.
export function BundleAddSummary({
  plan,
  duration,
  durationValid,
  startDate,
}: {
  plan: PlanPricing | undefined;
  duration: number;
  durationValid: boolean;
  startDate: string;
}) {
  if (!isBundle(plan) || !durationValid) return null;
  const priced = pricingForNewMembership(plan, duration);

  if (priced.atBundleShape) {
    const freeNote = plan.bonus_months > 0 ? ` (${plan.bonus_months} free)` : "";
    return (
      <p className="rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-xs text-sage-dark">
        {monthsLabel(plan.duration_months)}
        {freeNote}, {formatRupees(plan.total_price)}
        {startDate && <>, ends {formatLongDate(addMonths(startDate, duration))}</>}
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-amberflag/30 bg-amberflag/10 px-3 py-2 text-xs text-ink">
      This bundle is{" "}
      {durationWithBonusLabel(plan.duration_months, plan.bonus_months)} for{" "}
      {formatRupees(plan.total_price)}. At {monthsLabel(duration)} the price
      changes: monthly rate {formatRupees(plan.amount)} × {duration} ={" "}
      <span className="font-medium">{formatRupees(priced.total)}</span>, and
      the free months don't apply.
    </p>
  );
}

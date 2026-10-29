import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Shared bundle-plan logic for the add-member forms (MemberFormModal and the
// WhatsApp magic-link page) and the plan/detail/import screens. A plan with
// total_price is a BUNDLE: a fixed total for a fixed duration, with
// bonus_months free months INSIDE that duration ("6 months, 3 free" = 6 months
// of membership, 3 paid + 3 free). membership_plans.amount stays the monthly
// rate for every plan; for a bundle the database derives it from
// total_price / duration_months.

export type PlanPricing = {
  id: string;
  name: string;
  amount: number;
  duration_months: number | null;
  total_price: number | null;
  bonus_months: number;
  active?: boolean;
};

export const PLAN_PRICING_COLUMNS =
  "id, name, amount, duration_months, total_price, bonus_months, active";

export const TOTAL_PRICE_MAX = 99_999_999.99;

export function isBundle(
  plan: PlanPricing | null | undefined,
): plan is PlanPricing & { total_price: number; duration_months: number } {
  return !!plan && plan.total_price != null && plan.duration_months != null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatRupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function formatLongDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function monthsLabel(n: number): string {
  return `${n} ${n === 1 ? "month" : "months"}`;
}

// "6 months (3 + 3 free)" — the duration split into paid + free months.
// bonus 0 collapses to the plain "6 months".
export function durationWithBonusLabel(duration: number, bonus: number): string {
  return bonus > 0
    ? `${monthsLabel(duration)} (${duration - bonus} + ${bonus} free)`
    : monthsLabel(duration);
}

// Plans page list row: "6 months (3 + 3 free), ₹4,500".
export function bundleListLabel(plan: {
  duration_months: number;
  total_price: number;
  bonus_months: number;
}): string {
  return `${durationWithBonusLabel(plan.duration_months, plan.bonus_months)}, ${formatRupees(plan.total_price)}`;
}

export function derivedMonthlyRate(total: number, duration: number): number {
  return round2(total / duration);
}

// Dropdown text for a plan in the add-member forms. Ordinary plans keep the
// exact label they always had.
export function planOptionLabel(
  plan: { name: string; amount: number },
  pricing: PlanPricing | undefined,
): string {
  return isBundle(pricing)
    ? `${plan.name} — ${bundleListLabel(pricing)}`
    : `${plan.name} — ₹${plan.amount.toLocaleString("en-IN")}/mo`;
}

// What the add forms should show in the duration box after the plan changes.
// Selecting a bundle prefills the bundle's own duration — the database can't
// tell an omitted duration from the default 1, so the client has to send it.
// Moving off a bundle back to an ordinary plan undoes that prefill only if
// the duration is still the bundle's own (i.e. staff hadn't typed their own).
export function durationAfterPlanChange(
  prev: PlanPricing | undefined,
  next: PlanPricing | undefined,
  current: string,
): string {
  if (isBundle(next)) return String(next.duration_months);
  if (isBundle(prev) && current === String(prev.duration_months)) return "1";
  return current;
}

export type AddPricing = {
  atBundleShape: boolean;
  total: number;
  bonusMonths: number;
};

// What a new membership on `plan` at `duration` will be priced at, mirroring
// trg_memberships_derive_total_price: a bundle at its own duration takes the
// fixed total and its free months; anything else is rate x duration, no bonus.
export function pricingForNewMembership(
  plan: PlanPricing,
  duration: number,
): AddPricing {
  if (isBundle(plan) && duration === plan.duration_months) {
    return {
      atBundleShape: true,
      total: plan.total_price,
      bonusMonths: plan.bonus_months,
    };
  }
  return {
    atBundleShape: false,
    total: round2(plan.amount * duration),
    bonusMonths: 0,
  };
}

export async function fetchPlanPricing(): Promise<PlanPricing[]> {
  const { data, error } = await supabase
    .from("membership_plans")
    .select(PLAN_PRICING_COLUMNS);
  if (error || !data) return [];
  return data as PlanPricing[];
}

// Bundle-aware plan details keyed by id. Loaded separately from the `plans`
// prop MemberFormModal receives (Members.tsx / MemberDetail only select
// id, name, amount) so the modal doesn't depend on those pages' queries.
export function usePlanPricing(): Map<string, PlanPricing> {
  const [pricing, setPricing] = useState<Map<string, PlanPricing>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchPlanPricing().then((rows) => {
      if (!cancelled) setPricing(new Map(rows.map((p) => [p.id, p])));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return pricing;
}

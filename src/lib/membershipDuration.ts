import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { getCurrentClaims } from "./authSession";
import { addMonths } from "./memberWrites";
import { totalFromHint } from "./durationErrors";
import {
  TOTAL_PRICE_MAX,
  isBundle,
  round2,
  type PlanPricing,
} from "./bundlePricing";

// Edit-mode duration correction for MemberFormModal. Everything lives here
// (not in the modal) so the production modal only wires it in:
//   - reads the member's current membership itself (the modal's `initial`
//     doesn't carry duration/total/end date),
//   - works out the same pricing outcome update_membership_duration() will,
//     so the preview and the "total required" field match the server,
//   - calls the RPC. NEVER through the offline queue: a correction computed
//     against a stale membership must not replay later.

export type DurationRpcResult = {
  membership_id: string;
  duration_months: number;
  current_period_end: string;
  total_price: number;
  status: string;
  has_payments: boolean;
  bonus_months: number;
};

export type MembershipSnapshot = {
  id: string;
  plan_id: string;
  status: string;
  start_date: string;
  current_period_end: string;
  duration_months: number;
  total_price: number | null;
  bonus_months: number;
};

export {
  DURATION_ERROR_MESSAGES,
  durationErrorCode,
  totalFromHint,
} from "./durationErrors";

export type DurationEditArgs = {
  enabled: boolean;
  membershipId: string;
  initialStatus: string;
  // The plan the membership will be on once any plan change in the same save
  // lands (the RPC reads memberships.plan_id after that first save).
  plan: PlanPricing | undefined;
};

export function useMembershipDurationEdit({
  enabled,
  membershipId,
  initialStatus,
  plan,
}: DurationEditArgs) {
  const [membership, setMembership] = useState<MembershipSnapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  // Only knowable for owners: payments' RLS is owner-only, so front desk
  // always reads "no rows". null = unknown.
  const [hasPayments, setHasPayments] = useState<boolean | null>(null);
  const [durationInput, setDurationInput] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [serverRequiresTotal, setServerRequiresTotal] = useState(false);
  const [hintTotal, setHintTotal] = useState<number | null>(null);
  const [errors, setErrors] = useState<{ duration?: string; total?: string }>({});
  const [paymentsConfirmed, setPaymentsConfirmed] = useState(false);
  const [awaitingPaymentsConfirm, setAwaitingPaymentsConfirm] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select(
          "id, plan_id, status, start_date, current_period_end, duration_months, total_price, bonus_months",
        )
        .eq("id", membershipId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoadFailed(true);
        return;
      }
      const m = data as MembershipSnapshot;
      setMembership(m);
      setDurationInput(String(m.duration_months));
      setTotalInput(m.total_price != null ? String(m.total_price) : "");

      try {
        const claims = await getCurrentClaims();
        if (cancelled) return;
        setIsOwner(claims.role === "owner");
        if (claims.role === "owner") {
          const { data: paid } = await supabase
            .from("payments")
            .select("id")
            .eq("membership_id", membershipId)
            .in("status", ["success", "manual"])
            .limit(1);
          if (!cancelled) setHasPayments((paid?.length ?? 0) > 0);
        }
      } catch {
        // Unknown stays unknown — the post-save notice covers it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, membershipId]);

  const status = membership?.status ?? initialStatus;
  const disabledReason =
    status === "frozen"
      ? "Unfreeze first"
      : status === "cancelled"
        ? "Membership is cancelled"
        : null;

  const newDuration = Number(durationInput);
  const durationValid =
    durationInput.trim() !== "" &&
    Number.isInteger(newDuration) &&
    newDuration >= 1 &&
    newDuration <= 36;
  const changed =
    !!membership && durationValid && newDuration !== membership.duration_months;

  // Mirrors update_membership_duration(): at a bundle's own duration the total
  // and bonus snap to the plan's; on a bundle at any other duration, or when
  // the stored total isn't plan rate x current duration (negotiated/custom),
  // the total must be stated.
  let outcome: {
    newEnd: string;
    atBundleShape: boolean;
    requiresTotal: boolean;
    suggestedTotal: number;
    // What the suggestion is based on, for the hint under the total field.
    suggestionBasis: "monthly_rate" | "bundle_total";
    newTotal: number | null;
    newBonus: number;
  } | null = null;
  const enteredTotal = Number(totalInput);
  const totalValid =
    totalInput.trim() !== "" &&
    !Number.isNaN(enteredTotal) &&
    enteredTotal >= 0 &&
    enteredTotal <= TOTAL_PRICE_MAX;
  if (membership && plan && changed) {
    const atBundleShape = isBundle(plan) && newDuration === plan.duration_months;
    // The server applies this "derivable stored total" check even when the new
    // duration IS the bundle's own: a bundle membership whose total was since
    // overridden (e.g. 2400 after an earlier correction) can't snap back to
    // the bundle total without the total being stated.
    const storedDerivable =
      membership.total_price != null &&
      (round2(membership.total_price) ===
        round2(plan.amount * membership.duration_months) ||
        (isBundle(plan) &&
          membership.duration_months === plan.duration_months &&
          round2(membership.total_price) === round2(plan.total_price)));
    const requiresTotal =
      (isBundle(plan) && !atBundleShape) || !storedDerivable || serverRequiresTotal;
    const suggestedTotal = atBundleShape
      ? (plan as PlanPricing & { total_price: number }).total_price
      : (hintTotal ?? round2(plan.amount * newDuration));
    outcome = {
      newEnd: addMonths(membership.start_date, newDuration),
      atBundleShape,
      requiresTotal,
      suggestedTotal,
      suggestionBasis: atBundleShape ? "bundle_total" : "monthly_rate",
      newTotal: requiresTotal
        ? totalValid
          ? enteredTotal
          : null
        : suggestedTotal,
      newBonus: atBundleShape ? plan.bonus_months : 0,
    };
  }

  function validate(): boolean {
    const next: { duration?: string; total?: string } = {};
    if (!durationValid) {
      next.duration = "Enter a whole number of months between 1 and 36";
    } else if (outcome?.requiresTotal && !totalValid) {
      next.total = `Enter the new total price (₹0 – ₹${TOTAL_PRICE_MAX.toLocaleString("en-IN")})`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // One RPC call, never queued. Throws the PostgREST error on failure.
  async function apply(): Promise<DurationRpcResult> {
    const { data, error } = await supabase.rpc("update_membership_duration", {
      p_membership_id: membershipId,
      p_duration_months: newDuration,
      ...(outcome?.requiresTotal ? { p_total_price: enteredTotal } : {}),
    });
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) as DurationRpcResult;
  }

  // The server disagreed with our guess (e.g. the stored total changed
  // underneath us): reveal the total field with the server's suggestion.
  function onTotalRequiredByServer(err: unknown) {
    setServerRequiresTotal(true);
    const hint = totalFromHint(err);
    if (hint != null) setHintTotal(hint);
  }

  return {
    loaded: !!membership,
    loadFailed,
    membership,
    isOwner,
    hasPayments,
    disabledReason,
    durationInput,
    setDurationInput,
    totalInput,
    setTotalInput,
    newDuration,
    durationValid,
    changed,
    outcome,
    errors,
    validate,
    apply,
    onTotalRequiredByServer,
    // Owners are asked before the save (they can read payments); front desk
    // can't, so for them has_payments is only known from the RPC result.
    needsPaymentsConfirm: changed && hasPayments === true && !paymentsConfirmed,
    awaitingPaymentsConfirm,
    setAwaitingPaymentsConfirm,
    confirmPayments: () => {
      setPaymentsConfirmed(true);
      setAwaitingPaymentsConfirm(false);
    },
  };
}

export type DurationEdit = ReturnType<typeof useMembershipDurationEdit>;

import { supabase } from "./supabase";
import { getCurrentClaims } from "./authSession";

// Bundle fields, only ever sent together. A bundle (total_price set) is stored
// as duration_months + total_price + bonus_months and NO amount: the
// trg_membership_plans_derive_amount trigger sets amount = total_price /
// duration_months, overwriting anything sent. An ordinary plan sends amount
// (the monthly rate) and may also carry a default duration.
export type PlanBundleFields = {
  duration_months: number | null;
  total_price: number | null;
  bonus_months: number;
};

export type NewPlanPayload = {
  name: string;
  // Omitted for a bundle — the database derives it.
  amount?: number;
  bundle?: PlanBundleFields;
};

export type EditPlanPayload = {
  id: string;
  name: string;
  amount?: number;
  // Omitted => the plan's duration/total/bonus columns are left untouched
  // (the pre-bundle update, exactly as before).
  bundle?: PlanBundleFields;
};

// membership_plans_amount_sane: CHECK (amount >= 0 AND amount <= 1000000).
// Mirrored here so the form can reject before round-tripping to Postgres.
export const PLAN_AMOUNT_MIN = 0;
export const PLAN_AMOUNT_MAX = 1_000_000;

export async function createPlan(payload: NewPlanPayload): Promise<void> {
  const claims = await getCurrentClaims();
  const { error } = await supabase.from("membership_plans").insert({
    organization_id: claims.organizationId,
    name: payload.name,
    ...(payload.amount != null ? { amount: payload.amount } : {}),
    ...(payload.bundle ?? {}),
    active: true,
  });
  if (error) throw error;
}

export async function updatePlan(payload: EditPlanPayload): Promise<void> {
  const { error } = await supabase
    .from("membership_plans")
    .update({
      name: payload.name,
      ...(payload.amount != null ? { amount: payload.amount } : {}),
      ...(payload.bundle ?? {}),
    })
    .eq("id", payload.id);
  if (error) throw error;
}

// Soft delete only — membership_plans has no DELETE grant for authenticated
// (by design: existing memberships FK to plan_id, a hard delete would orphan
// them). Setting active=false just hides it from new-signup pickers; a
// member already on a deactivated plan is unaffected.
export async function setPlanActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("membership_plans")
    .update({ active })
    .eq("id", id);
  if (error) throw error;
}

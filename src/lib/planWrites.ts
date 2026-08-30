import { supabase } from "./supabase";
import { getCurrentClaims } from "./authSession";

export type NewPlanPayload = {
  name: string;
  amount: number;
};

export type EditPlanPayload = {
  id: string;
  name: string;
  amount: number;
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
    amount: payload.amount,
    active: true,
  });
  if (error) throw error;
}

export async function updatePlan(payload: EditPlanPayload): Promise<void> {
  const { error } = await supabase
    .from("membership_plans")
    .update({ name: payload.name, amount: payload.amount })
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

import { supabase } from "./supabase";

// ============================================================================
// Field names verified directly against the deployed function bodies
// (pg_get_functiondef), not assumed from the task's paraphrase — two real
// differences from that paraphrase, both reflected below:
//   freeze_membership   returns `freeze_id`, not `id`.
//   unfreeze_membership returns `freeze_id` (not `id`), `reactivated_at`
//     (not `unfrozen_at`), `days_frozen` (not `days_credited`), and
//     `current_period_end` (not `new_current_period_end`).
// ============================================================================

export class MembershipFreezeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MembershipFreezeError";
    this.code = code;
  }
}

const FREEZE_MESSAGES: Record<string, string> = {
  membership_not_found: "Couldn't find that membership.",
  membership_already_frozen: "This membership is already frozen.",
  membership_past_due: "This membership has a payment due — clear that before freezing it.",
  membership_expired: "This membership has already expired — nothing to freeze.",
  membership_cancelled: "This membership is cancelled — nothing to freeze.",
  membership_not_active: "Only an active membership can be frozen.",
  days_invalid: "Enter a number of days between 1 and 365.",
  not_authorized: "You don't have permission to freeze this membership.",
  organization_suspended: "This gym's subscription is on hold — contact support to restore access.",
};

const UNFREEZE_MESSAGES: Record<string, string> = {
  membership_not_found: "Couldn't find that membership.",
  membership_not_frozen: "This membership isn't currently frozen.",
  not_authorized: "You don't have permission to unfreeze this membership.",
  organization_suspended: "This gym's subscription is on hold — contact support to restore access.",
};

function classify(err: unknown, messages: Record<string, string>): never {
  const code = String((err as { message?: string })?.message ?? "");
  throw new MembershipFreezeError(code, messages[code] ?? "Something went wrong — please try again.");
}

export type FreezeResult = {
  freezeId: string;
  membershipId: string;
  frozenFrom: string;
  frozenUntil: string;
  days: number;
  status: "frozen";
};

export async function freezeMembership(
  membershipId: string,
  days: number,
  reason: string,
): Promise<FreezeResult> {
  const { data, error } = await supabase
    .rpc("freeze_membership", {
      p_membership_id: membershipId,
      p_days: days,
      p_reason: reason.trim() || null,
    })
    .single();

  if (error) classify(error, FREEZE_MESSAGES);

  const row = data as {
    freeze_id: string;
    membership_id: string;
    frozen_from: string;
    frozen_until: string;
    days: number;
    status: "frozen";
  };
  return {
    freezeId: row.freeze_id,
    membershipId: row.membership_id,
    frozenFrom: row.frozen_from,
    frozenUntil: row.frozen_until,
    days: row.days,
    status: row.status,
  };
}

export type UnfreezeResult = {
  freezeId: string;
  membershipId: string;
  reactivatedAt: string;
  daysCredited: number;
  newCurrentPeriodEnd: string;
  status: "active";
};

export async function unfreezeMembership(membershipId: string): Promise<UnfreezeResult> {
  const { data, error } = await supabase
    .rpc("unfreeze_membership", { p_membership_id: membershipId })
    .single();

  if (error) classify(error, UNFREEZE_MESSAGES);

  const row = data as {
    freeze_id: string;
    membership_id: string;
    reactivated_at: string;
    days_frozen: number;
    current_period_end: string;
    status: "active";
  };
  return {
    freezeId: row.freeze_id,
    membershipId: row.membership_id,
    reactivatedAt: row.reactivated_at,
    daysCredited: row.days_frozen,
    newCurrentPeriodEnd: row.current_period_end,
    status: row.status,
  };
}

export type MembershipFreezeRow = {
  id: string;
  membership_id: string;
  frozen_from: string;
  frozen_until: string;
  days: number;
  reason: string | null;
  created_at: string;
  reactivated_at: string | null;
};

// The governing freeze for a currently-frozen membership — "most recent by
// created_at", matching unfreeze_membership's own selection rule exactly,
// per the task's specified query shape.
export async function getGoverningFreeze(
  membershipId: string,
): Promise<MembershipFreezeRow | null> {
  const { data, error } = await supabase
    .from("membership_freezes")
    .select("*")
    .eq("membership_id", membershipId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

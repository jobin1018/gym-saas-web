import { supabase } from "./supabase";
import type { PaymentMethod } from "./paymentRules";

// Manual (desk) payments. Every call here is a single RPC and is NEVER queued
// offline: a payment is money, and replaying one later against a membership
// whose end date has since moved would record a second payment (the server's
// idempotency key is the period end at call time).

export type RecordPaymentInput = {
  // Exactly one of these (the server answers subject_invalid otherwise).
  membershipId?: string;
  ptPackageId?: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  receivedAt: string; // YYYY-MM-DD
  note?: string;
};

export type RecordPaymentResult = {
  payment_id: string;
  membership_id: string | null;
  pt_package_id: string | null;
  amount: number;
  payment_method: string;
  received_at: string;
  covers_from: string | null;
  covers_to: string | null;
  current_period_end: string | null;
  status: string;
  voided_pending: number;
};

export async function recordManualPayment(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  // Named parameters: record_manual_payment's first three params default to
  // NULL so a PT call can omit p_membership_id; positional order isn't relied on.
  const { data, error } = await supabase.rpc("record_manual_payment", {
    ...(input.membershipId ? { p_membership_id: input.membershipId } : {}),
    ...(input.ptPackageId ? { p_pt_package_id: input.ptPackageId } : {}),
    p_amount: input.amount,
    p_method: input.method,
    p_received_at: input.receivedAt,
    ...(input.reference?.trim() ? { p_reference: input.reference.trim() } : {}),
    ...(input.note?.trim() ? { p_note: input.note.trim() } : {}),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as RecordPaymentResult;
}

export type VoidPaymentResult = {
  payment_id: string;
  membership_id: string | null;
  pt_package_id: string | null;
  status: string;
  previous_period_end: string | null;
  current_period_end: string | null;
  can_restore_with_update_duration: boolean;
  restore_duration_months: number | null;
  advice: string;
};

export async function voidPayment(
  paymentId: string,
  reason: string,
): Promise<VoidPaymentResult> {
  const { data, error } = await supabase.rpc("void_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as VoidPaymentResult;
}

// Paid/unpaid for a PT package. Owner and front_desk only: the view scopes
// itself (owner org-wide, front_desk own location, coach nothing), so a coach
// — or a package outside the caller's scope — comes back as null = unknown,
// and the UI shows no badge at all.
export async function fetchPtPackagePaid(
  ptPackageId: string,
): Promise<boolean | null> {
  const { data } = await supabase
    .from("v_pt_package_payment_status")
    .select("is_paid")
    .eq("pt_package_id", ptPackageId)
    .maybeSingle();
  return data ? Boolean(data.is_paid) : null;
}

import { supabase } from "./supabase";

// A dedicated file rather than adding to memberWrites.ts — that file backs
// Members.tsx/MemberFormModal.tsx (both under the standing "additive only,
// stop if any risk of interference" constraint); keeping Member Detail's own
// writes physically separate means touching this file can never risk
// anything in those two.

// Cancel is a plain status flip, same as MemberFormModal's own Status
// <select> already does via updateMemberAndMembership — there is no
// dedicated RPC for it (unlike freeze/unfreeze, which must also manage a
// governing membership_freezes row). Deliberately narrow: only the one
// column, not the broader multi-field write updateMemberAndMembership does.
export async function cancelMembership(membershipId: string): Promise<void> {
  const { error } = await supabase
    .from("memberships")
    .update({ status: "cancelled" })
    .eq("id", membershipId);
  if (error) throw error;
}

export async function updateWhatsappOptIn(
  memberId: string,
  optIn: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("members")
    .update({ whatsapp_opt_in: optIn })
    .eq("id", memberId);
  if (error) throw error;
}

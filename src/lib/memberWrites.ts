import { supabase } from "./supabase";
import { getCurrentClaims, resolveWriteLocationId } from "./authSession";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
const SEND_WELCOME_MESSAGE_URL = `${FUNCTIONS_URL}/send-welcome-message`;

// Fire-and-forget: a new member's welcome WhatsApp is a nice-to-have side
// effect, not part of the member-creation contract. createMember() below
// calls this without awaiting it — the add-member flow completes and shows
// success the moment the real writes (members + memberships) land,
// regardless of whether this succeeds, the org has no WhatsApp opt-in, the
// welcome template isn't approved yet (send-welcome-message no-ops cleanly
// in that case), or the request fails outright. Logged, never surfaced to
// the UI — see the task's own framing of this as debugging-only.
function triggerWelcomeMessage(memberId: string): void {
  supabase.auth.getSession().then(({ data }) => {
    const accessToken = data.session?.access_token;
    if (!accessToken) return;
    fetch(SEND_WELCOME_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ member_id: memberId }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.ok) {
          console.log("[welcome message] not sent:", body.error ?? res.status);
        }
      })
      .catch((err) => {
        console.log("[welcome message] request failed:", err);
      });
  });
}

export type NewMemberPayload = {
  name: string;
  phone: string;
  plan_id: string;
  start_date: string;
  duration_months: number;
  whatsapp_opt_in: boolean;
  // A negotiated total (e.g. a discount off the plan's list rate). Omit to
  // let trg_memberships_derive_total_price snapshot plan.amount *
  // duration_months as usual — see 20260829099000, "pass explicitly to
  // record a negotiated total".
  total_price_override?: number;
};

export type EditMemberPayload = {
  member_id: string;
  membership_id: string;
  name: string;
  phone: string;
  plan_id: string;
  start_date: string;
  // "frozen" is a legitimate value to WRITE here (a real no-op re-affirm of
  // the current status when saving unrelated fields while frozen — see
  // MembershipFreezeSection's header comment), but the plain Status
  // <select> that drives this field never lets a user actually SELECT it —
  // freezing only ever happens through freeze_membership()/that section.
  status: "active" | "past_due" | "expired" | "cancelled" | "frozen";
  whatsapp_opt_in: boolean;
};

export type CsvImportRow = {
  name: string;
  phone: string;
  plan_id: string;
  start_date: string;
  duration_months: number;
};

export type CsvImportPayload = {
  rows: CsvImportRow[];
};

// Add `months` calendar months to a YYYY-MM-DD string, clamping to the end of
// the target month — same semantics as Postgres
// `date + (n || ' months')::interval` and razorpay-webhook's addMonths()
// (2026-01-31 + 1 month -> 2026-02-28). `months` is the MEMBERSHIP's
// duration_months (a free 1..36 entered at signup — see
// 20260829099000_move_duration_to_memberships.sql; it moved here from
// membership_plans, which now only carries a monthly rate).
export function addMonths(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1; // 1..12
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTarget);
  return [
    String(targetYear).padStart(4, "0"),
    String(targetMonth).padStart(2, "0"),
    String(clampedDay).padStart(2, "0"),
  ].join("-");
}

// Two inserts, not one transaction — PostgREST doesn't give the browser a way
// to wrap both in a single transaction. If the member insert succeeds but the
// membership insert then fails, you get an orphaned member with no active
// membership. Acceptable for now (rare, and visible/fixable from Studio) but
// worth knowing about — a real fix would be an RPC/Edge Function doing both
// server-side in one transaction.
export async function createMember(payload: NewMemberPayload): Promise<void> {
  const claims = await getCurrentClaims();
  const organization_id = claims.organizationId;
  const location_id = await resolveWriteLocationId(claims);

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      organization_id,
      location_id,
      name: payload.name,
      phone: payload.phone,
      whatsapp_opt_in: payload.whatsapp_opt_in,
      source: "manual",
    })
    .select("id")
    .single();
  if (memberError) throw memberError;

  // total_price omitted (trigger derives plan.amount * duration_months)
  // unless the front desk negotiated a custom rate — see NewMemberPayload.
  const { error: membershipError } = await supabase.from("memberships").insert({
    organization_id,
    member_id: member.id,
    plan_id: payload.plan_id,
    status: "active",
    start_date: payload.start_date,
    duration_months: payload.duration_months,
    current_period_end: addMonths(payload.start_date, payload.duration_months),
    ...(payload.total_price_override != null
      ? { total_price: payload.total_price_override }
      : {}),
  });
  if (membershipError) throw membershipError;

  triggerWelcomeMessage(member.id);
}

export async function updateMemberAndMembership(
  payload: EditMemberPayload,
): Promise<void> {
  const { error: memberError } = await supabase
    .from("members")
    .update({
      name: payload.name,
      phone: payload.phone,
      whatsapp_opt_in: payload.whatsapp_opt_in,
    })
    .eq("id", payload.member_id);
  if (memberError) throw memberError;

  // Editing start_date here does NOT recompute current_period_end, and
  // changing plan_id does not adjust it either — see the in-form warning.
  // Silently reprorating on every edit would be worse than not doing it.
  const { error: membershipError } = await supabase
    .from("memberships")
    .update({
      plan_id: payload.plan_id,
      status: payload.status,
      start_date: payload.start_date,
    })
    .eq("id", payload.membership_id);
  if (membershipError) throw membershipError;
}

export async function importMembersBatch(
  payload: CsvImportPayload,
): Promise<void> {
  const claims = await getCurrentClaims();
  const organization_id = claims.organizationId;
  const location_id = await resolveWriteLocationId(claims);

  const { data: members, error: membersError } = await supabase
    .from("members")
    .insert(
      payload.rows.map((r) => ({
        organization_id,
        location_id,
        name: r.name,
        phone: r.phone,
        whatsapp_opt_in: true,
        source: "csv_import",
      })),
    )
    .select("id");
  if (membersError) throw membersError;

  const { error: membershipsError } = await supabase.from("memberships").insert(
    members.map((member, i) => ({
      organization_id,
      member_id: member.id,
      plan_id: payload.rows[i].plan_id,
      status: "active" as const,
      start_date: payload.rows[i].start_date,
      duration_months: payload.rows[i].duration_months,
      current_period_end: addMonths(
        payload.rows[i].start_date,
        payload.rows[i].duration_months,
      ),
    })),
  );
  if (membershipsError) throw membershipsError;
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message =
    err instanceof Error ? err.message : String((err as any)?.message ?? "");
  return /failed to fetch|network|load failed|ERR_INTERNET/i.test(message);
}

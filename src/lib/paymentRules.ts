// Pure rules + error mapping for record_manual_payment() / void_payment().
// No supabase import, so paymentRules.test.mjs can pin them with plain
// `node --test` (the repo has no test runner).

export type PaymentMethod = "cash" | "upi" | "card" | "bank_transfer";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
];

export function methodLabel(method: string | null | undefined): string | null {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? null;
}

// The server's CURRENT_DATE is the database's (UTC) date, and it validates
// received_at against it — so the form must use the same date, not the
// browser's local one, or an IST user between 00:00 and 05:30 would be
// rejected for "a future date" by default.
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// received_at must be today or up to 7 days back (server: > today or < today-7
// is received_at_invalid).
export function receivedAtBounds(today: string): { min: string; max: string } {
  return { min: shiftDays(today, -7), max: today };
}

export function receivedAtValid(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { min, max } = receivedAtBounds(today);
  return value >= min && value <= max;
}

// Same calendar-month addition as Postgres `date + n months` (clamps to month
// end); duplicated from memberWrites.addMonths so this file stays dependency-free.
function addMonthsIso(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return [
    String(targetYear).padStart(4, "0"),
    String(targetMonth).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}

// record_manual_payment extends from the LATER of today and the current end
// date (covers_from = GREATEST(CURRENT_DATE, current_period_end)) by the
// membership's own duration.
export function newEndAfterPayment(
  currentPeriodEnd: string,
  durationMonths: number,
  today: string,
): string {
  const from = currentPeriodEnd > today ? currentPeriodEnd : today;
  return addMonthsIso(from, durationMonths);
}

// --------------------------------------------------------------- errors
// RAISE EXCEPTION message = code (PostgREST: { message: "<code>" }).

export const RECORD_PAYMENT_ERRORS: Record<string, string> = {
  not_authorized: "You don't have permission to record payments.",
  organization_suspended:
    "This gym's account is suspended, so payments can't be recorded right now.",
  amount_invalid: "The amount must be greater than zero.",
  method_invalid: "Choose how the payment was received: cash, UPI, card or bank transfer.",
  received_at_invalid:
    "The received date can't be in the future or more than 7 days ago.",
  membership_not_found:
    "This membership couldn't be found — it may have been removed, or belong to another branch. Refresh and try again.",
  membership_frozen:
    "This membership is frozen — unfreeze it first, then record the payment.",
  membership_cancelled:
    "This membership is cancelled, so a payment can't be recorded for it.",
  membership_not_active:
    "The membership's status changed while saving, so nothing was recorded. Refresh and try again.",
  // amount_mismatch is built by recordPaymentErrorMessage() so it can quote
  // the server's expected total.
  amount_mismatch: "The amount doesn't match the total to collect.",
  subject_invalid:
    "Something went wrong — this payment must be for either a membership or a PT package. Refresh and try again.",
  pt_package_not_found:
    "This PT package couldn't be found — it may have been removed, or belong to another branch. Refresh and try again.",
  pt_package_cancelled:
    "This PT package is cancelled, so a payment can't be recorded for it.",
  package_already_paid: "This package is already paid.",
};

export const VOID_PAYMENT_ERRORS: Record<string, string> = {
  not_authorized: "Only the owner can void a payment.",
  organization_suspended:
    "This gym's account is suspended, so payments can't be voided right now.",
  reason_required: "Enter a reason for voiding this payment.",
  payment_not_found:
    "This payment couldn't be found — refresh the page and try again.",
  payment_already_void: "This payment has already been voided.",
  payment_not_voidable:
    "Only payments recorded at the desk can be voided. A card/UPI payment captured through Razorpay has to be refunded in Razorpay.",
};

export function paymentErrorCode(
  err: unknown,
  codes: Record<string, string>,
): string | null {
  const message = String((err as { message?: unknown })?.message ?? "");
  return Object.keys(codes).find((code) => message.includes(code)) ?? null;
}

// amount_mismatch carries the expected total in HINT ("4500" / "4500.00") and
// in DETAIL ("Expected 4500.00, the full total ...").
export function expectedTotalFromError(err: unknown): number | null {
  const hint = String((err as { hint?: unknown })?.hint ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(hint)) return Number(hint);
  const detail = String((err as { details?: unknown })?.details ?? "");
  const match = detail.match(/Expected (\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function formatRupeeAmount(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function recordPaymentErrorMessage(err: unknown): string | null {
  const code = paymentErrorCode(err, RECORD_PAYMENT_ERRORS);
  if (!code) return null;
  if (code === "amount_mismatch") {
    const expected = expectedTotalFromError(err);
    return expected != null
      ? `The amount must be the full total of ${formatRupeeAmount(expected)}. Partial payments aren't supported yet. Refresh the page if the price changed.`
      : RECORD_PAYMENT_ERRORS.amount_mismatch;
  }
  return RECORD_PAYMENT_ERRORS[code];
}

export const SAVE_UNCONFIRMED_MESSAGE =
  "We couldn't confirm this was saved. Check the Transactions page before trying again.";

// What the owner is told after voiding. Mirrors void_payment's returned
// fields: it NEVER changes the membership.
export function voidAdviceMessage(r: {
  membership_id: string | null;
  previous_period_end: string | null;
  can_restore_with_update_duration: boolean;
}): string {
  if (!r.membership_id) {
    return "Payment voided. The package is unpaid again — sessions and notes aren't affected.";
  }
  const before = r.previous_period_end
    ? `Its end date before this payment was ${formatDateIso(r.previous_period_end)}.`
    : "Its end date before this payment couldn't be worked out.";
  return r.can_restore_with_update_duration
    ? `This didn't change the membership. ${before} You can fix it with Edit duration.`
    : `This didn't change the membership. ${before} Edit duration can't restore it because the membership was renewed before — contact support.`;
}

function formatDateIso(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

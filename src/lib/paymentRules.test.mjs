// Run: node --test src/lib/paymentRules.test.mjs (Node 22.18+/24 strips the
// .ts types natively; no dependencies).
import test from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_PAYMENT_ERRORS,
  VOID_PAYMENT_ERRORS,
  expectedTotalFromError,
  newEndAfterPayment,
  paymentErrorCode,
  receivedAtBounds,
  receivedAtValid,
  recordPaymentErrorMessage,
  todayUtc,
  voidAdviceMessage,
} from "./paymentRules.ts";

const RECORD_CODES = [
  "not_authorized", "organization_suspended", "amount_invalid", "method_invalid",
  "received_at_invalid", "membership_not_found", "membership_frozen",
  "membership_cancelled", "membership_not_active", "amount_mismatch",
  "subject_invalid", "pt_package_not_found", "pt_package_cancelled", "package_already_paid",
];
const VOID_CODES = [
  "not_authorized", "organization_suspended", "reason_required",
  "payment_not_found", "payment_already_void", "payment_not_voidable",
];

test("every record_manual_payment code has its own distinct message", () => {
  assert.deepEqual(Object.keys(RECORD_PAYMENT_ERRORS).sort(), [...RECORD_CODES].sort());
  assert.equal(new Set(Object.values(RECORD_PAYMENT_ERRORS)).size, RECORD_CODES.length);
});

test("every void_payment code has its own distinct message", () => {
  assert.deepEqual(Object.keys(VOID_PAYMENT_ERRORS).sort(), [...VOID_CODES].sort());
  assert.equal(new Set(Object.values(VOID_PAYMENT_ERRORS)).size, VOID_CODES.length);
});

test("paymentErrorCode finds each code and returns null otherwise", () => {
  for (const c of RECORD_CODES) assert.equal(paymentErrorCode({ message: c }, RECORD_PAYMENT_ERRORS), c);
  for (const c of VOID_CODES) assert.equal(paymentErrorCode({ message: c }, VOID_PAYMENT_ERRORS), c);
  assert.equal(paymentErrorCode({ message: "boom" }, RECORD_PAYMENT_ERRORS), null);
  assert.equal(paymentErrorCode(null, RECORD_PAYMENT_ERRORS), null);
});

test("amount_mismatch quotes the server's expected total (hint, then detail)", () => {
  assert.equal(expectedTotalFromError({ hint: "4500" }), 4500);
  assert.equal(expectedTotalFromError({ hint: "4500.00" }), 4500);
  assert.equal(expectedTotalFromError({ hint: "", details: "Expected 1200.50, the full total for this membership." }), 1200.5);
  assert.equal(expectedTotalFromError({ hint: "4,500" }), null);
  assert.equal(expectedTotalFromError({}), null);
  assert.match(
    recordPaymentErrorMessage({ message: "amount_mismatch", hint: "4500.00" }),
    /full total of ₹4,500\./,
  );
  // no figure available -> generic wording, still its own message
  assert.equal(
    recordPaymentErrorMessage({ message: "amount_mismatch" }),
    RECORD_PAYMENT_ERRORS.amount_mismatch,
  );
  assert.equal(recordPaymentErrorMessage({ message: "unknown" }), null);
});

test("received date bounds: today and 7 days back, inclusive", () => {
  assert.deepEqual(receivedAtBounds("2026-10-29"), { min: "2026-10-22", max: "2026-10-29" });
  assert.deepEqual(receivedAtBounds("2026-03-03"), { min: "2026-02-24", max: "2026-03-03" });
  assert.equal(receivedAtValid("2026-10-29", "2026-10-29"), true);
  assert.equal(receivedAtValid("2026-10-22", "2026-10-29"), true);
  assert.equal(receivedAtValid("2026-10-21", "2026-10-29"), false); // 8 days back
  assert.equal(receivedAtValid("2026-10-30", "2026-10-29"), false); // future
  assert.equal(receivedAtValid("", "2026-10-29"), false);
});

test("todayUtc follows the server's (UTC) date, not the local one", () => {
  // 00:30 IST on the 30th is still the 29th in UTC.
  assert.equal(todayUtc(new Date("2026-10-30T00:30:00+05:30")), "2026-10-29");
});

test("new end date extends from the later of today and the current end", () => {
  // expired: current end in the past -> from today
  assert.equal(newEndAfterPayment("2026-09-01", 1, "2026-10-29"), "2026-11-29");
  // active, ends in the future -> from the current end
  assert.equal(newEndAfterPayment("2026-11-15", 3, "2026-10-29"), "2027-02-15");
  // ends today -> same either way
  assert.equal(newEndAfterPayment("2026-10-29", 1, "2026-10-29"), "2026-11-29");
  // month-end clamp, as Postgres does
  assert.equal(newEndAfterPayment("2026-01-31", 1, "2026-01-01"), "2026-02-28");
});

test("void advice never claims the membership changed", () => {
  const can = voidAdviceMessage({ membership_id: "m", previous_period_end: "2026-11-29", can_restore_with_update_duration: true });
  assert.match(can, /^This didn't change the membership\./);
  assert.match(can, /29 November 2026/);
  assert.match(can, /Edit duration\./);
  const cannot = voidAdviceMessage({ membership_id: "m", previous_period_end: "2026-11-29", can_restore_with_update_duration: false });
  assert.match(cannot, /renewed before — contact support/);
  assert.match(voidAdviceMessage({ membership_id: null, previous_period_end: null, can_restore_with_update_duration: false }), /package is unpaid again/);
});

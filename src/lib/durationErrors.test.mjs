// Run: node --test src/lib/durationErrors.test.mjs   (Node 22.18+/24 strips the
// .ts types natively; no dependencies). Pins update_membership_duration()'s
// error mapping and the monthly-rate hint parser.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DURATION_ERROR_MESSAGES,
  durationErrorCode,
  totalFromHint,
} from "./durationErrors.ts";

const CODES = [
  "membership_not_found",
  "not_authorized",
  "organization_suspended",
  "duration_invalid",
  "membership_frozen",
  "membership_cancelled",
  "total_required",
  "total_invalid",
];

test("every RPC error code has its own distinct message", () => {
  assert.deepEqual(Object.keys(DURATION_ERROR_MESSAGES).sort(), [...CODES].sort());
  const messages = Object.values(DURATION_ERROR_MESSAGES);
  assert.equal(new Set(messages).size, CODES.length);
  for (const m of messages) assert.ok(m.length > 10);
});

test("durationErrorCode resolves each code, also inside longer text", () => {
  for (const code of CODES) assert.equal(durationErrorCode({ message: code }), code);
  assert.equal(
    durationErrorCode({ message: "error: membership_frozen (P0001)" }),
    "membership_frozen",
  );
});

test("durationErrorCode returns null for unknown / empty input (generic fallback)", () => {
  assert.equal(durationErrorCode({ message: "some other error" }), null);
  assert.equal(durationErrorCode({}), null);
  assert.equal(durationErrorCode(null), null);
  assert.equal(durationErrorCode(undefined), null);
});

test("totalFromHint parses the figures the server really emits", () => {
  // ordinary plan: format('plan rate x %s months = %s') -> numeric prints 3600.00
  assert.equal(totalFromHint({ hint: "plan rate x 3 months = 3600.00" }), 3600);
  // bundle plan wording
  assert.equal(totalFromHint({ hint: "plan monthly rate x 3 months = 2250" }), 2250);
  assert.equal(totalFromHint({ hint: "plan monthly rate x 7 months = 4500.02" }), 4500.02);
  assert.equal(totalFromHint({ hint: "plan monthly rate x 3 months = 2250 " }), 2250);
});

test("totalFromHint falls back to null when the wording drifts", () => {
  for (const hint of [
    "monthly rate times three is about two thousand",
    "suggested total: 2250",
    "plan monthly rate x 3 months = 2,250", // thousands separator
    "plan monthly rate x 3 months = 2250 rupees", // trailing words
    "= 2250 extra words",
    "",
    undefined,
    null,
  ]) {
    assert.equal(totalFromHint({ hint }), null, `hint=${JSON.stringify(hint)}`);
  }
  assert.equal(totalFromHint(null), null);
  assert.equal(totalFromHint(undefined), null);
});

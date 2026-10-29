// Pure error-code/hint helpers for update_membership_duration(), kept free of
// the supabase client so durationErrors.test.mjs can pin them with plain
// `node --test` (no test runner in this repo).

// RAISE EXCEPTION message = code (PostgREST: { message: "<code>" }).
export const DURATION_ERROR_MESSAGES: Record<string, string> = {
  membership_not_found:
    "This membership couldn't be found — it may have been removed, or belong to another branch. Refresh and try again.",
  not_authorized: "You don't have permission to change a membership's duration.",
  organization_suspended:
    "This gym's account is suspended, so changes can't be saved right now.",
  duration_invalid: "Enter a whole number of months between 1 and 36.",
  membership_frozen:
    "This membership is frozen — unfreeze it first, then change the duration.",
  membership_cancelled:
    "This membership is cancelled, so its duration can't be changed.",
  total_required:
    "This change needs an explicit total price — enter the new total below.",
  // Not in the original contract; the RPC raises it for a negative/oversized total.
  total_invalid: "Enter a total price between ₹0 and ₹9,99,99,999.",
};

export function durationErrorCode(err: unknown): string | null {
  const message = String((err as { message?: unknown })?.message ?? "");
  return (
    Object.keys(DURATION_ERROR_MESSAGES).find((code) => message.includes(code)) ??
    null
  );
}

// total_required carries the monthly-rate figure in the error hint, e.g.
// "plan rate x 3 months = 3600.00" (ordinary plan) or "plan monthly rate x 3
// months = 2250" (bundle). Anchored to a trailing plain number: anything else
// (reworded hint, thousands commas, trailing words) returns null and the UI
// falls back to its own rate x months suggestion.
export function totalFromHint(err: unknown): number | null {
  const hint = String((err as { hint?: unknown })?.hint ?? "");
  const match = hint.match(/=\s*(\d+(?:\.\d+)?)\s*$/);
  return match ? Number(match[1]) : null;
}

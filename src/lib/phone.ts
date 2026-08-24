// Canonical stored format matches what's already in the database: "91" + 10
// digits, no "+", no spaces (e.g. existing seed rows like "919999999999").
// The Add/Edit form shows a "+91" prefix chip for readability, but every
// write goes out in this bare form to match the existing convention and
// what the backend expects.

// CSV files come from whatever export format staff already have, so this
// stays lenient — accepts a bare 10-digit number, one prefixed with 91, or
// one prefixed with +91 — and always returns the canonical "91XXXXXXXXXX"
// form, or null if it doesn't look like an Indian mobile number at all.
export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s+-]/g, "");
  if (/^91[6-9]\d{9}$/.test(cleaned)) return cleaned;
  if (/^[6-9]\d{9}$/.test(cleaned)) return `91${cleaned}`;
  return null;
}

// The Add/Edit member form shows a fixed "+91" prefix in the UI, so typing
// a country code there would double it up — this is deliberately strict
// (exactly 10 digits, no 91/+91) and returns a specific error for that case
// rather than silently accepting or silently stripping it.
export function normalizeLocalPhone(
  input: string,
): { value: string; error: null } | { value: null; error: string } {
  const digits = input.trim().replace(/[\s+-]/g, "");
  if (!digits) return { value: null, error: "Phone is required" };
  // Length alone catches a duplicated country code (e.g. typing all 12
  // digits of "919876543210" into this field). Checking for a "91" prefix
  // on top of that was wrong — plenty of legitimate 10-digit numbers start
  // with 9 then 1 (e.g. 9123456789), and that check flagged them as if the
  // country code had been re-typed.
  if (digits.length > 10) {
    return {
      value: null,
      error: "Enter only the 10-digit number — +91 is added automatically",
    };
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    return { value: null, error: "Doesn't look like a valid mobile number" };
  }
  return { value: `91${digits}`, error: null };
}

// For pre-filling the edit form's local-number field from a stored value
// that may or may not already carry a country code (existing data has no
// "+", but this tolerates one anyway).
export function toLocalDigits(phone: string): string {
  const cleaned = phone.trim().replace(/[\s+-]/g, "");
  if (/^91[6-9]\d{9}$/.test(cleaned)) return cleaned.slice(2);
  return cleaned;
}

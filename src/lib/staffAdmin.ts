import { supabase } from "./supabase";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
const STAFF_PIN_RESET_URL = `${FUNCTIONS_URL}/staff-pin-reset`;

export class PinResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinResetError";
  }
}

// Unlike staff-lookup-by-phone/staff-login (pre-login, anon key — see
// Login.tsx), this is called by an ALREADY logged-in owner: the bearer is
// their own session token, which staff-pin-reset re-validates server-side
// (admin.auth.getUser) and re-derives role/org from `users`, not from
// anything this call sends — see the function's own trust-model comment.
export async function resetStaffPin(
  targetUserId: string,
  newPin: string,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new PinResetError("Your session has expired — sign in again.");

  const res = await fetch(STAFF_PIN_RESET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ target_user_id: targetUserId, new_pin: newPin }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    if (body.error === "not_owner") {
      throw new PinResetError("Only an owner can reset staff PINs.");
    }
    if (body.error === "target_not_found") {
      throw new PinResetError("Couldn't find that staff member.");
    }
    if (body.error === "pin_malformed") {
      throw new PinResetError("PIN must be 4 digits.");
    }
    throw new PinResetError("Something went wrong — please try again.");
  }
}

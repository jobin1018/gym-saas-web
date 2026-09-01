import { supabase } from "./supabase";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
const STAFF_PIN_RESET_URL = `${FUNCTIONS_URL}/staff-pin-reset`;
const STAFF_MANAGE_URL = `${FUNCTIONS_URL}/staff-manage`;

export class PinResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinResetError";
  }
}

export class StaffManageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffManageError";
  }
}

async function callStaffManage(body: Record<string, unknown>): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new StaffManageError("Your session has expired — sign in again.");

  const res = await fetch(STAFF_MANAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const resBody = await res.json().catch(() => ({}));

  if (!res.ok || !resBody.ok) {
    const messages: Record<string, string> = {
      not_owner: "Only an owner can manage staff.",
      caller_deactivated: "Your account is no longer active.",
      name_required: "Enter a name.",
      phone_malformed: "Enter a valid phone number.",
      role_invalid: "Choose a role.",
      pin_malformed: "PIN must be 4 digits.",
      owner_has_no_location: "Owners aren't tied to a location.",
      location_id_required: "Select a location for this role.",
      location_not_in_org: "That location doesn't belong to your gym.",
      phone_already_in_org: "A staff member with that phone number already exists.",
      target_not_found: "Couldn't find that staff member.",
      cannot_deactivate_self: "You can't deactivate your own account.",
    };
    throw new StaffManageError(messages[resBody.error] ?? "Something went wrong — please try again.");
  }
  return resBody;
}

export type NewStaffPayload = {
  name: string;
  phone: string;
  role: "owner" | "front_desk" | "coach";
  location_id: string | null;
  pin: string;
};

export async function createStaff(payload: NewStaffPayload): Promise<void> {
  await callStaffManage({ action: "create", ...payload });
}

export async function setStaffActive(targetUserId: string, active: boolean): Promise<void> {
  await callStaffManage({
    action: active ? "reactivate" : "deactivate",
    target_user_id: targetUserId,
  });
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

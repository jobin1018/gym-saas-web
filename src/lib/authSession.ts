import { supabase } from "./supabase";

export type SessionClaims = {
  role: "owner" | "front_desk" | "coach";
  organizationId: string;
  locationId: string | null;
  // public.users.id (distinct from auth.users' own sub/uid) — the RLS
  // identity a coach's own rows are matched against (coach_id, recorded_by,
  // etc.). Owner/front_desk get this too since the hook stamps it
  // unconditionally, but only coach-scoped writes currently need it.
  userId: string;
};

function decodeAccessToken(accessToken: string): Record<string, unknown> | null {
  try {
    const payload = accessToken.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// The backend's custom access-token hook stamps org_id/app_role/location_id
// onto every minted JWT (verified directly against a decoded token), so
// these survive session refresh automatically — no separate client-side
// persistence needed for them, unlike the old placeholder auth's
// localStorage-based "gym_session".
export function claimsFromAccessToken(accessToken: string): SessionClaims | null {
  const decoded = decodeAccessToken(accessToken);
  const orgId = decoded?.org_id;
  const role = decoded?.app_role;
  const userId = decoded?.user_id;
  if (
    typeof orgId !== "string" ||
    typeof userId !== "string" ||
    (role !== "owner" && role !== "front_desk" && role !== "coach")
  ) {
    return null;
  }
  return {
    role,
    organizationId: orgId,
    userId,
    locationId:
      typeof decoded?.location_id === "string" ? decoded.location_id : null,
  };
}

export async function getCurrentClaims(): Promise<SessionClaims> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const claims = token ? claimsFromAccessToken(token) : null;
  if (!claims) throw new Error("No authenticated session");
  return claims;
}

// Owners aren't tied to one location — their JWT carries no location_id —
// but members.location_id is NOT NULL and there's no location-picker UI yet.
// Writes made as an owner default to the org's first location, which is
// correct for the current one-location-per-org seed data; a multi-location
// gym would need a real picker on the Add Member form.
export async function resolveWriteLocationId(
  claims: SessionClaims,
): Promise<string> {
  if (claims.locationId) return claims.locationId;

  const { data, error } = await supabase
    .from("locations")
    .select("id")
    .eq("organization_id", claims.organizationId)
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("Could not resolve a location for this organization");
  }
  return data.id;
}

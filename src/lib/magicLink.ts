const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
const VALIDATE_MAGIC_LINK_URL = `${FUNCTIONS_URL}/validate-magic-link`;

export type MagicLinkErrorCode =
  | "token_malformed"
  | "invalid_token"
  | "link_expired"
  | "link_already_used"
  | "coach_unavailable"
  | "session_provisioning_failed"
  | "network";

export class MagicLinkError extends Error {
  code: MagicLinkErrorCode;
  constructor(code: MagicLinkErrorCode, message: string) {
    super(message);
    this.name = "MagicLinkError";
    this.code = code;
  }
}

export type RedeemedSession = {
  access_token: string;
  refresh_token: string;
  name: string;
};

// Pre-session, same as staff-lookup-by-phone/staff-login (Login.tsx) — the
// anon key gets through the gateway, the token itself is the real
// credential. Single-use server-side (the claim happens before this ever
// returns) — this function must be called at most once per token; the
// caller (CoachQuickLog) is responsible for not retrying on a 410.
export async function redeemMagicLink(token: string): Promise<RedeemedSession> {
  let res: Response;
  try {
    res = await fetch(VALIDATE_MAGIC_LINK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new MagicLinkError("network", "Couldn't reach the server — check your connection.");
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    const code: MagicLinkErrorCode = (
      [
        "token_malformed",
        "invalid_token",
        "link_expired",
        "link_already_used",
        "coach_unavailable",
        "session_provisioning_failed",
      ] as const
    ).includes(body.error)
      ? body.error
      : "session_provisioning_failed";

    const messages: Record<MagicLinkErrorCode, string> = {
      token_malformed: "This link isn't valid — text SESSION again on WhatsApp for a new one.",
      invalid_token: "This link isn't valid — text SESSION again on WhatsApp for a new one.",
      link_expired: "This link has expired — text SESSION again on WhatsApp for a new one.",
      link_already_used: "This link has already been used — text SESSION again on WhatsApp for a new one.",
      coach_unavailable: "This link is no longer usable for your account — ask the gym for help.",
      session_provisioning_failed: "Something went wrong on our end — text SESSION again on WhatsApp to try once more.",
      network: "Couldn't reach the server — check your connection.",
    };
    throw new MagicLinkError(code, messages[code]);
  }

  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    name: body.name,
  };
}

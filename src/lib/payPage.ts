// Member-facing pay page client. Talks only to the two PUBLIC Edge Functions
// (POST {token}, no JWT) — never to the database or to a Supabase session.

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export type PayPageData = {
  gym_name: string;
  member_first_name: string;
  plan_name: string;
  subject: "membership" | "pt_package";
  amount: number;
  currency: string;
  upi_id: string;
  qr_url: string | null;
  qr_url_expires_in: number;
  options: { upi_qr: boolean; razorpay: boolean };
  claimed_paid: boolean;
  expires_at: string;
};

export type PayPageFailure = "not_found" | "paused" | "rate_limited" | "error";

export class PayPageError extends Error {
  kind: PayPageFailure;
  constructor(kind: PayPageFailure) {
    super(kind);
    this.kind = kind;
  }
}

async function post(fn: string, token: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/${fn}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new PayPageError("error");
  }
  if (res.status === 404) throw new PayPageError("not_found");
  if (res.status === 403) throw new PayPageError("paused");
  if (res.status === 429) throw new PayPageError("rate_limited");
  if (!res.ok) throw new PayPageError("error");
  return (await res.json()) as Record<string, unknown>;
}

// The Edge Function signs the URL against ITS OWN idea of the Supabase URL. In
// local dev that is the Docker-internal http://kong:8000, which a phone or
// browser can't reach. Point a storage signed URL at the public Supabase origin
// this app already talks to; where the origins already match (production) this
// changes nothing.
function reachableQrUrl(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const pub = new URL(import.meta.env.VITE_SUPABASE_URL);
    if (u.origin !== pub.origin && u.pathname.startsWith("/storage/v1/")) {
      return `${pub.origin}${u.pathname}${u.search}`;
    }
  } catch {
    /* leave it as is */
  }
  return raw;
}

export async function getPayPage(token: string): Promise<PayPageData> {
  const d = (await post("get-pay-page", token)) as unknown as PayPageData;
  return { ...d, qr_url: reachableQrUrl(d.qr_url) };
}

export async function claimPaid(token: string): Promise<void> {
  await post("claim-paid", token);
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

// upi://pay deep link. Amount has no thousands separators, max 2 decimals.
export function upiDeepLink(upiId: string, gymName: string, amount: number): string {
  const params = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(gymName)}`,
    `am=${encodeURIComponent(amount.toFixed(2))}`,
    "cu=INR",
  ];
  return `upi://pay?${params.join("&")}`;
}

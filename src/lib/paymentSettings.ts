import { supabase } from "./supabase";

// Settings > Payments data layer: org_payment_settings (owner write, front_desk
// read), the private payment-qr bucket, v_payment_setup_alerts and
// list_pending_payment_claims. Kept apart from the member-write files.

export const QR_BUCKET = "payment-qr";
export const QR_MAX_BYTES = 2 * 1024 * 1024;
// Mirrors org_payment_settings_upi_format in the database.
export const UPI_ID_RE = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$/;

export type PaymentSettings = {
  organization_id: string;
  upi_id: string | null;
  qr_image_path: string | null;
  qr_enabled: boolean;
  razorpay_enabled: boolean;
};

export function upiIdError(value: string): string | null {
  const v = value.trim();
  if (!v) return null; // empty is allowed (clears the saved ID)
  return UPI_ID_RE.test(v)
    ? null
    : "Enter a UPI ID like yourgym@okbank (letters, numbers, . _ - before the @).";
}

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

export type QrFileCheck =
  | { ok: true; ext: "png" | "jpg"; contentType: "image/png" | "image/jpeg" }
  | { ok: false; message: string };

// Storage only checks the declared Content-Type, so also check the real bytes:
// a renamed .pdf must not get through just because the browser said image/png.
export async function checkQrFile(file: File): Promise<QrFileCheck> {
  if (file.size > QR_MAX_BYTES) {
    return { ok: false, message: "That image is over 2 MB. Choose a smaller PNG or JPG." };
  }
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) {
    return { ok: true, ext: "png", contentType: "image/png" };
  }
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return { ok: true, ext: "jpg", contentType: "image/jpeg" };
  }
  return { ok: false, message: "Only PNG or JPG images are accepted." };
}

export async function fetchPaymentSettings(): Promise<PaymentSettings | null> {
  const { data, error } = await supabase
    .from("org_payment_settings")
    .select("organization_id, upi_id, qr_image_path, qr_enabled, razorpay_enabled")
    .maybeSingle();
  if (error) throw error;
  return (data as PaymentSettings | null) ?? null;
}

// Owner/front_desk can read their own org's folder; the link lives 5 minutes.
export async function signedQrUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(QR_BUCKET)
    .createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

export type SaveSettingsInput = {
  organizationId: string;
  upiId: string;
  qrEnabled: boolean;
  razorpayEnabled: boolean;
  existingQrPath: string | null;
  newQr?: { file: File; ext: "png" | "jpg"; contentType: "image/png" | "image/jpeg" };
};

// Upload first, then write the row; if the row write fails the new object is
// removed again, and the old image is only deleted after the row points away
// from it. A failure never leaves settings pointing at a missing file.
export async function savePaymentSettings(
  input: SaveSettingsInput,
): Promise<PaymentSettings> {
  let qrPath = input.existingQrPath;
  let uploaded: string | null = null;

  if (input.newQr) {
    const path = `${input.organizationId}/qr-${Date.now()}.${input.newQr.ext}`;
    const { error } = await supabase.storage
      .from(QR_BUCKET)
      .upload(path, input.newQr.file, {
        contentType: input.newQr.contentType,
        upsert: false,
      });
    if (error) throw error;
    uploaded = path;
    qrPath = path;
  }

  const { data, error } = await supabase
    .from("org_payment_settings")
    .upsert(
      {
        organization_id: input.organizationId,
        upi_id: input.upiId.trim() || null,
        qr_image_path: qrPath,
        qr_enabled: input.qrEnabled,
        razorpay_enabled: input.razorpayEnabled,
      },
      { onConflict: "organization_id" },
    )
    .select("organization_id, upi_id, qr_image_path, qr_enabled, razorpay_enabled")
    .single();

  if (error) {
    if (uploaded) await supabase.storage.from(QR_BUCKET).remove([uploaded]);
    throw error;
  }

  if (uploaded && input.existingQrPath && input.existingQrPath !== uploaded) {
    await supabase.storage.from(QR_BUCKET).remove([input.existingQrPath]);
  }
  return data as PaymentSettings;
}

export function settingsErrorMessage(err: unknown): string {
  const e = err as { message?: string; statusCode?: string | number; code?: string };
  const msg = (e?.message ?? "").toLowerCase();
  if (msg.includes("exceeded the maximum") || msg.includes("too large")) {
    return "That image is over 2 MB. Choose a smaller PNG or JPG.";
  }
  if (msg.includes("mime type") || msg.includes("not supported")) {
    return "Only PNG or JPG images are accepted.";
  }
  if (msg.includes("org_payment_settings_upi_format")) {
    return "That UPI ID isn't in a valid format.";
  }
  if (msg.includes("row-level security") || e?.code === "42501") {
    return "Only the owner can change payment settings.";
  }
  if (msg.includes("organization_suspended")) {
    return "This gym is paused, so settings can't be changed.";
  }
  return "Couldn't save payment settings. Check your connection and try again.";
}

export type PaymentSetupAlert = {
  reason: string;
  skipped_count: number;
  member_count: number;
  last_skipped_at: string;
};

// Owner only; the view scopes itself from the JWT (anyone else gets no rows).
export async function fetchPaymentSetupAlerts(): Promise<PaymentSetupAlert[]> {
  const { data, error } = await supabase
    .from("v_payment_setup_alerts")
    .select("reason, skipped_count, member_count, last_skipped_at");
  if (error) throw error;
  return (data ?? []) as PaymentSetupAlert[];
}

export type PendingClaim = {
  request_id: string;
  claimed_paid_at: string;
  amount: number;
  subject: "membership" | "pt_package";
  membership_id: string | null;
  pt_package_id: string | null;
  member_id: string;
  member_name: string;
  member_phone: string | null;
  plan_name: string;
  location_id: string | null;
};

export async function fetchPendingClaims(): Promise<PendingClaim[]> {
  const { data, error } = await supabase.rpc("list_pending_payment_claims");
  if (error) throw error;
  return ((data ?? []) as PendingClaim[]).map((c) => ({
    ...c,
    amount: Number(c.amount),
  }));
}

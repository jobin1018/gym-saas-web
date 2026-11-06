import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ImageUp } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../contexts/AuthContext";
import {
  QR_MAX_BYTES,
  checkQrFile,
  fetchPaymentSettings,
  savePaymentSettings,
  settingsErrorMessage,
  signedQrUrl,
  upiIdError,
  type PaymentSettings as Settings,
} from "../lib/paymentSettings";
import { PayCard } from "../components/PayCard";
import { Toast, type ToastState } from "../components/Toast";

type Picked = {
  file: File;
  ext: "png" | "jpg";
  contentType: "image/png" | "image/jpeg";
  url: string; // object URL for the local preview
};

function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          "focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-sage" : "bg-line",
        )}
      >
        <span
          className={clsx(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

// Settings > Payments. Owner only (route-guarded in App.tsx; the table's RLS
// is the real gate — front_desk can read it but not write).
export function PaymentSettings() {
  const { claims, organizationName } = useAuth();
  const orgId = claims?.organizationId ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hasRow, setHasRow] = useState(false);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [savedQrUrl, setSavedQrUrl] = useState<string | null>(null);

  const [upiId, setUpiId] = useState("");
  const [qrEnabled, setQrEnabled] = useState(false);
  const [razorpay, setRazorpay] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [fileError, setFileError] = useState("");
  const [upiTouched, setUpiTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saveError, setSaveError] = useState("");
  const pickedRef = useRef<Picked | null>(null);

  function applySaved(s: Settings | null) {
    setSaved(s);
    setHasRow(s !== null);
    setUpiId(s?.upi_id ?? "");
    setQrEnabled(s?.qr_enabled ?? false);
    setRazorpay(s?.razorpay_enabled ?? false);
    setSavedQrUrl(null);
    if (s?.qr_image_path) {
      signedQrUrl(s.qr_image_path).then(setSavedQrUrl);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchPaymentSettings()
      .then((s) => {
        if (!cancelled) applySaved(s);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load payment settings. Reload to try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    };
  }, []);

  function setPickedFile(p: Picked | null) {
    if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    pickedRef.current = p;
    setPicked(p);
  }

  async function onFile(file: File | undefined) {
    setFileError("");
    if (!file) return;
    const check = await checkQrFile(file);
    if (!check.ok) {
      setFileError(check.message);
      setPickedFile(null);
      return;
    }
    setPickedFile({
      file,
      ext: check.ext,
      contentType: check.contentType,
      url: URL.createObjectURL(file),
    });
  }

  const upiError = upiIdError(upiId);
  const upiPresent = upiId.trim().length > 0;
  const hasQr = picked !== null || !!saved?.qr_image_path;
  const incomplete = qrEnabled && (!hasQr || !upiPresent);
  const missing = [!hasQr && "a QR image", !upiPresent && "a UPI ID"].filter(Boolean).join(" and ");

  async function handleSave() {
    setSaveError("");
    setUpiTouched(true);
    if (upiError || fileError) return;
    setSaving(true);
    try {
      const next = await savePaymentSettings({
        organizationId: orgId,
        upiId,
        qrEnabled,
        razorpayEnabled: razorpay,
        existingQrPath: saved?.qr_image_path ?? null,
        newQr: picked ?? undefined,
      });
      setPickedFile(null);
      applySaved(next);
      setToast({ kind: "success", message: "Payment settings saved." });
    } catch (e) {
      setSaveError(settingsErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  const fieldClass =
    "focus-ring min-h-[44px] w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm";

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Payments</h1>
      <p className="mt-1 text-sm text-muted">
        How members pay for a renewal or a PT package. Members get a link to a pay page that
        shows your QR and UPI ID.
      </p>

      {toast && <div className="mt-4"><Toast toast={toast} onDismiss={() => setToast(null)} /></div>}
      {loadError && (
        <p role="alert" className="mt-4 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2.5 text-sm">
          {loadError}
        </p>
      )}

      {!hasRow && !loadError && (
        <p className="mt-4 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-muted">
          No payment settings have been saved yet, so this gym still sends Razorpay payment links
          as before. Saving here switches to the choices below.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section className="space-y-5 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
          <div>
            <label htmlFor="qr-file" className="mb-1 block text-xs font-medium text-muted">
              UPI QR image
            </label>
            <label
              htmlFor="qr-file"
              className="focus-within:ring-2 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-paper px-3 py-3 text-sm hover:bg-white"
            >
              <ImageUp size={18} className="text-muted" />
              <span>
                {picked
                  ? picked.file.name
                  : saved?.qr_image_path
                    ? "QR saved. Choose a file to replace it"
                    : "Choose a PNG or JPG"}
              </span>
              <input
                id="qr-file"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              PNG or JPG, up to {QR_MAX_BYTES / 1024 / 1024} MB. Use the QR from your UPI app or bank.
            </p>
            {fileError && (
              <p role="alert" data-testid="qr-file-error" className="mt-1 text-xs text-ember-dark">
                {fileError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="upi-id" className="mb-1 block text-xs font-medium text-muted">
              UPI ID
            </label>
            <input
              id="upi-id"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              onBlur={() => setUpiTouched(true)}
              placeholder="yourgym@okbank"
              autoCapitalize="none"
              spellCheck={false}
              className={fieldClass}
            />
            {upiTouched && upiError && (
              <p role="alert" data-testid="upi-error" className="mt-1 text-xs text-ember-dark">
                {upiError}
              </p>
            )}
          </div>

          <Toggle
            id="qr-enabled"
            checked={qrEnabled}
            onChange={setQrEnabled}
            label="QR payments"
            hint="Members pay by scanning your QR or using your UPI ID, then tap “I've paid”."
          />

          {incomplete && (
            <div
              role="alert"
              data-testid="qr-incomplete-warning"
              className="flex gap-2 rounded-lg border border-amberflag/40 bg-amberflag/10 px-3 py-2.5 text-sm"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amberflag" />
              <p>
                QR payments are on, but you haven't added {missing}. Until you do, pay links won't
                open for members and renewal reminders won't be sent.
              </p>
            </div>
          )}

          <Toggle
            id="razorpay-enabled"
            checked={razorpay}
            onChange={setRazorpay}
            label="Online payments (coming soon)"
            hint="Razorpay card and net banking links."
          />

          {saveError && (
            <p role="alert" className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2.5 text-sm">
              {saveError}
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !!loadError}
              className="focus-ring min-h-[44px] rounded-lg bg-ember px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-ember-dark disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <p data-testid="razorpay-save-note" className="mt-2 text-xs text-muted">
              Saving turns Razorpay off unless you enable it.
            </p>
          </div>
        </section>

        <aside aria-label="Pay page preview">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            What members see
          </p>
          <div data-testid="pay-preview" className="mx-auto w-full max-w-[390px] rounded-2xl bg-paper p-3 ring-1 ring-line">
            <PayCard
              preview
              gymName={organizationName ?? "Your gym"}
              firstName="Asha"
              planName="Monthly plan"
              amount={1500}
              upiId={upiId.trim()}
              qrUrl={picked?.url ?? savedQrUrl}
              razorpay={razorpay}
              claimed={false}
            />
          </div>
          <p className="mt-2 text-xs text-muted">Sample name, plan and amount. Buttons are off in the preview.</p>
        </aside>
      </div>
    </div>
  );
}

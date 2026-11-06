import { useState } from "react";
import { Check, Copy, ExternalLink, CreditCard } from "lucide-react";
import { formatInr, upiDeepLink } from "../lib/payPage";

// The member-facing payment card. Rendered by the public /pay/:token page and,
// with preview=true, by Settings > Payments so the owner sees what members see.
// Shows only what get-pay-page returns: no phone numbers, no other members.
export function PayCard({
  gymName,
  firstName,
  planName,
  amount,
  upiId,
  qrUrl,
  razorpay,
  claimed,
  claiming,
  claimError,
  onClaim,
  onQrError,
  preview = false,
}: {
  gymName: string;
  firstName: string;
  planName: string;
  amount: number;
  upiId: string;
  qrUrl: string | null;
  razorpay: boolean;
  claimed: boolean;
  claiming?: boolean;
  claimError?: string;
  onClaim?: () => void;
  onQrError?: () => void;
  preview?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
    } catch {
      // Older/insecure contexts: fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = upiId;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing more we can do */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasUpi = upiId.length > 0;

  return (
    <div className="w-full rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
      <p className="text-sm text-muted">{gymName}</p>
      <h2 className="mt-0.5 font-display text-xl font-semibold tracking-tight">
        Hi {firstName}, complete your payment
      </h2>

      <div className="mt-4 flex items-end justify-between gap-3 rounded-lg bg-paper px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Paying for</p>
          <p className="truncate text-sm font-medium">{planName}</p>
        </div>
        <p
          data-testid="pay-amount"
          className="font-display text-2xl font-semibold tracking-tight"
        >
          {formatInr(amount)}
        </p>
      </div>

      <div className="mt-5 flex flex-col items-center">
        <div className="flex aspect-square w-full max-w-[260px] items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-2">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`UPI QR code for ${gymName}`}
              onError={onQrError}
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="px-4 text-center text-sm text-muted">
              {preview ? "Upload a QR image to see it here." : "QR code unavailable. Use the UPI ID below."}
            </p>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Scan with any UPI app to pay {formatInr(amount)}.
        </p>
      </div>

      <div className="mt-5">
        <p className="mb-1 text-xs font-medium text-muted">UPI ID</p>
        <div className="flex items-center gap-2">
          <p
            data-testid="pay-upi-id"
            className="min-h-[44px] flex-1 break-all rounded-lg border border-line bg-paper px-3 py-2.5 text-sm font-medium"
          >
            {hasUpi ? upiId : "—"}
          </p>
          <button
            type="button"
            onClick={copy}
            disabled={!hasUpi}
            className="focus-ring inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium transition-colors hover:bg-paper disabled:opacity-50"
          >
            {copied ? <Check size={16} className="text-sage-dark" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {hasUpi && !preview ? (
        <a
          href={upiDeepLink(upiId, gymName, amount)}
          className="focus-ring mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-ember px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-ember-dark active:scale-[0.98]"
        >
          <ExternalLink size={16} /> Open UPI app
        </a>
      ) : (
        <button
          type="button"
          disabled
          className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-ember px-4 py-3 text-sm font-semibold text-white opacity-60"
        >
          <ExternalLink size={16} /> Open UPI app
        </button>
      )}

      {claimed ? (
        <p
          role="status"
          className="mt-4 rounded-lg border border-sage/30 bg-sage/10 px-3 py-3 text-center text-sm font-medium text-sage-dark"
        >
          Thanks, the gym will confirm shortly
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onClaim}
            disabled={preview || claiming}
            className="focus-ring mt-3 flex min-h-[48px] w-full items-center justify-center rounded-lg border border-ink/20 bg-white px-4 py-3 text-sm font-semibold transition-colors hover:bg-paper disabled:opacity-60"
          >
            {claiming ? "Sending…" : "I've paid"}
          </button>
          {claimError && (
            <p role="alert" className="mt-2 text-center text-sm text-ember-dark">
              {claimError}
            </p>
          )}
          <p className="mt-2 text-center text-xs text-muted">
            Tap after you've paid. The gym checks its account before your membership is updated.
          </p>
        </>
      )}

      {razorpay && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CreditCard size={16} /> Prefer to pay online?
          </p>
          <p className="mt-1 text-xs text-muted">
            This gym also accepts card and net banking. Ask the gym for the online payment link.
          </p>
        </div>
      )}
    </div>
  );
}

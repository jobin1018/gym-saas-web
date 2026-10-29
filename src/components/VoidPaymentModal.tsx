import { useRef, useState } from "react";
import { X } from "lucide-react";
import { voidPayment } from "../lib/manualPayments";
import {
  VOID_PAYMENT_ERRORS,
  formatRupeeAmount,
  paymentErrorCode,
  voidAdviceMessage,
} from "../lib/paymentRules";

// Owner-only. Voiding never touches the membership — after it succeeds the
// modal shows what the owner needs to put the end date right (void_payment's
// own returned fields), and stays open until they dismiss it.
export function VoidPaymentModal({
  paymentId,
  memberName,
  amount,
  onClose,
  onVoided,
}: {
  paymentId: string;
  memberName: string;
  amount: number;
  onClose: () => void;
  // Fired as soon as the void succeeds so the caller can refresh its list.
  onVoided: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function handleVoid() {
    if (inFlight.current) return;
    setError("");
    if (!reason.trim()) {
      setError(VOID_PAYMENT_ERRORS.reason_required);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await voidPayment(paymentId, reason.trim());
      setAdvice(voidAdviceMessage(result));
      onVoided();
    } catch (err) {
      const code = paymentErrorCode(err, VOID_PAYMENT_ERRORS);
      setError(
        code
          ? VOID_PAYMENT_ERRORS[code]
          : "We couldn't confirm this was voided. Check the Transactions page before trying again.",
      );
      if (code === "payment_already_void") onVoided();
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Void payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {advice ? (
          <div className="space-y-4">
            <p role="status" className="rounded-lg border border-line bg-paper px-3 py-3 text-sm">
              {advice}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="focus-ring w-full rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white hover:bg-ember-dark"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">
              Void the {formatRupeeAmount(amount)} payment from{" "}
              <span className="font-medium text-ink">{memberName}</span>? It
              stops counting as revenue. It does <strong>not</strong> change
              the membership's end date.
            </p>
            <label className="mb-1 mt-4 block text-xs font-medium text-muted">
              Reason (required)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
            {error && (
              <p role="alert" className="mt-2 text-xs text-ember-dark">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVoid}
                disabled={submitting}
                className="focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Voiding…" : "Void payment"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

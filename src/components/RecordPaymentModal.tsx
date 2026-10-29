import { useRef, useState } from "react";
import { X } from "lucide-react";
import { recordManualPayment } from "../lib/manualPayments";
import {
  PAYMENT_METHODS,
  SAVE_UNCONFIRMED_MESSAGE,
  formatRupeeAmount,
  newEndAfterPayment,
  paymentErrorCode,
  receivedAtBounds,
  receivedAtValid,
  recordPaymentErrorMessage,
  RECORD_PAYMENT_ERRORS,
  todayUtc,
  type PaymentMethod,
} from "../lib/paymentRules";

export type RecordPaymentSubject =
  | {
      kind: "membership";
      membershipId: string;
      memberName: string;
      planName: string;
      currentEnd: string;
      durationMonths: number;
      total: number;
    }
  | {
      kind: "pt";
      ptPackageId: string;
      memberName: string;
      label: string; // e.g. "PT package · Muscle gain"
      price: number;
    };

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// One modal for membership and PT-package payments. The amount is shown but
// not editable: the server requires it to equal the membership's total (or the
// package's price) exactly — no instalments.
//
// NEVER queued offline and NEVER retried automatically. After a network
// failure the entered values stay put and the button becomes "Try again", but
// only the person pressing it decides — the first request may have landed.
export function RecordPaymentModal({
  subject,
  onClose,
  onRecorded,
  onAlreadyPaid,
}: {
  subject: RecordPaymentSubject;
  onClose: () => void;
  // Called once, with the success message, when the payment is recorded; the
  // caller refreshes its data and shows the message. The modal closes itself.
  onRecorded: (message: string) => void;
  // PT only: package_already_paid means another desk got there first — the
  // caller refreshes its Paid badge.
  onAlreadyPaid?: () => void;
}) {
  const today = todayUtc();
  const bounds = receivedAtBounds(today);
  const amount = subject.kind === "membership" ? subject.total : subject.price;

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(today);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState("");
  const [error, setError] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  // A ref, not just state: a fast double-tap can fire twice before React has
  // re-rendered with the button disabled.
  const inFlight = useRef(false);

  const newEnd =
    subject.kind === "membership"
      ? newEndAfterPayment(subject.currentEnd, subject.durationMonths, today)
      : null;

  async function handleConfirm() {
    if (inFlight.current) return;
    setError("");
    setDateError("");
    if (!receivedAtValid(receivedAt, today)) {
      setDateError(RECORD_PAYMENT_ERRORS.received_at_invalid);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setUnconfirmed(false);
    try {
      const result = await recordManualPayment({
        ...(subject.kind === "membership"
          ? { membershipId: subject.membershipId }
          : { ptPackageId: subject.ptPackageId }),
        amount,
        method,
        reference,
        receivedAt,
        note,
      });
      onRecorded(
        subject.kind === "membership" && result.current_period_end
          ? `Payment recorded. Membership now runs until ${formatDate(result.current_period_end)}.`
          : "Payment recorded.",
      );
      onClose();
    } catch (err) {
      const code = paymentErrorCode(err, RECORD_PAYMENT_ERRORS);
      if (code) {
        // The server definitively refused: nothing was recorded.
        setError(recordPaymentErrorMessage(err) ?? "");
        if (code === "package_already_paid") onAlreadyPaid?.();
      } else {
        // Network failure or anything we can't classify: the request may or
        // may not have landed.
        setUnconfirmed(true);
        setError(SAVE_UNCONFIRMED_MESSAGE);
      }
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  const fieldClass =
    "focus-ring min-h-[44px] w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Record payment
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

        <div className="space-y-1 rounded-lg border border-line/70 bg-paper px-3 py-2.5 text-sm">
          <p className="font-medium">{subject.memberName}</p>
          {subject.kind === "membership" ? (
            <p className="text-xs text-muted">
              {subject.planName} · currently ends {formatDate(subject.currentEnd)}
            </p>
          ) : (
            <p className="text-xs text-muted">{subject.label}</p>
          )}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Amount to collect
            </label>
            <p
              aria-label="Amount to collect"
              className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm font-medium"
            >
              {formatRupeeAmount(amount)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Partial payments aren't supported yet.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Method
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className={fieldClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Reference (optional)
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UPI transaction ID or receipt number"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Received on
            </label>
            <input
              type="date"
              value={receivedAt}
              min={bounds.min}
              max={bounds.max}
              onChange={(e) => setReceivedAt(e.target.value)}
              className={fieldClass}
            />
            {dateError && (
              <p className="mt-1 text-xs text-ember-dark">{dateError}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Note (optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={fieldClass}
            />
          </div>

          {newEnd && (
            <p className="text-sm text-muted">
              New end date:{" "}
              <span className="font-medium text-ink">{formatDate(newEnd)}</span>
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-amberflag/30 bg-amberflag/10 px-3 py-2.5 text-sm text-ink"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="focus-ring min-h-[44px] rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Recording…" : unconfirmed ? "Try again" : "Confirm payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

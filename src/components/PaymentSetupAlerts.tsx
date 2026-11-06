import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import {
  fetchPaymentSetupAlerts,
  type PaymentSetupAlert,
} from "../lib/paymentSettings";

const REASON_TEXT: Record<string, string> = {
  no_payment_method_enabled: "no payment option is turned on",
  qr_enabled_but_incomplete: "QR payments are on but the QR image or UPI ID is missing",
  razorpay_credentials_missing: "online payments are on but not set up",
  pay_page_url_not_configured: "the pay page address isn't configured",
};

// Owner dashboard note: renewal reminders that were NOT sent in the last 7
// days because the gym has no usable way for members to pay. Renders nothing
// when there is nothing to report (or the view can't be read).
export function PaymentSetupAlerts() {
  const [alerts, setAlerts] = useState<PaymentSetupAlert[]>([]);

  useEffect(() => {
    fetchPaymentSetupAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  if (alerts.length === 0) return null;

  const skipped = alerts.reduce((n, a) => n + a.skipped_count, 0);
  const reasons = alerts.map((a) => REASON_TEXT[a.reason] ?? a.reason.replace(/_/g, " "));

  return (
    <div
      role="status"
      data-testid="payment-setup-alert"
      className="mt-4 flex gap-3 rounded-xl border border-amberflag/40 bg-amberflag/10 px-4 py-3 text-sm"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amberflag" />
      <p>
        {skipped} renewal {skipped === 1 ? "reminder was" : "reminders were"} not sent in the
        last 7 days because {reasons.join("; ")}.{" "}
        <Link to="/settings/payments" className="font-medium underline">
          Set up payments
        </Link>
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchPendingClaims, type PendingClaim } from "../lib/paymentSettings";
import { formatRupeeAmount } from "../lib/paymentRules";
import {
  RecordPaymentModal,
  type RecordPaymentSubject,
} from "../components/RecordPaymentModal";
import { Toast, type ToastState } from "../components/Toast";

// "Member says they've paid, nothing recorded yet." A claim never changes a
// membership: staff check their bank/UPI app, then record the payment with the
// existing Record payment modal (method UPI preselected). Once recorded, the
// claim drops out of the list on its own.

type MembershipRow = {
  id: string;
  current_period_end: string;
  duration_months: number;
  total_price: number | null;
  membership_plans: { name: string; amount: number } | null;
};

function claimedAgo(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PaymentClaims() {
  const [claims, setClaims] = useState<PendingClaim[] | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [subject, setSubject] = useState<RecordPaymentSubject | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setClaims(await fetchPendingClaims());
      setError("");
    } catch {
      setError("Couldn't load payment claims. Reload to try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openRecord(c: PendingClaim) {
    setOpening(c.request_id);
    try {
      if (c.subject === "pt_package" && c.pt_package_id) {
        setSubject({
          kind: "pt",
          ptPackageId: c.pt_package_id,
          memberName: c.member_name,
          label: "PT package",
          price: c.amount,
        });
      } else if (c.membership_id) {
        const { data, error: qErr } = await supabase
          .from("memberships")
          .select("id, current_period_end, duration_months, total_price, membership_plans(name, amount)")
          .eq("id", c.membership_id)
          .single();
        if (qErr || !data) throw qErr ?? new Error("not found");
        const ms = data as unknown as MembershipRow;
        setSubject({
          kind: "membership",
          membershipId: ms.id,
          memberName: c.member_name,
          planName: ms.membership_plans?.name ?? c.plan_name,
          currentEnd: ms.current_period_end,
          durationMonths: ms.duration_months,
          // Same fallback as Member Detail; the server is the arbiter.
          total: ms.total_price ?? (ms.membership_plans?.amount ?? 0) * ms.duration_months,
        });
      }
    } catch {
      setToast({ kind: "error", message: "Couldn't open that payment. Try again." });
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Payment claims</h1>
      <p className="mt-1 text-sm text-muted">
        Members who tapped “I've paid” on their pay page. Check your UPI app or bank first, then
        record the payment. Nothing changes on a membership until you do.
      </p>

      {toast && <div className="mt-4"><Toast toast={toast} onDismiss={() => setToast(null)} /></div>}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2.5 text-sm">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        {claims === null && !error ? (
          <p className="p-5 text-sm text-muted">Loading…</p>
        ) : claims && claims.length === 0 ? (
          <p data-testid="claims-empty" className="p-5 text-sm text-muted">
            No payments waiting to be confirmed.
          </p>
        ) : (
          <ul className="divide-y divide-line/70" data-testid="claims-list">
            {(claims ?? []).map((c) => (
              <li
                key={c.request_id}
                data-testid="claim-row"
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <Link
                    to={`/members/${c.member_id}`}
                    className="font-medium hover:text-ember-dark"
                  >
                    {c.member_name}
                  </Link>
                  <p className="text-xs text-muted">
                    {c.plan_name} · {formatRupeeAmount(c.amount)} · said paid {claimedAgo(c.claimed_paid_at)}
                    {c.member_phone ? ` · ${c.member_phone}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openRecord(c)}
                  disabled={opening === c.request_id}
                  className="focus-ring min-h-[44px] rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-ember-dark disabled:opacity-60"
                >
                  {opening === c.request_id ? "Opening…" : "Record payment"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {subject && (
        <RecordPaymentModal
          subject={subject}
          initialMethod="upi"
          onClose={() => setSubject(null)}
          onAlreadyPaid={load}
          onRecorded={(message) => {
            setToast({ kind: "success", message });
            load();
          }}
        />
      )}
    </div>
  );
}

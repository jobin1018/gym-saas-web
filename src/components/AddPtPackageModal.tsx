import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { RecordPaymentModal } from "./RecordPaymentModal";
import {
  GOAL_OPTIONS,
  createPtPackage,
  loadCoaches,
  validatePtPackageInput,
  workloadLabel,
  type Coach,
  type Goal,
} from "../lib/ptPackageWrites";

// Standalone modal — was AssignCoachSection.tsx, embedded inside
// MemberFormModal's edit view. Now reached from the Member Detail page's
// Personal Training section instead: MemberFormModal is scoped to just
// basic info + plan/pricing now (see its own header comment), and PT-package
// creation lives here, its own real write/error handling, same as before —
// just presented as a modal (its own X/backdrop) rather than an inline
// section. The validation + insert itself now lives in ptPackageWrites.ts,
// shared with the /pt/add magic-link page — same fields, same rules, this
// is just one of two entry points to them now.
export function AddPtPackageModal({
  memberId,
  memberName,
  onClose,
  onCreated,
  onPaid,
}: {
  memberId: string;
  // Only used to label the optional "Record payment now?" step.
  memberName?: string;
  onClose: () => void;
  onCreated: () => void;
  // Fired after the optional payment is recorded (the caller refreshes its
  // Paid badge / transactions).
  onPaid?: () => void;
}) {
  const { claims } = useAuth();
  const canRecordPayments = claims?.role === "owner" || claims?.role === "front_desk";
  // Set once the package exists, so a payment can be offered for it.
  const [created, setCreated] = useState<{ id: string; price: number; goal: Goal } | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [paid, setPaid] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachId, setCoachId] = useState("");
  const [goal, setGoal] = useState<Goal>("general_fitness");
  // Front desk enters the package's own duration + rate; sessions_purchased is
  // their product, computed by the pt_packages_derive_sessions trigger on
  // insert (see 20260829098500_pt_packages_session_calc.sql). This duration is
  // the PT package's, independent of the member's gym-membership plan.
  const [durationMonths, setDurationMonths] = useState("3");
  const [sessionsPerMonth, setSessionsPerMonth] = useState("4");
  const [price, setPrice] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadCoaches().then(setCoaches);
  }, []);

  async function handleCreatePackage() {
    setError("");
    const validated = validatePtPackageInput({
      coachId,
      durationMonths,
      sessionsPerMonth,
      price,
    });
    if (validated.error !== null) {
      setError(validated.error);
      return;
    }

    setSubmitting(true);
    try {
      const packageId = await createPtPackage({
        member_id: memberId,
        coach_id: coachId,
        goal,
        duration_months: validated.parsed.months,
        sessions_per_month: validated.parsed.perMonth,
        price: validated.parsed.price,
        start_date: startDate,
      });
      setCreated({ id: packageId, price: validated.parsed.price, goal });

      const coachName = coaches.find((c) => c.id === coachId)?.name ?? "coach";
      setSuccess(`Package created with ${coachName}.`);
      onCreated();
    } catch {
      setError("Couldn't create the package — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Add PT package
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-sage-dark">{success}</p>
            {paid && <p className="text-sm text-sage-dark">Payment recorded.</p>}
            {created && canRecordPayments && created.price > 0 && !paid && (
              <div className="rounded-lg border border-line bg-paper p-3">
                <p className="text-sm font-medium">Record payment now?</p>
                <p className="mt-0.5 text-xs text-muted">
                  The package is unpaid until a payment is recorded. You can
                  also do it later from the member's page.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRecord(true)}
                    className="focus-ring rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-white hover:bg-ember-dark"
                  >
                    Record payment
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-white"
                  >
                    Skip
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="focus-ring w-full rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            >
              <option value="">Select a coach</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {workloadLabel(c)}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as Goal)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              >
                {GOAL_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Duration (months)
                </label>
                <input
                  inputMode="numeric"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Sessions / month
                </label>
                <input
                  inputMode="numeric"
                  value={sessionsPerMonth}
                  onChange={(e) => setSessionsPerMonth(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Price (₹)
                </label>
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="12000"
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">
                  Total sessions
                </label>
                <p className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-muted">
                  {Number.isInteger(Number(durationMonths)) &&
                  Number.isInteger(Number(sessionsPerMonth)) &&
                  Number(durationMonths) > 0 &&
                  Number(sessionsPerMonth) > 0
                    ? Number(durationMonths) * Number(sessionsPerMonth)
                    : "—"}
                </p>
              </div>
            </div>

            {error && <p className="text-xs text-ember-dark">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePackage}
                disabled={submitting}
                className="focus-ring rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Creating…" : "Create package"}
              </button>
            </div>
          </div>
        )}
      </div>
      {showRecord && created && (
        <RecordPaymentModal
          subject={{
            kind: "pt",
            ptPackageId: created.id,
            memberName: memberName ?? "Member",
            label: `PT package · ${GOAL_OPTIONS.find((g) => g.value === created.goal)?.label ?? created.goal}`,
            price: created.price,
          }}
          onClose={() => setShowRecord(false)}
          onAlreadyPaid={() => {
            setPaid(true);
            onPaid?.();
          }}
          onRecorded={() => {
            setPaid(true);
            onPaid?.();
          }}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { X, RefreshCw } from "lucide-react";
import clsx from "clsx";
import {
  addMonths,
  createMember,
  isNetworkError,
  updateMemberAndMembership,
  type EditMemberPayload,
} from "../lib/memberWrites";
import { PLAN_AMOUNT_MIN, PLAN_AMOUNT_MAX } from "../lib/planWrites";
import {
  getPendingWrites,
  queuePendingWrite,
  retryPendingWrites,
} from "../lib/offlineQueue";
import { normalizeLocalPhone, toLocalDigits } from "../lib/phone";
import { AssignCoachSection } from "./AssignCoachSection";
import { MembershipFreezeSection } from "./MembershipFreezeSection";

export type Plan = {
  id: string;
  name: string;
  amount: number; // monthly rate — duration lives on the membership, not the plan
};

export type MemberFormInitial = {
  member_id: string;
  membership_id: string;
  name: string;
  phone: string;
  plan_id: string;
  start_date: string;
  status: EditMemberPayload["status"];
  // Needed for MembershipFreezeSection's "resumes with N days remaining"
  // display — unused everywhere else in this file.
  current_period_end: string;
  whatsapp_opt_in: boolean;
};

const STATUS_OPTIONS: EditMemberPayload["status"][] = [
  "active",
  "past_due",
  "expired",
  "cancelled",
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </h3>
  );
}

export function MemberFormModal({
  mode,
  initial,
  plans,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  initial?: MemberFormInitial;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  // Stored phone numbers are "91XXXXXXXXXX" (existing data has no "+") —
  // strip the country code for display since the form shows it as a fixed
  // chip, not editable text.
  const [phone, setPhone] = useState(
    initial ? toLocalDigits(initial.phone) : "",
  );
  const [planId, setPlanId] = useState(initial?.plan_id ?? plans[0]?.id ?? "");
  // Per-signup, not per-plan — a free integer entered here, not a fixed
  // 1/3/6/12 tier list. Only meaningful in add mode: an existing membership's
  // duration was fixed at signup and editing it here wouldn't recompute
  // current_period_end/total_price anyway (same "won't reprorate" reasoning
  // as start date below), so the edit form doesn't expose it.
  const [durationMonths, setDurationMonths] = useState("1");
  // Custom pricing: same add-mode-only scoping as duration, for the same
  // reason — it feeds the signup-time total_price snapshot, which editing
  // never touches. Toggling it on pre-fills the plan's own rate so front
  // desk adjusts from there rather than typing a number from scratch.
  const [customPriceEnabled, setCustomPriceEnabled] = useState(false);
  const [customRate, setCustomRate] = useState("");
  const [startDate, setStartDate] = useState(
    initial?.start_date ?? new Date().toISOString().slice(0, 10),
  );
  const [whatsappOptIn, setWhatsappOptIn] = useState(
    initial?.whatsapp_opt_in ?? true,
  );
  const [status, setStatus] = useState<EditMemberPayload["status"]>(
    initial?.status ?? "active",
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [networkQueuedId, setNetworkQueuedId] = useState<string | null>(null);
  const [serverError, setServerError] = useState("");

  const planChanged = mode === "edit" && initial && planId !== initial.plan_id;
  const selectedPlan = plans.find((p) => p.id === planId);
  const parsedDuration = Number(durationMonths);
  const durationValid =
    Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 36;
  const parsedCustomRate = Number(customRate);
  const customRateValid =
    !customPriceEnabled ||
    (customRate.trim() !== "" &&
      !Number.isNaN(parsedCustomRate) &&
      parsedCustomRate >= PLAN_AMOUNT_MIN &&
      parsedCustomRate <= PLAN_AMOUNT_MAX);
  // The rate the total/renewal preview and the submit payload both use —
  // the selected plan's list rate, or the front desk's override.
  const effectiveRate = customPriceEnabled ? parsedCustomRate : selectedPlan?.amount;
  const renewalPreview =
    mode === "add" && startDate && durationValid
      ? addMonths(startDate, parsedDuration)
      : null;
  // What the signup-time trigger (or the explicit override) will snapshot
  // into memberships.total_price — shown so the amount charged isn't a
  // surprise before submit.
  const totalPreview =
    mode === "add" && effectiveRate != null && !Number.isNaN(effectiveRate) && durationValid
      ? effectiveRate * parsedDuration
      : null;

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    const phoneResult = normalizeLocalPhone(phone);
    if (phoneResult.error) errors.phone = phoneResult.error;
    if (!planId) errors.plan = "Select a plan";
    if (mode === "add" && !durationValid)
      errors.duration = "Enter a whole number of months between 1 and 36";
    if (mode === "add" && !customRateValid)
      errors.customRate = `Enter an amount between ₹${PLAN_AMOUNT_MIN} and ₹${PLAN_AMOUNT_MAX.toLocaleString("en-IN")}`;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setSubmitting(true);
    // validate() already confirmed this parses, so the assertion is safe.
    const normalizedPhone = normalizeLocalPhone(phone).value!;
    const totalPriceOverride =
      mode === "add" && customPriceEnabled ? parsedCustomRate * parsedDuration : undefined;

    try {
      if (mode === "add") {
        await createMember({
          name: name.trim(),
          phone: normalizedPhone,
          plan_id: planId,
          start_date: startDate,
          duration_months: parsedDuration,
          whatsapp_opt_in: whatsappOptIn,
          total_price_override: totalPriceOverride,
        });
      } else if (initial) {
        await updateMemberAndMembership({
          member_id: initial.member_id,
          membership_id: initial.membership_id,
          name: name.trim(),
          phone: normalizedPhone,
          plan_id: planId,
          start_date: startDate,
          status,
          whatsapp_opt_in: whatsappOptIn,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      if (isNetworkError(err)) {
        const payload =
          mode === "add"
            ? {
                name: name.trim(),
                phone: normalizedPhone,
                plan_id: planId,
                start_date: startDate,
                duration_months: parsedDuration,
                whatsapp_opt_in: whatsappOptIn,
                total_price_override: totalPriceOverride,
              }
            : {
                member_id: initial!.member_id,
                membership_id: initial!.membership_id,
                name: name.trim(),
                phone: normalizedPhone,
                plan_id: planId,
                start_date: startDate,
                status,
                whatsapp_opt_in: whatsappOptIn,
              };
        const id = queuePendingWrite(
          mode === "add"
            ? { kind: "add_member", payload: payload as any }
            : { kind: "edit_member", payload: payload as any },
        );
        setNetworkQueuedId(id);
      } else {
        setServerError("Something went wrong — please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryQueued() {
    if (!networkQueuedId) return;
    setSubmitting(true);
    await retryPendingWrites();
    const stillPending = getPendingWrites().some(
      (w) => w.id === networkQueuedId,
    );
    setSubmitting(false);
    if (!stillPending) {
      onSaved();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {mode === "add" ? "Add member" : "Edit member"}
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {networkQueuedId ? (
          <div className="mb-4 rounded-lg border border-amberflag/30 bg-amberflag/10 p-4 text-sm">
            <p className="font-medium text-ink">
              Couldn't save — check your connection.
            </p>
            <p className="mt-1 text-muted">
              Your entry is still here and queued — it'll sync automatically
              once you're back online, or tap retry now.
            </p>
            <button
              onClick={handleRetryQueued}
              disabled={submitting}
              className="focus-ring mt-3 flex items-center gap-2 rounded-lg bg-ember px-3 py-1.5 text-xs font-medium text-white hover:bg-ember-dark disabled:opacity-60"
            >
              {submitting && <RefreshCw size={14} className="animate-spin" />}
              Retry now
            </button>
          </div>
        ) : null}

        {serverError && (
          <p className="mb-4 text-sm text-ember-dark">{serverError}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* --- Basic info ------------------------------------------------ */}
          <div className="space-y-4">
            <SectionHeading>Basic info</SectionHeading>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-ember-dark">{fieldErrors.name}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Phone
              </label>
              <div
                className={clsx(
                  "flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow",
                  fieldErrors.phone ? "border-ember" : "border-line",
                  "focus-within:outline-none focus-within:ring-2 focus-within:ring-ember focus-within:ring-offset-2 focus-within:ring-offset-paper",
                )}
              >
                <span className="flex items-center border-r border-line bg-paper px-3 text-sm font-medium text-muted">
                  +91
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  className="w-full px-3 py-2.5 text-sm outline-none"
                />
              </div>
              {fieldErrors.phone && (
                <p className="mt-1 text-xs text-ember-dark">
                  {fieldErrors.phone}
                </p>
              )}
            </div>
          </div>

          {/* --- Plan & pricing --------------------------------------------- */}
          <div className="space-y-4 border-t border-line pt-5">
            <SectionHeading>Plan &amp; pricing</SectionHeading>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Plan
              </label>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — ₹{p.amount.toLocaleString("en-IN")}/mo
                  </option>
                ))}
              </select>
              {fieldErrors.plan && (
                <p className="mt-1 text-xs text-ember-dark">{fieldErrors.plan}</p>
              )}
              {planChanged && (
                <p className="mt-1 text-xs text-amberflag">
                  Changing the plan doesn't adjust this cycle's billing —
                  proration isn't implemented, so the new amount only applies
                  from the next renewal.
                </p>
              )}
            </div>

            {mode === "add" && (
              <>
                <label className="flex items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm transition-colors hover:border-line/60">
                  <input
                    type="checkbox"
                    checked={customPriceEnabled}
                    onChange={(e) => {
                      setCustomPriceEnabled(e.target.checked);
                      // Pre-fill from the selected plan's rate so front desk
                      // adjusts from a real starting point, not a blank field.
                      if (e.target.checked && !customRate && selectedPlan) {
                        setCustomRate(String(selectedPlan.amount));
                      }
                    }}
                    className="focus-ring h-4 w-4 rounded border-line text-ember accent-ember"
                  />
                  Use a custom rate (discount / negotiated price)
                </label>

                {customPriceEnabled && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">
                      Custom monthly rate (₹)
                    </label>
                    <input
                      inputMode="decimal"
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                    />
                    {fieldErrors.customRate && (
                      <p className="mt-1 text-xs text-ember-dark">
                        {fieldErrors.customRate}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Duration (months)
                  </label>
                  <input
                    inputMode="numeric"
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(e.target.value)}
                    className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                  />
                  {fieldErrors.duration && (
                    <p className="mt-1 text-xs text-ember-dark">
                      {fieldErrors.duration}
                    </p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
              {mode === "edit" ? (
                <p className="mt-1 text-xs text-muted">
                  Editing this won't recalculate the current renewal date.
                </p>
              ) : (
                renewalPreview && (
                  <p className="mt-1 text-xs text-muted">
                    Renews on{" "}
                    <span className="font-medium text-ink">
                      {new Date(renewalPreview).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>{" "}
                    ({parsedDuration} {parsedDuration === 1 ? "month" : "months"})
                    {totalPreview != null && (
                      <>
                        {" "}
                        · Total{" "}
                        <span className="font-medium text-ink">
                          ₹{totalPreview.toLocaleString("en-IN")}
                        </span>
                      </>
                    )}
                  </p>
                )
              )}
            </div>

            {/* Hidden while frozen: this <select> only ever writes one of
                STATUS_OPTIONS's 4 values (never "frozen" — see
                EditMemberPayload's comment), so showing it here would let
                someone silently unfreeze as a side effect of an unrelated
                Save. MembershipFreezeSection below is the only real path
                out of "frozen", via unfreeze_membership.
                Reads the live `status` state, not initial.status — a freeze
                done via that section during this same modal session must
                hide this immediately, not just on next open, or Save would
                fight it back to whatever this dropdown was showing before
                the freeze happened. See onStatusChange below. */}
            {mode === "edit" && status !== "frozen" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as EditMemberPayload["status"])
                  }
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* --- Notifications ------------------------------------------------ */}
          <div className="space-y-4 border-t border-line pt-5">
            <SectionHeading>Notifications</SectionHeading>
            <label className="flex items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm transition-colors hover:border-line/60">
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
                className="focus-ring h-4 w-4 rounded border-line text-ember accent-ember"
              />
              WhatsApp reminders opted in
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !!networkQueuedId}
              className={clsx(
                "focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98]",
                (submitting || networkQueuedId) && "opacity-60",
              )}
            >
              {submitting ? "Saving…" : mode === "add" ? "Add member" : "Save"}
            </button>
          </div>
        </form>

        {/* Deliberately outside the <form> above — real write, but its own
            isolated component/submit path, not part of handleSubmit above.
            See AssignCoachSection.tsx. */}
        {mode === "edit" && initial && (
          <>
            <MembershipFreezeSection
              membershipId={initial.membership_id}
              status={initial.status}
              currentPeriodEnd={initial.current_period_end}
              // Keeps the plain Status <select> above (and what a Save
              // submits) in sync with a freeze/unfreeze that happens while
              // this modal is still open — see the dropdown's own comment.
              onStatusChange={(newStatus) =>
                setStatus(newStatus as EditMemberPayload["status"])
              }
            />
            <AssignCoachSection memberId={initial.member_id} />
          </>
        )}
      </div>
    </div>
  );
}

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
import {
  getPendingWrites,
  queuePendingWrite,
  retryPendingWrites,
} from "../lib/offlineQueue";
import { normalizeLocalPhone, toLocalDigits } from "../lib/phone";
import { AssignCoachSection } from "./AssignCoachSection";

export type Plan = {
  id: string;
  name: string;
  amount: number;
  duration_months: number;
};

export type MemberFormInitial = {
  member_id: string;
  membership_id: string;
  name: string;
  phone: string;
  plan_id: string;
  start_date: string;
  status: EditMemberPayload["status"];
  whatsapp_opt_in: boolean;
};

const STATUS_OPTIONS: EditMemberPayload["status"][] = [
  "active",
  "past_due",
  "expired",
  "cancelled",
];

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
  const renewalPreview =
    selectedPlan && startDate
      ? addMonths(startDate, selectedPlan.duration_months)
      : null;

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    const phoneResult = normalizeLocalPhone(phone);
    if (phoneResult.error) errors.phone = phoneResult.error;
    if (!planId) errors.plan = "Select a plan";
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

    try {
      if (mode === "add") {
        await createMember({
          name: name.trim(),
          phone: normalizedPhone,
          plan_id: planId,
          start_date: startDate,
          whatsapp_opt_in: whatsappOptIn,
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
                whatsapp_opt_in: whatsappOptIn,
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
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
                  {p.name} — ₹{p.amount.toLocaleString("en-IN")}
                  {p.duration_months === 1
                    ? "/mo"
                    : ` / ${p.duration_months} months`}
                </option>
              ))}
            </select>
            {fieldErrors.plan && (
              <p className="mt-1 text-xs text-ember-dark">{fieldErrors.plan}</p>
            )}
            {planChanged && (
              <p className="mt-1 text-xs text-amberflag">
                Changing the plan doesn't adjust this cycle's billing —
                proration isn't implemented, so the new amount only applies from
                the next renewal.
              </p>
            )}
          </div>

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
                  ({selectedPlan!.duration_months}{" "}
                  {selectedPlan!.duration_months === 1 ? "month" : "months"})
                </p>
              )
            )}
          </div>

          {mode === "edit" && (
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

          <label className="flex items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm transition-colors hover:border-line/60">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => setWhatsappOptIn(e.target.checked)}
              className="focus-ring h-4 w-4 rounded border-line text-ember accent-ember"
            />
            WhatsApp reminders opted in
          </label>

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
          <AssignCoachSection memberId={initial.member_id} />
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Plus, Pencil, Ban, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import {
  createPlan,
  updatePlan,
  setPlanActive,
  PLAN_AMOUNT_MIN,
  PLAN_AMOUNT_MAX,
} from "../lib/planWrites";
import { Toast, type ToastState } from "../components/Toast";
import {
  TOTAL_PRICE_MAX,
  bundleListLabel,
  derivedMonthlyRate,
  formatRupees,
  monthsLabel,
} from "../lib/bundlePricing";
import type { PlanBundleFields } from "../lib/planWrites";

type Plan = {
  id: string;
  name: string;
  amount: number;
  active: boolean;
  duration_months: number | null;
  total_price: number | null;
  bonus_months: number;
};

type ModalState = { mode: "add" } | { mode: "edit"; plan: Plan } | null;

type PlanSubmit = { amount?: number; bundle?: PlanBundleFields };

function PlanFormModal({
  state,
  onClose,
  onSaved,
}: {
  state: Exclude<ModalState, null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = state.mode === "edit" ? state.plan : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  // Optional bundle fields. A plan with a total price is a bundle: the
  // monthly rate is then derived (total / duration) and not entered.
  const [duration, setDuration] = useState(
    editing?.duration_months != null ? String(editing.duration_months) : "",
  );
  const [total, setTotal] = useState(
    editing?.total_price != null ? String(editing.total_price) : "",
  );
  const [bonus, setBonus] = useState(
    editing && editing.bonus_months > 0 ? String(editing.bonus_months) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const parsedDuration = Number(duration);
  const durationOk =
    duration.trim() !== "" &&
    Number.isInteger(parsedDuration) &&
    parsedDuration >= 1 &&
    parsedDuration <= 36;
  const parsedTotal = Number(total);
  const totalOk =
    total.trim() !== "" &&
    !Number.isNaN(parsedTotal) &&
    parsedTotal >= 0 &&
    parsedTotal <= TOTAL_PRICE_MAX;
  const isBundleForm = total.trim() !== "";
  const derivedRate =
    isBundleForm && totalOk && durationOk
      ? derivedMonthlyRate(parsedTotal, parsedDuration)
      : null;

  function validate(): PlanSubmit | null {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";

    if (duration.trim() !== "" && !durationOk) {
      errs.duration = "Enter a whole number of months between 1 and 36";
    }
    if (isBundleForm) {
      if (!totalOk) {
        errs.total = `Enter a total between ₹0 and ₹${TOTAL_PRICE_MAX.toLocaleString("en-IN")}`;
      }
      if (duration.trim() === "") {
        errs.duration = "Enter the number of months this total covers";
      }
    }

    const parsedBonus = bonus.trim() === "" ? 0 : Number(bonus);
    if (!Number.isInteger(parsedBonus) || parsedBonus < 0) {
      errs.bonus = "Enter a whole number of free months (0 or more)";
    } else if (parsedBonus > 0 && !isBundleForm) {
      errs.bonus = "Free months need a total price";
    } else if (parsedBonus > 0 && durationOk && parsedBonus >= parsedDuration) {
      errs.bonus = "Free months must be fewer than the duration";
    }

    // The monthly rate is only entered for an ordinary plan.
    let parsedAmount = 0;
    if (!isBundleForm) {
      parsedAmount = Number(amount);
      if (!amount.trim() || Number.isNaN(parsedAmount)) {
        errs.amount = "Enter a valid amount";
      } else if (parsedAmount < PLAN_AMOUNT_MIN || parsedAmount > PLAN_AMOUNT_MAX) {
        errs.amount = `Must be between ₹${PLAN_AMOUNT_MIN} and ₹${PLAN_AMOUNT_MAX.toLocaleString("en-IN")}`;
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return null;

    // An ordinary plan that never used the bundle columns sends exactly what
    // it always did (name + amount). The bundle columns are written whenever
    // any is filled in, or the plan already had some — so clearing a bundle
    // back to an ordinary plan nulls them out explicitly.
    const hadBundleColumns =
      !!editing &&
      (editing.duration_months != null ||
        editing.total_price != null ||
        editing.bonus_months > 0);
    const hasBundleInputs = duration.trim() !== "" || isBundleForm || parsedBonus > 0;
    const bundle: PlanBundleFields | undefined =
      hasBundleInputs || hadBundleColumns
        ? {
            duration_months: duration.trim() === "" ? null : parsedDuration,
            total_price: isBundleForm ? parsedTotal : null,
            bonus_months: parsedBonus,
          }
        : undefined;
    return { amount: isBundleForm ? undefined : parsedAmount, bundle };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    const submit = validate();
    if (submit === null) return;

    setSubmitting(true);
    try {
      if (editing) {
        await updatePlan({ id: editing.id, name: name.trim(), ...submit });
        onSaved("Plan updated.");
      } else {
        await createPlan({ name: name.trim(), ...submit });
        onSaved("Plan created.");
      }
      onClose();
    } catch {
      setServerError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl2 bg-white p-6 shadow-2xl">
        <h2 className="mb-5 font-display text-lg font-semibold tracking-tight">
          {editing ? "Edit plan" : "New plan"}
        </h2>

        {serverError && (
          <p className="mb-4 text-sm text-ember-dark">{serverError}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Plan name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Basic"
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-ember-dark">{errors.name}</p>
            )}
          </div>

          {!isBundleForm && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Monthly rate (₹)
              </label>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1200"
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
              {errors.amount && (
                <p className="mt-1 text-xs text-ember-dark">{errors.amount}</p>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-line/70 p-3">
            <p className="text-xs text-muted">
              Optional — for a package with a fixed total (e.g. 6 months for
              ₹4,500, 3 of them free). Leave the total empty for a normal
              monthly-rate plan.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Duration (months)
                </label>
                <input
                  inputMode="numeric"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="6"
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                />
                {errors.duration && (
                  <p className="mt-1 text-xs text-ember-dark">{errors.duration}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Total price (₹)
                </label>
                <input
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="4500"
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                />
                {errors.total && (
                  <p className="mt-1 text-xs text-ember-dark">{errors.total}</p>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Free months (included in the duration)
              </label>
              <input
                inputMode="numeric"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                placeholder="0"
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
              {errors.bonus && (
                <p className="mt-1 text-xs text-ember-dark">{errors.bonus}</p>
              )}
            </div>
            {derivedRate != null && (
              <p className="text-xs text-muted">
                Monthly rate: about{" "}
                <span className="font-medium text-ink">
                  {formatRupees(derivedRate)}
                </span>{" "}
                per month
              </p>
            )}
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
              disabled={submitting}
              className="focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Saving…" : editing ? "Save" : "Create plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PlansAdmin() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  function refresh() {
    supabase
      .from("membership_plans")
      .select("id, name, amount, active, duration_months, total_price, bonus_months")
      .order("active", { ascending: false })
      .order("name")
      .then(({ data }) => data && setPlans(data));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleToggle(plan: Plan) {
    setTogglingId(plan.id);
    try {
      await setPlanActive(plan.id, !plan.active);
      refresh();
      setToast({
        kind: "success",
        message: plan.active ? "Plan deactivated." : "Plan reactivated.",
      });
    } catch {
      setToast({ kind: "error", message: "Something went wrong — please try again." });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Membership plans
          </h1>
          <p className="mt-1 text-sm text-muted">
            What members can sign up for. Deactivating hides a plan from new
            signups — it doesn't touch anyone already on it.
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="focus-ring flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-ember-dark hover:shadow-glow-ember active:translate-y-0"
        >
          <Plus size={16} /> New plan
        </button>
      </div>

      {toast && (
        <div className="mt-4">
          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
      )}

      <div className="mt-5 space-y-2">
        {plans.map((p) => (
          <div
            key={p.id}
            className={clsx(
              "flex items-center justify-between rounded-xl2 border bg-white px-5 py-3.5 shadow-card transition-colors",
              p.active ? "border-line/70" : "border-line/70 opacity-60",
            )}
          >
            <div className="flex items-center gap-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">
                  {p.total_price != null && p.duration_months != null
                    ? bundleListLabel({
                        duration_months: p.duration_months,
                        total_price: p.total_price,
                        bonus_months: p.bonus_months,
                      })
                    : `₹${p.amount.toLocaleString("en-IN")}/mo${
                        p.duration_months != null
                          ? ` · default ${monthsLabel(p.duration_months)}`
                          : ""
                      }`}
                </p>
              </div>
              {!p.active && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-line px-2.5 py-0.5 text-xs font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                  Inactive
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setModal({ mode: "edit", plan: p })}
                className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
              >
                <Pencil size={14} /> Edit
              </button>
              <button
                onClick={() => handleToggle(p)}
                disabled={togglingId === p.id}
                className={clsx(
                  "focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                  p.active
                    ? "text-ember-dark hover:bg-ember/10"
                    : "text-sage-dark hover:bg-sage/10",
                )}
              >
                {p.active ? (
                  <>
                    <Ban size={14} /> Deactivate
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} /> Reactivate
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
        {plans.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            No plans yet — create one to get started.
          </p>
        )}
      </div>

      {modal && (
        <PlanFormModal
          state={modal}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            refresh();
            setToast({ kind: "success", message });
          }}
        />
      )}
    </div>
  );
}

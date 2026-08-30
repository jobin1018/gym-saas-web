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

type Plan = {
  id: string;
  name: string;
  amount: number;
  active: boolean;
};

type ModalState = { mode: "add" } | { mode: "edit"; plan: Plan } | null;

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  function validate(): number | null {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    const parsedAmount = Number(amount);
    if (!amount.trim() || Number.isNaN(parsedAmount)) {
      errs.amount = "Enter a valid amount";
    } else if (parsedAmount < PLAN_AMOUNT_MIN || parsedAmount > PLAN_AMOUNT_MAX) {
      errs.amount = `Must be between ₹${PLAN_AMOUNT_MIN} and ₹${PLAN_AMOUNT_MAX.toLocaleString("en-IN")}`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0 ? parsedAmount : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    const parsedAmount = validate();
    if (parsedAmount === null) return;

    setSubmitting(true);
    try {
      if (editing) {
        await updatePlan({ id: editing.id, name: name.trim(), amount: parsedAmount });
        onSaved("Plan updated.");
      } else {
        await createPlan({ name: name.trim(), amount: parsedAmount });
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
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
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
      .select("id, name, amount, active")
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
                  ₹{p.amount.toLocaleString("en-IN")}/mo
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

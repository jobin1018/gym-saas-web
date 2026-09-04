import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { redeemMagicLink, MagicLinkError } from "../../lib/magicLink";
import { MagicLinkShell, type MagicLinkStep } from "../../components/MagicLinkShell";
import { createMember, isNetworkError, type NewMemberPayload } from "../../lib/memberWrites";
import { normalizeLocalPhone } from "../../lib/phone";
import {
  getPendingWrites,
  queuePendingWrite,
  retryPendingWrites,
} from "../../lib/offlineQueue";

type Plan = { id: string; name: string; amount: number };

// What's showing once the link itself has redeemed and the form is up —
// distinct from MagicLinkShell's own checking/error/ready, which is only
// about the token. "queued" mirrors MemberFormModal's own network-error
// handling exactly (same offline-queue write kind, "add_member" — this page
// reuses createMember() from memberWrites.ts, so the queue already knows
// how to replay it), and only becomes "done" once the write has actually
// landed — a magic-link page reached from a phone is exactly the kind of
// place someone taps once and closes the tab, so this can't say "added"
// before it's actually saved.
type SubmitState = "form" | "queued" | "done";

// The WhatsApp "ADD MEMBER" link's destination — no PIN, no sidebar, no
// desktop chrome. Same standalone-page shape as CoachQuickLog/the /pt/add
// page: has to work before any session exists. Reuses createMember()
// (memberWrites.ts) for the actual writes so this can never drift from the
// validation/offline-queue rules the normal in-app "Add member" flow
// (MemberFormModal) already established — see NewMemberPayload's own type
// for exactly what that shares.
export function AddMemberLinkPage() {
  const [searchParams] = useSearchParams();
  const { completeLogin } = useAuth();
  const [step, setStep] = useState<MagicLinkStep>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [staffName, setStaffName] = useState("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState("");
  const [durationMonths, setDurationMonths] = useState("1");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("form");
  const [networkQueuedId, setNetworkQueuedId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");

  useEffect(() => {
    (async () => {
      // Same page-refresh guard as CoachQuickLog: a reload re-sends the same
      // single-use token, which the server would correctly reject as
      // already-used. If this browser already has a live session from a
      // redemption that already happened, skip straight past it instead of
      // showing a false "link expired" on a simple refresh.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        setStep("ready");
        loadPlans();
        return;
      }

      const token = searchParams.get("token");
      if (!token) {
        setErrorMessage(
          "This link isn't valid — text the bot on WhatsApp again for a new one.",
        );
        setStep("error");
        return;
      }

      try {
        const redeemed = await redeemMagicLink(token);
        const { error } = await completeLogin(
          redeemed.access_token,
          redeemed.refresh_token,
          redeemed.name,
        );
        if (error) {
          setErrorMessage(
            "Couldn't start your session — text the bot on WhatsApp again.",
          );
          setStep("error");
          return;
        }
        setStaffName(redeemed.name);
        setStep("ready");
        loadPlans();
      } catch (err) {
        setErrorMessage(
          err instanceof MagicLinkError
            ? err.message
            : "Something went wrong — text the bot on WhatsApp again.",
        );
        setStep("error");
      }
    })();
    // Redeem at most once on mount — never re-run on searchParams identity
    // changes, which would re-send a now-already-used token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadPlans() {
    // Same plan-fetch shape as MemberFormModal/ImportMembers — active plans
    // only, front desk can't sign someone up onto a retired plan.
    supabase
      .from("membership_plans")
      .select("id, name, amount")
      .eq("active", true)
      .then(({ data }) => {
        if (!data) return;
        setPlans(data);
        setPlanId((prev) => prev || data[0]?.id || "");
      });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Name is required";
    const phoneResult = normalizeLocalPhone(phone);
    if (phoneResult.error) errors.phone = phoneResult.error;
    if (!planId) errors.plan = "Select a plan";
    const parsedDuration = Number(durationMonths);
    if (
      !Number.isInteger(parsedDuration) ||
      parsedDuration < 1 ||
      parsedDuration > 36
    ) {
      errors.duration = "Enter a whole number of months between 1 and 36";
    }
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
    // whatsapp_opt_in defaults on (no toggle on this trimmed-down form,
    // matching CSV import's own default) — front desk adding someone in
    // person from a WhatsApp-driven flow is exactly the case where opt-in
    // is the sensible default.
    const payload: NewMemberPayload = {
      name: name.trim(),
      phone: normalizedPhone,
      plan_id: planId,
      start_date: startDate,
      duration_months: Number(durationMonths),
      whatsapp_opt_in: true,
    };

    try {
      // createMember() also fires the welcome WhatsApp message itself
      // (triggerWelcomeMessage) — nothing extra needed here for that.
      await createMember(payload);
      setSavedName(payload.name);
      setSubmitState("done");
    } catch (err) {
      if (isNetworkError(err)) {
        const id = queuePendingWrite({ kind: "add_member", payload });
        setNetworkQueuedId(id);
        setSavedName(payload.name);
        setSubmitState("queued");
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
      setNetworkQueuedId(null);
      setSubmitState("done");
    }
  }

  return (
    <MagicLinkShell step={step} errorMessage={errorMessage}>
      {submitState === "done" && (
        <div className="rounded-xl2 border border-line/70 bg-white p-8 text-center shadow-card">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sage/10 text-sage-dark">
            <CheckCircle2 size={28} />
          </span>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Member added
          </h1>
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-ink">{savedName}</span> has
            been added to the gym. You can close this page now.
          </p>
        </div>
      )}

      {submitState === "queued" && (
        <div className="rounded-xl2 border border-line/70 bg-white p-6 text-center shadow-card">
          <div className="mb-4 rounded-lg border border-amberflag/30 bg-amberflag/10 p-4 text-left text-sm">
            <p className="font-medium text-ink">
              Couldn't save — check your connection.
            </p>
            <p className="mt-1 text-muted">
              <span className="font-medium text-ink">{savedName}</span>'s
              details are saved on this phone and will sync automatically
              once you're back online, or tap retry now.
            </p>
          </div>
          <button
            onClick={handleRetryQueued}
            disabled={submitting}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-ember px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark disabled:opacity-60"
          >
            {submitting && <RefreshCw size={14} className="animate-spin" />}
            Retry now
          </button>
        </div>
      )}

      {submitState === "form" && (
        <>
          {staffName && (
            <p className="mb-3 text-center text-sm text-muted">
              Hi <span className="font-medium text-ink">{staffName}</span> —
              add a new member below.
            </p>
          )}
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl2 border border-line/70 bg-white p-5 shadow-card"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
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
                  inputMode="numeric"
                  className="w-full px-3 py-3 text-base outline-none"
                />
              </div>
              {fieldErrors.phone && (
                <p className="mt-1 text-xs text-ember-dark">{fieldErrors.phone}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Plan
              </label>
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
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
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Duration (months)
                </label>
                <input
                  inputMode="numeric"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
                />
                {fieldErrors.duration && (
                  <p className="mt-1 text-xs text-ember-dark">
                    {fieldErrors.duration}
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
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
                />
              </div>
            </div>

            {serverError && (
              <p className="text-sm text-ember-dark">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="focus-ring w-full rounded-lg bg-ember px-4 py-3.5 text-base font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add member"}
            </button>
          </form>
        </>
      )}
    </MagicLinkShell>
  );
}

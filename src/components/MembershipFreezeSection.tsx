import { useEffect, useState } from "react";
import { Snowflake, PlayCircle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import {
  freezeMembership,
  unfreezeMembership,
  getGoverningFreeze,
  MembershipFreezeError,
  type MembershipFreezeRow,
} from "../lib/membershipFreeze";

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00");
  const to = new Date(toIso + "T00:00:00");
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Deliberately self-contained, same isolation as AssignCoachSection.tsx:
// MemberFormModal only renders this and passes membershipId/status/
// currentPeriodEnd — every real bit (governing-freeze lookup, the freeze
// form, the unfreeze confirm, error handling) lives here so the parent's
// diff stays a single import + one JSX line, and its own real submit
// logic (handleSubmit) is never touched by any of this.
//
// Freezing is deliberately NOT exposed through the existing plain Status
// <select> above (which stays literally 4 options: active/past_due/
// expired/cancelled) — that dropdown does a raw `memberships.status`
// UPDATE with no membership_freezes row, which would leave a
// status='frozen' membership with no governing freeze to show
// frozen_until/reason/days against. This section is the only path in.
export function MembershipFreezeSection({
  membershipId,
  status,
  currentPeriodEnd,
  onStatusChange,
}: {
  membershipId: string;
  status: string;
  currentPeriodEnd: string;
  // Fired with the real post-RPC status after a successful freeze
  // ('frozen') or unfreeze ('active') — lets the parent's own plain Status
  // <select> (which snapshotted `status` only at mount) stay correct for
  // the rest of this modal session instead of silently fighting this
  // section's own write on the next unrelated Save.
  onStatusChange?: (status: "frozen" | "active") => void;
}) {
  // Local, optimistic-from-real-RPC-results view — same pattern as
  // AssignCoachSection's own `success` state. Members.tsx's list badge
  // catches up next time IT reloads (add/edit elsewhere, navigation, a
  // fresh page load), same as AssignCoachSection creating a package never
  // forces that same list to refetch either — deliberately consistent
  // with that existing, already-shipped behavior, not a new gap.
  const [currentStatus, setCurrentStatus] = useState(status);
  const [periodEnd, setPeriodEnd] = useState(currentPeriodEnd);
  const [freeze, setFreeze] = useState<MembershipFreezeRow | null>(null);
  const [loadingFreeze, setLoadingFreeze] = useState(false);

  const [showFreezeForm, setShowFreezeForm] = useState(false);
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [freezing, setFreezing] = useState(false);
  const [freezeError, setFreezeError] = useState("");

  const [confirmingUnfreeze, setConfirmingUnfreeze] = useState(false);
  const [unfreezing, setUnfreezing] = useState(false);
  const [unfreezeError, setUnfreezeError] = useState("");
  const [unfreezeResult, setUnfreezeResult] = useState<{
    daysCredited: number;
    newCurrentPeriodEnd: string;
  } | null>(null);

  useEffect(() => {
    if (currentStatus !== "frozen") {
      setFreeze(null);
      return;
    }
    setLoadingFreeze(true);
    getGoverningFreeze(membershipId)
      .then(setFreeze)
      .finally(() => setLoadingFreeze(false));
  }, [currentStatus, membershipId]);

  async function handleFreeze() {
    setFreezeError("");
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      setFreezeError("Enter a whole number of days between 1 and 365.");
      return;
    }
    setFreezing(true);
    try {
      const result = await freezeMembership(membershipId, parsedDays, reason);
      setCurrentStatus("frozen");
      onStatusChange?.("frozen");
      setShowFreezeForm(false);
      // The section's own useEffect above will fetch the governing freeze
      // row now that currentStatus flipped — but we already have the exact
      // same fields from the RPC's own return, so show them immediately
      // instead of waiting on that fetch to round-trip.
      setFreeze({
        id: result.freezeId,
        membership_id: result.membershipId,
        frozen_from: result.frozenFrom,
        frozen_until: result.frozenUntil,
        days: result.days,
        reason: reason.trim() || null,
        created_at: new Date().toISOString(),
        reactivated_at: null,
      });
    } catch (err) {
      setFreezeError(
        err instanceof MembershipFreezeError ? err.message : "Something went wrong — please try again.",
      );
    } finally {
      setFreezing(false);
    }
  }

  async function handleUnfreeze() {
    setUnfreezeError("");
    setUnfreezing(true);
    try {
      const result = await unfreezeMembership(membershipId);
      setCurrentStatus("active");
      onStatusChange?.("active");
      setPeriodEnd(result.newCurrentPeriodEnd);
      setConfirmingUnfreeze(false);
      setUnfreezeResult({
        daysCredited: result.daysCredited,
        newCurrentPeriodEnd: result.newCurrentPeriodEnd,
      });
    } catch (err) {
      setUnfreezeError(
        err instanceof MembershipFreezeError ? err.message : "Something went wrong — please try again.",
      );
    } finally {
      setUnfreezing(false);
    }
  }

  const daysRemainingAtResume =
    freeze != null ? Math.max(0, daysBetween(freeze.frozen_from, periodEnd)) : null;
  const daysUntilAutoResume =
    freeze != null
      ? Math.max(0, daysBetween(new Date().toISOString().slice(0, 10), freeze.frozen_until))
      : null;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-3 flex items-center justify-between">
        <label className="block text-xs font-medium text-muted">
          Membership freeze
        </label>
        {currentStatus === "frozen" && <StatusBadge status="frozen" />}
      </div>

      {unfreezeResult ? (
        // A top-level branch, deliberately checked BEFORE currentStatus ===
        // "frozen" below: handleUnfreeze flips currentStatus to "active" the
        // moment it succeeds, so nesting this inside that frozen-only branch
        // (as an earlier version of this file did) made the success message
        // disappear the instant it would have appeared — the render swaps to
        // the not-frozen branch in the very same tick. This has to survive
        // that flip.
        <div className="space-y-3">
          <p className="rounded-lg bg-sage/10 p-3 text-sm text-sage-dark">
            Unfrozen — {unfreezeResult.daysCredited} day
            {unfreezeResult.daysCredited === 1 ? "" : "s"} credited. New renewal date:{" "}
            <span className="font-medium">
              {formatDate(unfreezeResult.newCurrentPeriodEnd)}
            </span>
            .
          </p>
          <button
            type="button"
            onClick={() => setUnfreezeResult(null)}
            className="focus-ring rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
          >
            Got it
          </button>
        </div>
      ) : currentStatus === "frozen" ? (
        <div className="space-y-3">
          {loadingFreeze ? (
            <p className="text-sm text-muted">Loading freeze details…</p>
          ) : freeze ? (
            <div className="rounded-lg bg-sky-500/5 p-3 text-sm">
              <p className="text-ink">
                Paused until{" "}
                <span className="font-medium">{formatDate(freeze.frozen_until)}</span>
                {daysUntilAutoResume != null && (
                  <span className="text-muted"> ({daysUntilAutoResume}d left)</span>
                )}
              </p>
              {freeze.reason && (
                <p className="mt-1 text-muted">Reason: {freeze.reason}</p>
              )}
              {daysRemainingAtResume != null && (
                <p className="mt-1 text-muted">
                  Resumes with{" "}
                  <span className="font-medium text-ink">
                    {daysRemainingAtResume} day{daysRemainingAtResume === 1 ? "" : "s"}
                  </span>{" "}
                  remaining on the current period.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No freeze record found for this membership.
            </p>
          )}

          {confirmingUnfreeze ? (
            <div className="rounded-lg border border-line bg-paper/60 p-3">
              <p className="text-sm text-ink">
                End the freeze now? They'll be credited only the days
                actually frozen so far, not the full amount originally
                requested.
              </p>
              {unfreezeError && (
                <p className="mt-2 text-xs text-ember-dark">{unfreezeError}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingUnfreeze(false)}
                  className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUnfreeze}
                  disabled={unfreezing}
                  className="focus-ring rounded-lg bg-sage px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark disabled:opacity-60"
                >
                  {unfreezing ? "Ending…" : "Confirm — end freeze"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingUnfreeze(true)}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
            >
              <PlayCircle size={14} /> End freeze early
            </button>
          )}
        </div>
      ) : showFreezeForm ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Days</label>
            <input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Reason <span className="text-muted/70">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Traveling for work"
              className="focus-ring w-full resize-none rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
          </div>
          {freezeError && <p className="text-xs text-ember-dark">{freezeError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowFreezeForm(false);
                setFreezeError("");
              }}
              className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFreeze}
              disabled={freezing}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sky-700 disabled:opacity-60"
            >
              <Snowflake size={14} /> {freezing ? "Freezing…" : "Freeze membership"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowFreezeForm(true)}
          className="focus-ring flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
        >
          <Snowflake size={14} /> Freeze membership
        </button>
      )}
    </div>
  );
}

import { useState } from "react";
import { X, Pencil, RefreshCw, PartyPopper } from "lucide-react";
import {
  logSession,
  AssignmentNotActiveError,
  SessionRejectedError,
  type LoggedSession,
} from "../../lib/coachWrites";
import { isNetworkError } from "../../lib/memberWrites";
import { computeBmi } from "../../lib/mockCoachData";
import {
  getPendingWrites,
  queuePendingWrite,
  retryPendingWrites,
} from "../../lib/offlineQueue";

// A session always writes a note server-side (training_notes.note_text has a
// non-empty CHECK, and log_session's p_note_text is required) — but the
// brief asks for the note to feel optional in the UI, so an empty field is
// silently backed by this default rather than blocking submission or lying
// about the field being required.
const DEFAULT_NOTE = "Session logged";

export function LogSessionModal({
  memberId,
  packageId,
  currentHeightCm,
  onClose,
  onSaved,
}: {
  memberId: string;
  packageId: string;
  currentHeightCm: number;
  onClose: () => void;
  // null specifically means "a queued write succeeded in the background" —
  // a retry from here never gets the RPC's return row back the way a direct
  // call does, so there are no fresh sessions_used/package_status numbers to
  // hand over; the parent should just refetch instead of trusting a guess.
  onSaved: (result: LoggedSession | null) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [noteText, setNoteText] = useState("");
  const [logMeasurement, setLogMeasurement] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(String(currentHeightCm));
  const [editingHeight, setEditingHeight] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [networkQueuedId, setNetworkQueuedId] = useState<string | null>(null);
  const [result, setResult] = useState<LoggedSession | null>(null);

  const parsedWeight = Number(weight);
  const parsedHeight = Number(height);
  const liveBmi =
    logMeasurement &&
    weight.trim() &&
    !Number.isNaN(parsedWeight) &&
    parsedHeight > 0
      ? computeBmi(parsedWeight, parsedHeight)
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (logMeasurement) {
      if (!weight.trim() || Number.isNaN(parsedWeight) || parsedWeight < 20 || parsedWeight > 500) {
        setError("Enter a realistic weight");
        return;
      }
      if (Number.isNaN(parsedHeight) || parsedHeight < 50 || parsedHeight > 300) {
        setError("Enter a realistic height");
        return;
      }
    }
    setError("");
    setSubmitting(true);

    const payload = {
      member_id: memberId,
      pt_package_id: packageId,
      note_text: noteText.trim() || DEFAULT_NOTE,
      session_date: date,
      ...(logMeasurement
        ? {
            weight_kg: Math.round(parsedWeight * 100) / 100,
            height_cm: Math.round(parsedHeight * 100) / 100,
          }
        : {}),
    };

    try {
      const loggedResult = await logSession(payload);
      setResult(loggedResult);
    } catch (err) {
      if (err instanceof AssignmentNotActiveError || err instanceof SessionRejectedError) {
        setError(err.message);
      } else if (isNetworkError(err)) {
        const id = queuePendingWrite({ kind: "log_session", payload });
        setNetworkQueuedId(id);
      } else {
        setError("Something went wrong — please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetryQueued() {
    if (!networkQueuedId) return;
    setSubmitting(true);
    await retryPendingWrites();
    const stillPending = getPendingWrites().some((w) => w.id === networkQueuedId);
    setSubmitting(false);
    if (!stillPending) {
      onSaved(null);
      onClose();
    }
  }

  if (result) {
    const justCompleted = result.packageStatus === "completed";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
        <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 text-center shadow-2xl">
          <span
            className={
              "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full " +
              (justCompleted ? "bg-sage/15 text-sage-dark" : "bg-sage/10 text-sage-dark")
            }
          >
            {justCompleted ? <PartyPopper size={22} /> : <span className="text-xl">✓</span>}
          </span>
          {justCompleted ? (
            <>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Package complete!
              </h2>
              <p className="mt-1 text-sm text-muted">
                That was the {result.sessionsPurchased}th and final session —
                nice work getting them through the whole package.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Session logged
              </h2>
              <p className="mt-1 text-sm text-muted">
                {result.sessionsUsed} of {result.sessionsPurchased} sessions used.
              </p>
            </>
          )}
          <button
            onClick={() => {
              onSaved(result);
              onClose();
            }}
            className="focus-ring mt-5 w-full rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Log session
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {networkQueuedId ? (
          <div className="rounded-lg border border-amberflag/30 bg-amberflag/10 p-4 text-sm">
            <p className="font-medium text-ink">
              Couldn't save — check your connection.
            </p>
            <p className="mt-1 text-muted">
              This session is still here and queued — it'll sync automatically
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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Note <span className="text-muted/70">(optional)</span>
              </label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder="e.g. Increased squat weight, good form throughout."
                className="focus-ring w-full resize-none rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-transparent px-1 py-1 text-sm transition-colors hover:border-line/60">
              <input
                type="checkbox"
                checked={logMeasurement}
                onChange={(e) => setLogMeasurement(e.target.checked)}
                className="focus-ring h-4 w-4 rounded border-line text-sage accent-sage"
              />
              Log a measurement too?
            </label>

            {logMeasurement && (
              <div className="space-y-4 rounded-lg bg-paper/60 p-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Weight (kg)
                  </label>
                  <input
                    inputMode="decimal"
                    value={weight}
                    onChange={(e) => {
                      setWeight(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="72.5"
                    className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-muted">
                      Height (cm)
                    </label>
                    {!editingHeight && (
                      <button
                        type="button"
                        onClick={() => setEditingHeight(true)}
                        className="focus-ring flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
                      >
                        <Pencil size={11} /> Update height
                      </button>
                    )}
                  </div>
                  {editingHeight ? (
                    <input
                      inputMode="decimal"
                      value={height}
                      onChange={(e) => {
                        setHeight(e.target.value);
                        if (error) setError("");
                      }}
                      autoFocus
                      className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
                    />
                  ) : (
                    <p className="rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-muted">
                      {currentHeightCm} cm (last recorded)
                    </p>
                  )}
                </div>

                <div
                  className={
                    liveBmi
                      ? "rounded-lg bg-sage/10 px-3 py-2.5 text-sm"
                      : "rounded-lg bg-white px-3 py-2.5 text-sm text-muted"
                  }
                >
                  {liveBmi ? (
                    <>
                      Resulting BMI:{" "}
                      <span className="font-display font-semibold text-sage-dark">
                        {liveBmi}
                      </span>
                    </>
                  ) : (
                    "Enter weight to see the resulting BMI"
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-xs text-ember-dark">{error}</p>}

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
                className="focus-ring rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Log session"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

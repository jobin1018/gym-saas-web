import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getCurrentClaims } from "../lib/authSession";

type Coach = {
  id: string;
  name: string;
  active_client_count: number;
  most_recent_session_date: string | null;
};
type Goal = "muscle_gain" | "fat_loss" | "general_fitness";

// "4 clients, active 2d ago" — purely a label for the existing dropdown
// option; not read anywhere in handleCreatePackage's write.
function workloadLabel(c: Coach): string {
  const clients = `${c.active_client_count} client${c.active_client_count === 1 ? "" : "s"}`;
  if (!c.most_recent_session_date) return `${clients}, no sessions logged yet`;
  const days = Math.floor(
    (Date.now() - new Date(c.most_recent_session_date).getTime()) / 86400000,
  );
  const recency =
    days <= 0 ? "active today" : `active ${days}d ago`;
  return `${clients}, ${recency}`;
}

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "muscle_gain", label: "Muscle gain" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "general_fitness", label: "General fitness" },
];

// Deliberately self-contained: MemberFormModal only renders this component
// and passes memberId — every real bit (coach list, the package form, its
// own submit/error handling) lives here so the parent's diff stays a single
// import + one JSX line. See MemberFormModal's own comment on why that
// isolation matters on this specific file.
export function AssignCoachSection({ memberId }: { memberId: string }) {
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
    // coaches_workload instead of coaches_directory — same active-coach
    // scoping, plus the two workload columns this dropdown now displays.
    // Display-only: handleCreatePackage below still sends only coach_id.
    supabase
      .from("coaches_workload")
      .select("id, name, active_client_count, most_recent_session_date")
      .then(({ data }) => data && setCoaches(data));
  }, []);

  async function handleCreatePackage() {
    setError("");
    if (!coachId) {
      setError("Select a coach");
      return;
    }
    const months = Number(durationMonths);
    const perMonth = Number(sessionsPerMonth);
    if (!Number.isInteger(months) || months <= 0) {
      setError("Duration must be a whole number of months greater than 0");
      return;
    }
    if (!Number.isInteger(perMonth) || perMonth <= 0) {
      setError("Sessions per month must be a whole number greater than 0");
      return;
    }
    const parsedPrice = Number(price);
    if (!price.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError("Enter a valid price");
      return;
    }

    setSubmitting(true);
    try {
      const claims = await getCurrentClaims();
      // sessions_purchased is intentionally NOT sent — the DB trigger derives
      // it as duration_months * sessions_per_month. Send it explicitly only to
      // override (e.g. a negotiated discount session).
      const { error: insertError } = await supabase.from("pt_packages").insert({
        organization_id: claims.organizationId,
        member_id: memberId,
        coach_id: coachId,
        goal,
        duration_months: months,
        sessions_per_month: perMonth,
        price: parsedPrice,
        start_date: startDate,
      });
      if (insertError) throw insertError;

      const coachName = coaches.find((c) => c.id === coachId)?.name ?? "coach";
      setSuccess(`Package created with ${coachName}.`);
    } catch {
      setError("Couldn't create the package — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-3 flex items-center justify-between">
        <label className="block text-xs font-medium text-muted">
          Assign a coach
        </label>
      </div>

      {success ? (
        <p className="text-sm text-sage-dark">{success}</p>
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

          <button
            type="button"
            onClick={handleCreatePackage}
            disabled={submitting}
            className="focus-ring w-full rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create package"}
          </button>
        </div>
      )}
    </div>
  );
}

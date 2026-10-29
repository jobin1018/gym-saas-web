import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Search, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { redeemMagicLink, MagicLinkError } from "../../lib/magicLink";
import { MagicLinkShell, type MagicLinkStep } from "../../components/MagicLinkShell";
import { RecordPaymentModal } from "../../components/RecordPaymentModal";
import {
  GOAL_OPTIONS,
  createPtPackage,
  loadCoaches,
  validatePtPackageInput,
  workloadLabel,
  type Coach,
  type Goal,
} from "../../lib/ptPackageWrites";

type MemberOption = { id: string; name: string; phone: string };
const SEARCH_RESULT_LIMIT = 8;

// The WhatsApp "ADD PT" link's destination — no PIN, no sidebar, no desktop
// chrome. Same standalone-page shape as CoachQuickLog/the /members/add page.
// Reuses ptPackageWrites.ts (validatePtPackageInput + createPtPackage) —
// the exact same rules AddPtPackageModal (Member Detail's Personal Training
// section) already enforces, just a different entry point onto them. No
// offline queue here, matching AddPtPackageModal's own current behaviour —
// that infrastructure doesn't exist for pt_packages yet (offlineQueue.ts's
// write-kind registry only knows about member/session writes), so this page
// isn't introducing an inconsistency, just not solving a pre-existing gap.
export function AddPtPackageLinkPage() {
  const [searchParams] = useSearchParams();
  const { completeLogin, claims } = useAuth();
  const canRecordPayments = claims?.role === "owner" || claims?.role === "front_desk";
  const [step, setStep] = useState<MagicLinkStep>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [staffName, setStaffName] = useState("");

  // Member picker — search-as-you-type over members(name, phone), same
  // .or(ilike) shape Members.tsx's own search uses, just not paginated: this
  // is picking ONE member on a phone screen, not browsing a full list.
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<MemberOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [coachId, setCoachId] = useState("");
  const [goal, setGoal] = useState<Goal>("general_fitness");
  const [durationMonths, setDurationMonths] = useState("3");
  const [sessionsPerMonth, setSessionsPerMonth] = useState("4");
  const [price, setPrice] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // The just-created package, so "Record payment now?" can be offered.
  const [created, setCreated] = useState<{ id: string; price: number; goal: Goal } | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    (async () => {
      // Deliberately does NOT check for a pre-existing session and skip
      // straight to "ready" on one — see AddMemberLinkPage's own comment on
      // this exact fix. That shortcut trusted ANY session already in this
      // browser (a stale PIN login, or a different magic link redeemed
      // earlier here) as proof THIS token was already used, which let a
      // still-valid link keep re-validating successfully forever and let a
      // second, unrelated link silently ride the first one's session
      // instead of being checked on its own terms. Every visit now redeems
      // the token in the URL for real, every time.
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
        const { error: sessionError } = await completeLogin(
          redeemed.access_token,
          redeemed.refresh_token,
          redeemed.name,
        );
        if (sessionError) {
          setErrorMessage(
            "Couldn't start your session — text the bot on WhatsApp again.",
          );
          setStep("error");
          return;
        }
        setStaffName(redeemed.name);
        setStep("ready");
        loadCoaches().then(setCoaches);
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

  // Debounced, same 300ms as Members.tsx's own search — server-side query
  // per keystroke would be wasteful, and a magic-link page over mobile data
  // is exactly where that cost matters most.
  useEffect(() => {
    if (selectedMember) return;
    const term = memberQuery.trim().replace(/[%,]/g, "");
    if (!term) {
      setMemberResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      supabase
        .from("members")
        .select("id, name, phone")
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(SEARCH_RESULT_LIMIT)
        .then(({ data }) => {
          setMemberResults(data ?? []);
          setSearching(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [memberQuery, selectedMember]);

  async function handleSubmit() {
    setError("");
    if (!selectedMember) {
      setError("Search for and select a member first");
      return;
    }
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
        member_id: selectedMember.id,
        coach_id: coachId,
        goal,
        duration_months: validated.parsed.months,
        sessions_per_month: validated.parsed.perMonth,
        price: validated.parsed.price,
        start_date: startDate,
      });
      setCreated({ id: packageId, price: validated.parsed.price, goal });
      setDone(true);
    } catch {
      setError("Couldn't create the package — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MagicLinkShell step={step} errorMessage={errorMessage}>
      {done ? (
        <div className="rounded-xl2 border border-line/70 bg-white p-8 text-center shadow-card">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sage/10 text-sage-dark">
            <CheckCircle2 size={28} />
          </span>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            PT package created
          </h1>
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-ink">{selectedMember?.name}</span>{" "}
            is set up with{" "}
            <span className="font-medium text-ink">
              {coaches.find((c) => c.id === coachId)?.name ?? "their coach"}
            </span>
            . You can close this page now.
          </p>
          {paid && <p className="mt-3 text-sm text-sage-dark">Payment recorded.</p>}
          {created && canRecordPayments && created.price > 0 && !paid && (
            <div className="mt-5 rounded-lg border border-line bg-paper p-4 text-left">
              <p className="text-sm font-medium">Record payment now?</p>
              <p className="mt-0.5 text-xs text-muted">
                The package stays unpaid until a payment is recorded. You can
                also do it later from the member's page.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRecord(true)}
                  className="focus-ring flex-1 rounded-lg bg-ember px-4 py-3 text-base font-medium text-white hover:bg-ember-dark"
                >
                  Record payment
                </button>
                <button
                  type="button"
                  onClick={() => setCreated(null)}
                  className="focus-ring rounded-lg px-4 py-3 text-base font-medium text-muted hover:bg-white"
                >
                  Skip
                </button>
              </div>
            </div>
          )}
          {showRecord && created && selectedMember && (
            <RecordPaymentModal
              subject={{
                kind: "pt",
                ptPackageId: created.id,
                memberName: selectedMember.name,
                label: `PT package · ${GOAL_OPTIONS.find((g) => g.value === created.goal)?.label ?? created.goal}`,
                price: created.price,
              }}
              onClose={() => setShowRecord(false)}
              onAlreadyPaid={() => setPaid(true)}
              onRecorded={() => setPaid(true)}
            />
          )}
        </div>
      ) : (
        <>
          {staffName && (
            <p className="mb-3 text-center text-sm text-muted">
              Hi <span className="font-medium text-ink">{staffName}</span> —
              set up a PT package below.
            </p>
          )}
          <div className="space-y-4 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
            {/* --- Member picker ------------------------------------------- */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Member
              </label>
              {selectedMember ? (
                <div className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-3">
                  <div>
                    <p className="text-base font-medium">{selectedMember.name}</p>
                    <p className="text-xs text-muted">{selectedMember.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMember(null);
                      setMemberQuery("");
                    }}
                    className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-white hover:text-ink"
                    aria-label="Change member"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="Search by name or phone"
                      className="focus-ring w-full rounded-lg border border-line bg-white py-3 pl-9 pr-3 text-base shadow-sm transition-shadow"
                    />
                  </div>
                  {memberQuery.trim() && (
                    <div className="mt-2 space-y-1.5">
                      {searching && (
                        <p className="px-1 text-xs text-muted">Searching…</p>
                      )}
                      {!searching &&
                        memberResults.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedMember(m)}
                            className="focus-ring flex w-full items-center justify-between rounded-lg border border-line/70 bg-white px-3 py-3 text-left transition-colors hover:border-ink/20"
                          >
                            <span>
                              <span className="block text-sm font-medium">{m.name}</span>
                              <span className="block text-xs text-muted">{m.phone}</span>
                            </span>
                          </button>
                        ))}
                      {!searching && memberResults.length === 0 && (
                        <p className="px-1 text-xs text-muted">No members found.</p>
                      )}
                      {!searching && memberResults.length === SEARCH_RESULT_LIMIT && (
                        <p className="px-1 text-xs text-muted">
                          Keep typing to narrow the results.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* --- Coach picker ---------------------------------------------- */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Coach
              </label>
              <select
                value={coachId}
                onChange={(e) => setCoachId(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
              >
                <option value="">Select a coach</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {workloadLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Goal
                </label>
                <select
                  value={goal}
                  onChange={(e) => setGoal(e.target.value as Goal)}
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
                >
                  {GOAL_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
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
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Sessions / month
                </label>
                <input
                  inputMode="numeric"
                  value={sessionsPerMonth}
                  onChange={(e) => setSessionsPerMonth(e.target.value)}
                  className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Price (₹)
              </label>
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="12000"
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-3 text-base shadow-sm transition-shadow"
              />
            </div>

            {error && <p className="text-sm text-ember-dark">{error}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="focus-ring w-full rounded-lg bg-sage px-4 py-3.5 text-base font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Creating…" : "Create package"}
            </button>
          </div>
        </>
      )}
    </MagicLinkShell>
  );
}

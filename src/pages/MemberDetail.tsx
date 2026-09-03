import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  UserX,
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import { StatusBadge } from "../components/StatusBadge";
import { Toast, type ToastState } from "../components/Toast";
import { MemberFormModal, type MemberFormInitial, type Plan } from "../components/MemberFormModal";
import { MembershipFreezeSection } from "../components/MembershipFreezeSection";
import { AddPtPackageModal } from "../components/AddPtPackageModal";
import { cancelMembership, updateWhatsappOptIn } from "../lib/memberDetail";
import { getSessionHistory, type SessionHistoryRow } from "../lib/coachWrites";

type MembershipStatus = "active" | "past_due" | "expired" | "cancelled" | "frozen";

type MembershipRow = {
  id: string;
  plan_id: string;
  status: MembershipStatus;
  current_period_end: string;
  start_date: string;
  duration_months: number;
  total_price: number | null;
  membership_plans: { id: string; name: string; amount: number; active: boolean } | null;
};

type MemberRow = {
  id: string;
  name: string;
  phone: string;
  whatsapp_opt_in: boolean;
  memberships: MembershipRow[];
};

type PtPackage = {
  id: string;
  goal: string;
  sessions_purchased: number;
  sessions_used: number;
  coach_id: string;
};

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  general_fitness: "General fitness",
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp_self: "WhatsApp (self)",
  front_desk: "Front desk",
  biometric: "Biometric",
};

const PT_PAGE_SIZE = 10;
const TX_PAGE_SIZE = 10;

// Same membership-picking rule as Members.tsx's own currentMembership() —
// duplicated locally rather than imported, since Members.tsx is under the
// standing "additive only" constraint and this page has no business
// depending on its internals.
function currentMembership(memberships: MembershipRow[]): MembershipRow | undefined {
  return (
    memberships.find((ms) => ms.status === "active" || ms.status === "frozen") ??
    [...memberships].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0]
  );
}

function DeactivateConfirmModal({
  membershipId,
  memberName,
  onClose,
  onDone,
}: {
  membershipId: string;
  memberName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await cancelMembership(membershipId);
      onDone();
      onClose();
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-sm rounded-xl2 bg-white p-6 shadow-2xl">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ember/10 text-ember-dark">
          <UserX size={20} />
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Deactivate {memberName}'s membership?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This sets their membership to cancelled. It doesn't delete the
          member record — you can still see their history here afterward.
        </p>
        {error && <p className="mt-3 text-xs text-ember-dark">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();

  const [member, setMember] = useState<MemberRow | null | undefined>(undefined);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showAddPt, setShowAddPt] = useState(false);

  const [ptPackage, setPtPackage] = useState<PtPackage | null | undefined>(undefined);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [ptHistory, setPtHistory] = useState<SessionHistoryRow[]>([]);
  const [ptTotal, setPtTotal] = useState(0);
  const [ptPage, setPtPage] = useState(0);

  const [txRows, setTxRows] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(0);

  const [attendance, setAttendance] = useState<{ id: string; checked_in_at: string; source: string }[]>([]);
  const [togglingWhatsapp, setTogglingWhatsapp] = useState(false);

  function loadMember() {
    if (!id) return;
    supabase
      .from("members")
      .select(
        "id, name, phone, whatsapp_opt_in, memberships(id, plan_id, status, current_period_end, start_date, duration_months, total_price, membership_plans(id, name, amount, active))",
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setMember((data as unknown as MemberRow) ?? null));
  }

  function loadPtPackage() {
    if (!id) return;
    supabase
      .from("pt_packages")
      .select("id, goal, sessions_purchased, sessions_used, coach_id")
      .eq("member_id", id)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => {
        setPtPackage((data as PtPackage) ?? null);
        if (data) {
          // coaches_workload/coaches_directory both filter to active coaches
          // only (users itself grants no SELECT to authenticated at all) —
          // a deactivated coach's name just won't resolve here, handled as
          // a graceful fallback below rather than a broken lookup.
          supabase
            .from("coaches_workload")
            .select("name")
            .eq("id", (data as PtPackage).coach_id)
            .maybeSingle()
            .then(({ data: coach }) => setCoachName(coach?.name ?? null));
        } else {
          setCoachName(null);
        }
      });
  }

  function loadPtHistory(page: number) {
    if (!id) return;
    getSessionHistory({ member_id: id, page, pageSize: PT_PAGE_SIZE }).then(
      ({ rows, total }) => {
        setPtHistory(rows);
        setPtTotal(total);
      },
    );
  }

  function loadTransactions(page: number) {
    if (!id) return;
    const from = page * TX_PAGE_SIZE;
    const to = from + TX_PAGE_SIZE - 1;
    supabase
      .from("v_payments_ledger")
      .select("*", { count: "exact" })
      .eq("member_id", id)
      .order("transaction_date", { ascending: false })
      .order("id")
      .range(from, to)
      .then(({ data, count }) => {
        setTxRows(data ?? []);
        setTxTotal(count ?? 0);
      });
  }

  function loadAttendance() {
    if (!id) return;
    supabase
      .from("attendance")
      .select("id, checked_in_at, source")
      .eq("member_id", id)
      .order("checked_in_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setAttendance(data ?? []));
  }

  useEffect(() => {
    loadMember();
    loadPtPackage();
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadPtHistory(ptPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ptPage, ptPackage]);

  useEffect(() => {
    loadTransactions(txPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, txPage]);

  useEffect(() => {
    supabase
      .from("membership_plans")
      .select("id, name, amount")
      .eq("active", true)
      .then(({ data }) => data && setPlans(data));
  }, []);

  async function handleWhatsappToggle() {
    if (!member) return;
    const next = !member.whatsapp_opt_in;
    setTogglingWhatsapp(true);
    try {
      await updateWhatsappOptIn(member.id, next);
      setMember({ ...member, whatsapp_opt_in: next });
    } catch {
      setToast({ kind: "error", message: "Couldn't update WhatsApp preference." });
    } finally {
      setTogglingWhatsapp(false);
    }
  }

  function editInitial(): MemberFormInitial | undefined {
    if (!member) return undefined;
    const ms = currentMembership(member.memberships);
    if (!ms) return undefined;
    return {
      member_id: member.id,
      membership_id: ms.id,
      name: member.name,
      phone: member.phone,
      plan_id: ms.plan_id,
      start_date: ms.start_date,
      status: ms.status,
      whatsapp_opt_in: member.whatsapp_opt_in,
    };
  }

  if (member === undefined) return null;

  if (member === null) {
    return (
      <div className="max-w-3xl">
        <Link to="/members" className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft size={14} /> Back to members
        </Link>
        <p className="text-sm text-muted">
          No member found for this link — they may have been removed.
        </p>
      </div>
    );
  }

  const ms = currentMembership(member.memberships);
  const plan = ms?.membership_plans;
  const isLegacyPlan = plan ? !plan.active : false;
  const ptTotalPages = Math.max(1, Math.ceil(ptTotal / PT_PAGE_SIZE));
  const txTotalPages = Math.max(1, Math.ceil(txTotal / TX_PAGE_SIZE));

  return (
    <div className="max-w-4xl">
      <Link to="/members" className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
        <ArrowLeft size={14} /> Back to members
      </Link>

      {toast && <div className="mb-4"><Toast toast={toast} onDismiss={() => setToast(null)} /></div>}

      {/* --- 1. Header --------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink/10 to-ink/[0.03] font-display text-xl font-semibold text-ink">
            {member.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{member.name}</h1>
            <p className="mt-0.5 text-sm text-muted">{member.phone}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {ms && <StatusBadge status={ms.status} />}
              {isLegacyPlan && (
                <span className="rounded-full bg-line px-2.5 py-0.5 text-xs font-medium text-muted">
                  Legacy plan
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowEdit(true)}
          className="focus-ring flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-card"
        >
          <Pencil size={15} /> Edit
        </button>
      </div>

      {/* --- 2. Membership -------------------------------------------------- */}
      <div className="mt-8 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
        <h2 className="mb-4 font-display font-semibold">Membership</h2>
        {ms ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">Plan</p>
              <p className="mt-1 font-medium">{plan?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Duration</p>
              <p className="mt-1 font-medium">
                {ms.duration_months} {ms.duration_months === 1 ? "month" : "months"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">
                {ms.status === "frozen" ? "Resumes / renews" : "Renews"}
              </p>
              <p className="mt-1 font-medium">
                {new Date(ms.current_period_end).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Price</p>
              <p className="mt-1 font-medium">
                {ms.total_price != null ? `₹${ms.total_price.toLocaleString("en-IN")}` : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">No membership on record.</p>
        )}

        {ms && ms.status !== "cancelled" && (
          <div className="mt-5 border-t border-line pt-5">
            <MembershipFreezeSection
              membershipId={ms.id}
              status={ms.status}
              currentPeriodEnd={ms.current_period_end}
              onStatusChange={(newStatus) =>
                setMember((prev) =>
                  prev
                    ? {
                        ...prev,
                        memberships: prev.memberships.map((m) =>
                          m.id === ms.id ? { ...m, status: newStatus } : m,
                        ),
                      }
                    : prev,
                )
              }
            />
            <button
              type="button"
              onClick={() => setShowDeactivate(true)}
              className="focus-ring mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ember-dark transition-colors hover:bg-ember/10"
            >
              <UserX size={14} /> Deactivate membership
            </button>
          </div>
        )}
      </div>

      {/* --- 3. Personal Training -------------------------------------------- */}
      <div className="mt-6 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-semibold">Personal Training</h2>
          {ptPackage === null && (
            <button
              onClick={() => setShowAddPt(true)}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-sage px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage"
            >
              <Plus size={14} /> Add PT Package
            </button>
          )}
        </div>

        {ptPackage === undefined ? null : ptPackage ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Goal</p>
                <p className="mt-1 font-medium">{GOAL_LABELS[ptPackage.goal] ?? ptPackage.goal}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Sessions</p>
                <p className="mt-1 font-medium">
                  {ptPackage.sessions_used} / {ptPackage.sessions_purchased}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Coach</p>
                <p className="mt-1 font-medium">{coachName ?? "No longer active"}</p>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Session history
              </h3>
              {ptHistory.length === 0 ? (
                <p className="text-sm text-muted">No sessions logged yet.</p>
              ) : (
                <div className="divide-y divide-line/70">
                  {ptHistory.map((row) => (
                    <div key={row.id} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted">
                          {new Date(row.session_date).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                        {row.measurement && (
                          <span className="rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage-dark">
                            {row.measurement.weight_kg} kg · BMI {row.measurement.bmi}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm">{row.note_text}</p>
                    </div>
                  ))}
                </div>
              )}
              {ptTotal > PT_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted">Page {ptPage + 1} of {ptTotalPages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPtPage((p) => Math.max(0, p - 1))}
                      disabled={ptPage === 0}
                      className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <button
                      onClick={() => setPtPage((p) => Math.min(ptTotalPages - 1, p + 1))}
                      disabled={ptPage >= ptTotalPages - 1}
                      className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            No active PT package.{" "}
            {ptTotal > 0 && "Past session history is preserved and visible once a new package is active."}
          </p>
        )}
      </div>

      {/* --- 4. Transactions -------------------------------------------------- */}
      <div className="mt-6 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-display font-semibold">Transactions</h2>
        </div>
        {txRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No transactions recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Amount</th>
                  <th className="px-5 py-2.5 font-medium">Transaction ID</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {txRows.map((r) => (
                  <tr key={r.id} className="border-b border-line/70 transition-colors last:border-0 hover:bg-paper/60">
                    <td className="px-5 py-3">
                      {new Date(r.transaction_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted">{r.provider_payment_id ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", r.payment_type === "personal_training" ? "bg-amberflag/15 text-amberflag" : "bg-ink/5 text-ink")}>
                        {r.payment_type === "personal_training" ? "PT" : "Membership"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={clsx(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          r.status === "failed"
                            ? "bg-ember/10 text-ember-dark"
                            : r.status === "pending"
                              ? "bg-amberflag/15 text-amberflag"
                              : "bg-sage/10 text-sage-dark",
                        )}
                      >
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 capitalize text-muted">{r.provider === "razorpay" ? "Razorpay" : "Manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {txTotal > TX_PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3">
            <span className="text-xs text-muted">Page {txPage + 1} of {txTotalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setTxPage((p) => Math.max(0, p - 1))}
                disabled={txPage === 0}
                className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <button
                onClick={() => setTxPage((p) => Math.min(txTotalPages - 1, p + 1))}
                disabled={txPage >= txTotalPages - 1}
                className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- 5. Attendance -------------------------------------------------- */}
      <div className="mt-6 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-display font-semibold">Attendance</h2>
        </div>
        {attendance.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No check-ins recorded.</p>
        ) : (
          <div className="divide-y divide-line/70">
            {attendance.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-sage" />
                  {new Date(a.checked_in_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock size={12} /> {SOURCE_LABELS[a.source] ?? a.source}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- 6. WhatsApp opt-in -------------------------------------------------- */}
      <div className="mt-6 flex items-center justify-between rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
        <div>
          <h2 className="font-display font-semibold">WhatsApp reminders</h2>
          <p className="mt-0.5 text-sm text-muted">
            {member.whatsapp_opt_in ? "Currently opted in." : "Currently opted out."}
          </p>
        </div>
        <button
          onClick={handleWhatsappToggle}
          disabled={togglingWhatsapp}
          className={clsx(
            "focus-ring relative h-7 w-12 rounded-full transition-colors duration-150 disabled:opacity-60",
            member.whatsapp_opt_in ? "bg-sage" : "bg-line",
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150",
              member.whatsapp_opt_in ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {showEdit && editInitial() && (
        <MemberFormModal
          mode="edit"
          initial={editInitial()}
          plans={plans}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            loadMember();
            setToast({ kind: "success", message: "Member updated." });
          }}
        />
      )}
      {showDeactivate && ms && (
        <DeactivateConfirmModal
          membershipId={ms.id}
          memberName={member.name}
          onClose={() => setShowDeactivate(false)}
          onDone={() => {
            loadMember();
            setToast({ kind: "success", message: "Membership deactivated." });
          }}
        />
      )}
      {showAddPt && (
        <AddPtPackageModal
          memberId={member.id}
          onClose={() => setShowAddPt(false)}
          onCreated={loadPtPackage}
        />
      )}
    </div>
  );
}

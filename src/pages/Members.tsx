import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Search, Plus, Upload, ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import clsx from "clsx";
import { StatusBadge } from "../components/StatusBadge";
import { Toast, type ToastState } from "../components/Toast";
import { MemberFormModal, type Plan } from "../components/MemberFormModal";

type MembershipStatus = "active" | "past_due" | "expired" | "cancelled" | "frozen";

type Membership = {
  id: string;
  plan_id: string;
  status: MembershipStatus;
  current_period_end: string;
  start_date: string;
};

// The task's own enumerated filter list — deliberately not a 5th "Expired"
// chip; matches memberships.status but is a curated subset, not the full
// enum. Chips within this group are OR'd (a membership has exactly one
// status, so requiring two at once would always return nothing) — Has PT
// is a separate, independently AND'd filter (see refresh()).
// selectedClass mirrors StatusBadge's own color-per-status mapping (solid
// instead of the badge's /10 tint, since a pressed chip needs to read as
// "on" at a glance) — the same color already means the same status
// everywhere else on this page.
const STATUS_FILTER_OPTIONS: { value: MembershipStatus; label: string; selectedClass: string }[] = [
  { value: "active", label: "Active", selectedClass: "bg-sage text-white" },
  { value: "past_due", label: "Overdue", selectedClass: "bg-amberflag text-white" },
  { value: "frozen", label: "Frozen", selectedClass: "bg-sky-500 text-white" },
  { value: "cancelled", label: "Cancelled", selectedClass: "bg-muted text-white" },
];

type Member = {
  id: string;
  name: string;
  phone: string;
  whatsapp_opt_in: boolean;
  memberships: Membership[];
};

const PAGE_SIZE = 20;

// Members can have more than one membership row (e.g. an old cancelled one),
// so pick the one that's still open, falling back to the most recently
// started if none are active — good enough for a single-plan gym, not a
// real subscription-history model.
function currentMembership(m: Member): Membership | undefined {
  return (
    m.memberships.find((ms) => ms.status === "active") ??
    [...m.memberships].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0]
  );
}

export function Members() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  // Debounced so server-side search doesn't fire a query per keystroke —
  // the old client-side .filter() had no such cost, but a real query does.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // "add" only now — clicking a row navigates to /members/:id instead of
  // opening an edit modal directly (Member Detail is the hub; its own Edit
  // button is what opens MemberFormModal in edit mode now).
  const [modal, setModal] = useState<"add" | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set());
  const [activePtIds, setActivePtIds] = useState<Set<string>>(new Set());
  // Chips within this set are OR'd (see STATUS_FILTER_OPTIONS's comment);
  // Has PT is independent and AND'd on top of whatever's selected here.
  const [statusFilters, setStatusFilters] = useState<Set<MembershipStatus>>(new Set());
  const [hasPtFilter, setHasPtFilter] = useState(false);

  function toggleStatusFilter(status: MembershipStatus) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  async function refresh() {
    // Same established pattern as coachWrites.getSessionHistory():
    // .range(from, to) + { count: 'exact' } + deterministic ordering (name,
    // then id as a tiebreak so paging stays stable when names repeat).
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Has PT can't be expressed as a column on `members` itself — resolve
    // the qualifying id set from v_members_pt_status first (same view the
    // PT badge already reads), then constrain the main query to it. Same
    // RLS scoping as `members` (security_invoker), so this never leaks
    // ids outside what the caller could already see.
    let ptFilterIds: string[] | null = null;
    if (hasPtFilter) {
      const { data } = await supabase
        .from("v_members_pt_status")
        .select("id")
        .eq("has_active_pt", true);
      ptFilterIds = (data ?? []).map((r) => r.id);
      if (ptFilterIds.length === 0) {
        setMembers([]);
        setTotal(0);
        setActivePtIds(new Set());
        return;
      }
    }

    // memberships(...) only becomes memberships!inner(...) when a status
    // filter is active — !inner turns the embed into a real join, so a
    // .in() on memberships.status filters which MEMBERS rows come back at
    // all (not just which embedded rows are nested inside each member, which
    // is all a plain .eq()/.in() on an embedded LEFT JOIN column would do).
    // Left exactly as it was — a LEFT JOIN, no filter — when no status chip
    // is selected, so the unfiltered path is byte-identical to before.
    const membershipsEmbed =
      statusFilters.size > 0
        ? "memberships!inner(id, plan_id, status, current_period_end, start_date)"
        : "memberships(id, plan_id, status, current_period_end, start_date)";

    let q = supabase
      .from("members")
      .select(`id, name, phone, whatsapp_opt_in, ${membershipsEmbed}`, { count: "exact" });
    if (debouncedQuery.trim()) {
      const term = debouncedQuery.trim().replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    }
    if (statusFilters.size > 0) {
      q = q.in("memberships.status", [...statusFilters]);
    }
    if (ptFilterIds) {
      q = q.in("id", ptFilterIds);
    }
    q.order("name")
      .order("id")
      .range(from, to)
      .then(({ data, count }) => {
        const rows = (data as unknown as Member[]) ?? [];
        setMembers(rows);
        setTotal(count ?? rows.length);

        // has_active_pt sourced from v_members_pt_status for just this
        // page's ids — one batched query instead of a per-row lookup.
        // (When the Has PT filter is on, every row on the page is already
        // known to qualify — ptFilterIds — but re-deriving the badge set
        // from the same page ids keeps this one code path correct either
        // way, rather than special-casing "trust the filter" vs "look it
        // up": the query is cheap and it's one fewer thing that could drift.)
        if (rows.length > 0) {
          supabase
            .from("v_members_pt_status")
            .select("id, has_active_pt")
            .in("id", rows.map((r) => r.id))
            .then(({ data: ptData }) => {
              setActivePtIds(
                new Set((ptData ?? []).filter((p) => p.has_active_pt).map((p) => p.id)),
              );
            });
        } else {
          setActivePtIds(new Set());
        }
      });

    // The schema only records a check-in timestamp, no check-out — so this
    // is "checked in at some point today", not "currently in the building".
    // Org-wide, not page-scoped — cheap, and correct as a lookup regardless
    // of which page is showing.
    supabase
      .from("attendance")
      .select("member_id")
      .gte("checked_in_at", new Date().toISOString().slice(0, 10))
      .then(
        ({ data }) =>
          data && setCheckedInToday(new Set(data.map((a) => a.member_id))),
      );
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // A new search or filter resets to page 0 — staying on e.g. page 3 of a
  // full list while a narrower search/filter renders would just show an
  // empty page.
  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, statusFilters, hasPtFilter]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery, statusFilters, hasPtFilter]);

  useEffect(() => {
    supabase
      .from("membership_plans")
      .select("id, name, amount")
      .eq("active", true)
      .then(({ data }) => data && setPlans(data));
  }, []);

  function handleSaved() {
    refresh();
    setToast({ kind: "success", message: "Member added." });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Members
        </h1>
        <div className="flex gap-2">
          <Link
            to="/members/import"
            className="focus-ring flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-card"
          >
            <Upload size={16} /> Import CSV
          </Link>
          <button
            onClick={() => setModal("add")}
            className="focus-ring flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-ember-dark hover:shadow-glow-ember active:translate-y-0"
          >
            <Plus size={16} /> Add member
          </button>
        </div>
      </div>

      {toast && <div className="mt-4"><Toast toast={toast} onDismiss={() => setToast(null)} /></div>}

      <div className="relative mt-5">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          className="focus-ring w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm transition-shadow focus:shadow-card"
        />
      </div>

      {/* Toggle-able chips, not a <select> — these combine (Active + Has PT
          is a real, useful combination), which a single mutually-exclusive
          dropdown can't express. Selected = filled in that status's own
          StatusBadge color, so a chip reads as "this filter is on" the same
          way the badge already reads as "this is the status" elsewhere on
          this list. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTER_OPTIONS.map((opt) => {
          const selected = statusFilters.has(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleStatusFilter(opt.value)}
              className={clsx(
                "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                selected
                  ? clsx("border-transparent", opt.selectedClass)
                  : "border-line bg-white text-muted hover:border-ink/20 hover:text-ink",
              )}
            >
              {opt.label}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        <button
          onClick={() => setHasPtFilter((v) => !v)}
          className={clsx(
            "focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
            hasPtFilter
              ? "border-transparent bg-amberflag text-white"
              : "border-line bg-white text-muted hover:border-ink/20 hover:text-ink",
          )}
        >
          <Dumbbell size={11} /> Has PT
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {members.map((m) => {
          const ms = currentMembership(m);
          const isCheckedIn = checkedInToday.has(m.id);
          const hasActivePt = activePtIds.has(m.id);
          return (
            <button
              key={m.id}
              onClick={() => navigate(`/members/${m.id}`)}
              className="focus-ring flex w-full items-center justify-between rounded-xl2 border border-line/70 bg-white px-5 py-3.5 text-left shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-line hover:shadow-card-hover"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink/10 to-ink/[0.03] font-display text-sm font-semibold text-ink">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted">{m.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isCheckedIn && (
                  <span className="flex items-center gap-1.5 rounded-full bg-sage/10 px-2.5 py-0.5 text-xs text-sage-dark">
                    <span className="h-1.5 w-1.5 rounded-full bg-sage" />
                    In today
                  </span>
                )}
                {hasActivePt && (
                  <span className="flex items-center gap-1.5 rounded-full bg-amberflag/15 px-2.5 py-0.5 text-xs text-amberflag">
                    <Dumbbell size={11} />
                    PT active
                  </span>
                )}
                {m.whatsapp_opt_in && (
                  <span className="rounded-full bg-sage/10 px-2.5 py-0.5 text-xs text-sage-dark">
                    WhatsApp on
                  </span>
                )}
                {ms && <StatusBadge status={ms.status} />}
              </div>
            </button>
          );
        })}
        {members.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            No members found.
          </p>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted">
            {total} member{total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {modal === "add" && (
        <MemberFormModal
          mode="add"
          plans={plans}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

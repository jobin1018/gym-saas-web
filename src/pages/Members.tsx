import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Search, Plus, Upload } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { Toast, type ToastState } from "../components/Toast";
import {
  MemberFormModal,
  type MemberFormInitial,
  type Plan,
} from "../components/MemberFormModal";

type Membership = {
  id: string;
  plan_id: string;
  status: "active" | "past_due" | "expired" | "cancelled";
  current_period_end: string;
  start_date: string;
};

type Member = {
  id: string;
  name: string;
  phone: string;
  whatsapp_opt_in: boolean;
  memberships: Membership[];
};

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
  const [members, setMembers] = useState<Member[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set());

  function refresh() {
    supabase
      .from("members")
      .select(
        "id, name, phone, whatsapp_opt_in, memberships(id, plan_id, status, current_period_end, start_date)",
      )
      .order("name")
      .then(({ data }) => data && setMembers(data as any));

    // The schema only records a check-in timestamp, no check-out — so this
    // is "checked in at some point today", not "currently in the building".
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
    refresh();
    supabase
      .from("membership_plans")
      .select("id, name, amount")
      .eq("active", true)
      .then(({ data }) => data && setPlans(data));
  }, []);

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.phone.includes(query),
  );

  function openEdit(member: Member) {
    setEditing(member);
    setModal("edit");
  }

  function editInitial(): MemberFormInitial | undefined {
    if (!editing) return undefined;
    const ms = currentMembership(editing);
    if (!ms) return undefined;
    return {
      member_id: editing.id,
      membership_id: ms.id,
      name: editing.name,
      phone: editing.phone,
      plan_id: ms.plan_id,
      start_date: ms.start_date,
      status: ms.status,
      whatsapp_opt_in: editing.whatsapp_opt_in,
    };
  }

  function handleSaved(kind: "add" | "edit") {
    refresh();
    setToast({
      kind: "success",
      message: kind === "add" ? "Member added." : "Member updated.",
    });
  }

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

      <div className="mt-5 space-y-2">
        {filtered.map((m) => {
          const ms = currentMembership(m);
          const isCheckedIn = checkedInToday.has(m.id);
          return (
            <button
              key={m.id}
              onClick={() => openEdit(m)}
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
        {filtered.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            No members found.
          </p>
        )}
      </div>

      {modal === "add" && (
        <MemberFormModal
          mode="add"
          plans={plans}
          onClose={() => setModal(null)}
          onSaved={() => handleSaved("add")}
        />
      )}
      {modal === "edit" && editInitial() && (
        <MemberFormModal
          mode="edit"
          initial={editInitial()}
          plans={plans}
          onClose={() => setModal(null)}
          onSaved={() => handleSaved("edit")}
        />
      )}
    </div>
  );
}

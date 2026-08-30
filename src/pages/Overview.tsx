import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";

type Renewal = {
  id: string;
  // The signup-time snapshot (plan.amount * duration_months), not a live
  // plan.amount lookup — a renewal can now span multiple months and the
  // plan's rate may have changed since signup. See
  // 20260829099000_move_duration_to_memberships.sql.
  total_price: number | null;
  current_period_end: string;
  status: "active" | "past_due" | "expired" | "cancelled";
  members: { name: string; phone: string };
};

export function Overview() {
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [checkinsToday, setCheckinsToday] = useState(0);

  useEffect(() => {
    supabase
      .from("memberships")
      .select(
        "id, total_price, current_period_end, status, members(name, phone)",
      )
      .order("current_period_end", { ascending: true })
      .limit(20)
      .then(({ data }) => data && setRenewals(data as any));

    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .gte("checked_in_at", new Date().toISOString().slice(0, 10))
      .then(({ count }) => setCheckinsToday(count ?? 0));
  }, []);

  const overdue = renewals.filter((r) => r.status === "past_due");
  const overdueAmount = overdue.reduce(
    (sum, r) => sum + Number(r.total_price ?? 0),
    0,
  );

  // Upcoming = renewal date falls in the next 7 days and hasn't already
  // lapsed. Deliberately excludes past_due (shown in "Overdue amount"
  // instead) so the two stats don't double-count the same renewal, and the
  // label avoids the word "due" so it doesn't read like it overlaps with
  // the past_due "Payment due" badge shown in the table below.
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dueThisWeek = renewals.filter((r) => {
    if (r.status === "cancelled" || r.status === "past_due") return false;
    const due = new Date(r.current_period_end);
    return due >= now && due <= weekFromNow;
  });

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Overview
      </h1>
      <p className="mt-1 text-sm text-muted">
        {new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>

      <div
        className={clsx(
          "mt-6 grid gap-4",
          isOwner ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <StatCard
          label="Upcoming renewals (next 7 days)"
          value={String(dueThisWeek.length)}
          icon={<Users size={16} />}
        />
        {isOwner && (
          <StatCard
            label="Overdue amount"
            value={`₹${overdueAmount.toLocaleString("en-IN")}`}
            tone="warn"
            icon={<AlertTriangle size={16} />}
          />
        )}
        <StatCard
          label="Check-ins today"
          value={String(checkinsToday)}
          tone="good"
          icon={<CheckCircle2 size={16} />}
        />
      </div>

      <div className="mt-8 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-display font-semibold">Renewals</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-5 py-2.5 font-medium">Member</th>
              <th className="px-5 py-2.5 font-medium">Amount</th>
              <th className="px-5 py-2.5 font-medium">Due</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {renewals.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line/70 transition-colors last:border-0 hover:bg-paper/60"
              >
                <td className="px-5 py-3.5">
                  <p className="font-medium">{r.members?.name}</p>
                  <p className="text-xs text-muted">{r.members?.phone}</p>
                </td>
                <td className="px-5 py-3.5">
                  ₹{Number(r.total_price ?? 0).toLocaleString("en-IN")}
                </td>
                <td className="px-5 py-3.5">
                  {new Date(r.current_period_end).toLocaleDateString("en-IN")}
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {renewals.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted">
                  No renewals to show yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

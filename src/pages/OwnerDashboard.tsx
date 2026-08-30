import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import {
  Users,
  Dumbbell,
  IndianRupee,
  Wallet,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { StatCard } from "../components/StatCard";

type MonthKey = "this" | "last";

function monthBounds(offset: 0 | -1) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

type RevenueRow = {
  day: string;
  source: "membership" | "pt_package";
  total: number;
};

type CoachRow = {
  id: string;
  name: string;
  activeClients: number;
  loggedRecently: boolean;
};

type AttentionRow = {
  id: string;
  member_name: string;
  coach_name: string;
  sessions_remaining: number;
  sessions_purchased: number;
  days_until_end: number;
  low_sessions: boolean;
  expiring_soon: boolean;
};

export function OwnerDashboard() {
  const [month, setMonth] = useState<MonthKey>("this");
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([]);
  const [totalMembers, setTotalMembers] = useState<number | null>(null);
  const [activePtMembers, setActivePtMembers] = useState<number | null>(null);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [attention, setAttention] = useState<AttentionRow[]>([]);

  useEffect(() => {
    // v_daily_revenue_by_source already does the "successful payments,
    // grouped by day + source" aggregation — reused rather than re-derived
    // client-side from raw payments rows. Same monthBounds(-1) cutoff
    // Revenue.tsx uses, so one fetch covers both period toggle positions.
    const { start } = monthBounds(-1);
    supabase
      .from("v_daily_revenue_by_source")
      .select("day, source, total")
      .gte("day", start.toISOString().slice(0, 10))
      .then(({ data }) => data && setRevenueRows(data as RevenueRow[]));

    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setTotalMembers(count ?? 0));

    supabase
      .from("v_members_pt_status")
      .select("id", { count: "exact", head: true })
      .eq("has_active_pt", true)
      .then(({ count }) => setActivePtMembers(count ?? 0));

    // Per-coach breakdown: two batched queries (not one per coach) —
    // active-package counts and recent-note coach_ids — then reduced
    // client-side against the coach list. Same "avoid per-row lookups"
    // principle as Members.tsx's PT-flag sourcing.
    Promise.all([
      supabase.from("coaches_directory").select("id, name"),
      supabase.from("pt_packages").select("coach_id").eq("status", "active"),
      supabase
        .from("training_notes")
        .select("coach_id")
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 86400000).toISOString(),
        ),
    ]).then(([coachesRes, activeRes, notesRes]) => {
      const activeCounts = new Map<string, number>();
      for (const row of activeRes.data ?? []) {
        activeCounts.set(row.coach_id, (activeCounts.get(row.coach_id) ?? 0) + 1);
      }
      const recentlyLogged = new Set((notesRes.data ?? []).map((r) => r.coach_id));
      setCoaches(
        (coachesRes.data ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          activeClients: activeCounts.get(c.id) ?? 0,
          loggedRecently: recentlyLogged.has(c.id),
        })),
      );
    });

    // Already fully scoped server-side: owner-only, active packages that
    // are low on sessions or expiring soon — see
    // 20260829091*_pt_coaching_rls_policies / v_pt_packages_attention.
    supabase
      .from("v_pt_packages_attention")
      .select(
        "id, member_name, coach_name, sessions_remaining, sessions_purchased, days_until_end, low_sessions, expiring_soon",
      )
      .then(({ data }) => data && setAttention(data as AttentionRow[]));
  }, []);

  const { start: thisStart, end: thisEnd } = monthBounds(0);
  const { start: lastStart, end: lastEnd } = monthBounds(-1);
  const [rangeStart, rangeEnd] =
    month === "this" ? [thisStart, thisEnd] : [lastStart, lastEnd];

  const scoped = useMemo(
    () =>
      revenueRows.filter((r) => {
        const day = new Date(r.day);
        return day >= rangeStart && day < rangeEnd;
      }),
    [revenueRows, rangeStart, rangeEnd],
  );

  const membershipRevenue = scoped
    .filter((r) => r.source === "membership")
    .reduce((sum, r) => sum + Number(r.total), 0);
  const ptRevenue = scoped
    .filter((r) => r.source === "pt_package")
    .reduce((sum, r) => sum + Number(r.total), 0);
  const totalRevenue = membershipRevenue + ptRevenue;

  // One bar per day in range, membership + pt_package stacked.
  const chartData = useMemo(() => {
    const byDay = new Map<string, { day: number; membership: number; pt_package: number }>();
    for (const r of scoped) {
      const key = r.day;
      const day = new Date(r.day).getDate();
      const entry = byDay.get(key) ?? { day, membership: 0, pt_package: 0 };
      entry[r.source] += Number(r.total);
      byDay.set(key, entry);
    }
    return [...byDay.values()].sort((a, b) => a.day - b.day);
  }, [scoped]);

  const sortedAttention = useMemo(
    () =>
      [...attention].sort((a, b) => {
        // Most urgent first: expiring soonest, then fewest sessions left.
        if (a.expiring_soon !== b.expiring_soon) return a.expiring_soon ? -1 : 1;
        if (a.expiring_soon && b.expiring_soon) return a.days_until_end - b.days_until_end;
        return a.sessions_remaining - b.sessions_remaining;
      }),
    [attention],
  );

  const noPtMembers =
    totalMembers != null && activePtMembers != null ? totalMembers - activePtMembers : null;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Owner dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Members, revenue split, coach activity, and what needs your
            attention.
          </p>
        </div>
        <div className="flex rounded-lg border border-line bg-white p-1 shadow-sm">
          {(["this", "last"] as MonthKey[]).map((m) => (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
                month === m
                  ? "bg-ember text-white shadow-glow-ember"
                  : "text-muted hover:text-ink",
              )}
            >
              {m === "this" ? "This month" : "Last month"}
            </button>
          ))}
        </div>
      </div>

      {/* Member counts */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total members"
          value={totalMembers == null ? "—" : String(totalMembers)}
          icon={<Users size={16} />}
        />
        <StatCard
          label="Active PT"
          value={activePtMembers == null ? "—" : String(activePtMembers)}
          tone="good"
          icon={<Dumbbell size={16} />}
        />
        <StatCard
          label="No PT package"
          value={noPtMembers == null ? "—" : String(noPtMembers)}
          icon={<Users size={16} />}
        />
      </div>

      {/* Revenue split */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={`${month === "this" ? "This" : "Last"} month — total`}
          value={`₹${totalRevenue.toLocaleString("en-IN")}`}
          tone="good"
          icon={<IndianRupee size={16} />}
        />
        <StatCard
          label="Membership revenue"
          value={`₹${membershipRevenue.toLocaleString("en-IN")}`}
          icon={<Wallet size={16} />}
        />
        <StatCard
          label="PT revenue"
          value={`₹${ptRevenue.toLocaleString("en-IN")}`}
          icon={<Dumbbell size={16} />}
        />
      </div>

      <div className="mt-6 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
        <h2 className="mb-4 font-display font-semibold">
          Revenue by source
        </h2>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No successful payments in this period.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E6E1" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12, fill: "#6B7370" }}
                axisLine={{ stroke: "#E4E6E1" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6B7370" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(20,24,26,0.03)" }}
                formatter={(value, key) => [
                  `₹${Number(value).toLocaleString("en-IN")}`,
                  key === "membership" ? "Membership" : "PT",
                ]}
                labelFormatter={(day) => `Day ${day}`}
                contentStyle={{
                  borderRadius: 12,
                  borderColor: "#E4E6E1",
                  fontSize: 13,
                  boxShadow: "0 10px 24px -14px rgba(20,24,26,0.25)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value) => (value === "membership" ? "Membership" : "PT")}
              />
              <Bar dataKey="membership" stackId="rev" fill="#E8623D" radius={[0, 0, 0, 0]} />
              <Bar dataKey="pt_package" stackId="rev" fill="#4E9A6B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-coach breakdown */}
      <div className="mt-8">
        <h2 className="mb-3 font-display font-semibold">Coaches</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {coaches.map((c) => (
            <div
              key={c.id}
              className="rounded-xl2 border border-line/70 bg-white p-5 shadow-card"
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.name}</p>
                <span
                  className={clsx(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    c.loggedRecently ? "bg-sage/10 text-sage-dark" : "bg-line text-muted",
                  )}
                >
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full",
                      c.loggedRecently ? "bg-sage" : "bg-muted",
                    )}
                  />
                  {c.loggedRecently ? "Logging sessions" : "No activity in 7 days"}
                </span>
              </div>
              <p className="mt-3 font-display text-2xl font-semibold tracking-tight">
                {c.activeClients}
                <span className="ml-1 text-sm font-normal text-muted">
                  active client{c.activeClients === 1 ? "" : "s"}
                </span>
              </p>
            </div>
          ))}
          {coaches.length === 0 && (
            <p className="col-span-2 rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
              No coaches yet.
            </p>
          )}
        </div>
      </div>

      {/* Needs attention */}
      <div className="mt-8 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-display font-semibold">Needs attention</h2>
          <p className="mt-0.5 text-xs text-muted">
            PT packages running low on sessions or ending within a week.
          </p>
        </div>
        <div className="divide-y divide-line/70">
          {sortedAttention.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between px-5 py-3.5"
            >
              <div>
                <p className="font-medium">{row.member_name}</p>
                <p className="text-xs text-muted">Coach: {row.coach_name}</p>
              </div>
              <div className="flex items-center gap-2">
                {row.low_sessions && (
                  <span className="flex items-center gap-1.5 rounded-full bg-amberflag/15 px-2.5 py-0.5 text-xs font-medium text-amberflag">
                    <AlertTriangle size={11} />
                    {row.sessions_remaining} of {row.sessions_purchased} left
                  </span>
                )}
                {row.expiring_soon && (
                  <span
                    className={clsx(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      row.days_until_end <= 3
                        ? "bg-ember/10 text-ember-dark"
                        : "bg-amberflag/15 text-amberflag",
                    )}
                  >
                    <Clock size={11} />
                    {row.days_until_end <= 0
                      ? "Ends today"
                      : `Ends in ${row.days_until_end}d`}
                  </span>
                )}
              </div>
            </div>
          ))}
          {sortedAttention.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Nothing needs attention right now.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase";
import { StatCard } from "../components/StatCard";
import { IndianRupee, Receipt } from "lucide-react";
import clsx from "clsx";

type DailyRevenue = {
  day: string;
  total: number;
  payment_count: number;
};

type MonthKey = "this" | "last";

function monthBounds(offset: 0 | -1) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

export function Revenue() {
  const [daily, setDaily] = useState<DailyRevenue[]>([]);
  const [month, setMonth] = useState<MonthKey>("this");

  useEffect(() => {
    // v_daily_revenue already does the "success payments grouped by day"
    // aggregation this page needs — reusing it instead of re-deriving the
    // same grouping client-side from raw `payments` rows.
    const { start } = monthBounds(-1);
    supabase
      .from("v_daily_revenue")
      .select("day, total, payment_count")
      .gte("day", start.toISOString().slice(0, 10))
      .order("day", { ascending: true })
      .then(({ data }) => data && setDaily(data));
  }, []);

  const { start: thisStart, end: thisEnd } = monthBounds(0);
  const { start: lastStart, end: lastEnd } = monthBounds(-1);
  const [rangeStart, rangeEnd] =
    month === "this" ? [thisStart, thisEnd] : [lastStart, lastEnd];

  const scoped = useMemo(
    () =>
      daily.filter((d) => {
        const day = new Date(d.day);
        return day >= rangeStart && day < rangeEnd;
      }),
    [daily, rangeStart, rangeEnd],
  );

  const totalRevenue = scoped.reduce((sum, d) => sum + Number(d.total ?? 0), 0);
  const totalPayments = scoped.reduce((sum, d) => sum + d.payment_count, 0);

  const chartData = scoped.map((d) => ({
    day: new Date(d.day).getDate(),
    total: Number(d.total ?? 0),
  }));

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Revenue
          </h1>
          <p className="mt-1 text-sm text-muted">
            {month === "this" ? "This month" : "Last month"} —{" "}
            <span className="font-medium text-ink">
              ₹{totalRevenue.toLocaleString("en-IN")}
            </span>{" "}
            collected
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

      <div className="mt-6 grid grid-cols-2 gap-4">
        <StatCard
          label="Total revenue"
          value={`₹${totalRevenue.toLocaleString("en-IN")}`}
          tone="good"
          icon={<IndianRupee size={16} />}
        />
        <StatCard
          label="Payments received"
          value={String(totalPayments)}
          icon={<Receipt size={16} />}
        />
      </div>

      {/* The schema's `payments` table has no field distinguishing an
          on-time payment from one collected after a reminder nudge (no
          "channel"/"triggered_by" column), so that breakdown the brief asked
          for isn't derivable without a schema change — showing total only. */}

      <div className="mt-8 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
        <h2 className="mb-4 font-display font-semibold">Daily collections</h2>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            No successful payments recorded yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <defs>
                <linearGradient id="revenueBarFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E8623D" stopOpacity={1} />
                  <stop offset="100%" stopColor="#E8623D" stopOpacity={0.55} />
                </linearGradient>
              </defs>
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
                formatter={(value) => [
                  `₹${Number(value).toLocaleString("en-IN")}`,
                  "Collected",
                ]}
                labelFormatter={(day) => `Day ${day}`}
                contentStyle={{
                  borderRadius: 12,
                  borderColor: "#E4E6E1",
                  fontSize: 13,
                  boxShadow: "0 10px 24px -14px rgba(20,24,26,0.25)",
                }}
              />
              <Bar
                dataKey="total"
                fill="url(#revenueBarFill)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-display font-semibold">Daily revenue</h2>
        </div>
        {scoped.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No data for this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 font-medium">Payments</th>
                <th className="px-5 py-2.5 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...scoped].reverse().map((d) => (
                <tr
                  key={d.day}
                  className="border-b border-line/70 transition-colors last:border-0 hover:bg-paper/60"
                >
                  <td className="px-5 py-3.5">
                    {new Date(d.day).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-5 py-3.5">{d.payment_count}</td>
                  <td className="px-5 py-3.5">
                    ₹{Number(d.total ?? 0).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Ruler,
  Scale,
  Activity,
} from "lucide-react";
import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import clsx from "clsx";
import { supabase } from "../../lib/supabase";
import {
  getSessionHistory,
  type LoggedSession,
  type SessionHistoryRow,
} from "../../lib/coachWrites";
import { StatCard } from "../../components/StatCard";
import { ProgressBar } from "../coach/ProgressBar";
import { LogSessionModal } from "./LogSessionModal";

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  general_fitness: "General fitness",
};

const PACKAGE_STATUS_STYLE: Record<string, string> = {
  active: "bg-sage/10 text-sage-dark",
  completed: "bg-line text-muted",
  cancelled: "bg-ember/10 text-ember-dark",
};

const AVATAR_TONES = [
  "from-ember to-ember-dark",
  "from-sage to-sage-dark",
  "from-amberflag to-ember",
];

function avatarTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

const PAGE_SIZE = 10;
// Session counts are small and bounded per member/coach (same assumption
// getSessionHistory's own pagination design is built on) — one broad fetch
// covers "the whole history" for the chart in practice without needing a
// separate unbounded query shape.
const CHART_FETCH_SIZE = 500;

type PackageRow = {
  id: string;
  goal: string;
  sessions_purchased: number;
  sessions_used: number;
  start_date: string;
  status: "active" | "completed" | "cancelled";
  members: { id: string; name: string; phone: string } | null;
};

export function ClientDetail() {
  const { packageId } = useParams();
  const [pkg, setPkg] = useState<PackageRow | null | undefined>(undefined);
  const [chartRows, setChartRows] = useState<SessionHistoryRow[]>([]);
  const [historyRows, setHistoryRows] = useState<SessionHistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [showLogModal, setShowLogModal] = useState(false);

  function loadPackage() {
    if (!packageId) return;
    supabase
      .from("pt_packages")
      .select(
        "id, goal, sessions_purchased, sessions_used, start_date, status, members(id, name, phone)",
      )
      .eq("id", packageId)
      .maybeSingle()
      .then(({ data }) => setPkg((data as unknown as PackageRow) ?? null));
  }

  useEffect(() => {
    loadPackage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId]);

  const memberId = pkg?.members?.id;

  // Both the chart and the paginated list go through the same
  // getSessionHistory() shape (training_notes left-joined to its optional
  // body_measurements row) — never a bare body_measurements query — so the
  // two can never disagree about what happened in a session.
  function loadChartData(forMemberId: string) {
    getSessionHistory({ member_id: forMemberId, page: 0, pageSize: CHART_FETCH_SIZE }).then(
      ({ rows }) => setChartRows(rows),
    );
  }

  function loadHistoryPage(forMemberId: string, forPage: number) {
    getSessionHistory({ member_id: forMemberId, page: forPage, pageSize: PAGE_SIZE }).then(
      ({ rows, total }) => {
        setHistoryRows(rows);
        setHistoryTotal(total);
      },
    );
  }

  useEffect(() => {
    if (memberId) {
      loadChartData(memberId);
      loadHistoryPage(memberId, page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, page]);

  if (pkg === undefined) {
    return null; // loading
  }

  if (pkg === null) {
    return (
      <div className="max-w-2xl">
        <Link
          to="/coach"
          className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} /> Back to clients
        </Link>
        <p className="text-sm text-muted">
          No client found for this link — it may not be assigned to you.
        </p>
      </div>
    );
  }

  const isActive = pkg.status === "active";
  const totalPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));

  // Chart wants oldest-first; getSessionHistory returns newest-first.
  const chartPoints = [...chartRows]
    .reverse()
    .filter((r) => r.measurement)
    .map((r) => ({
      label: new Date(r.measurement!.recorded_at).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
      }),
      weight: r.measurement!.weight_kg,
      bmi: r.measurement!.bmi,
    }));
  const latestMeasurement = chartRows.find((r) => r.measurement)?.measurement;
  const weeksSinceStart = Math.floor(
    (Date.now() - new Date(pkg.start_date).getTime()) / (7 * 86400000),
  );

  function refetchAfterLog() {
    if (memberId) {
      loadChartData(memberId);
      loadHistoryPage(memberId, page);
    }
  }

  function handleSessionSaved(result: LoggedSession | null) {
    if (result) {
      setPkg((prev) =>
        prev
          ? {
              ...prev,
              sessions_used: result.sessionsUsed,
              sessions_purchased: result.sessionsPurchased,
              status: result.packageStatus,
            }
          : prev,
      );
    } else {
      // Queued write resolved in the background with no return row — the
      // package's own numbers need a real refetch, not a guess.
      loadPackage();
    }
    refetchAfterLog();
  }

  return (
    <div className="max-w-4xl">
      <Link
        to="/coach"
        className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to clients
      </Link>

      {!isActive && (
        <div className="mb-6 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-muted">
          This package is <span className="font-medium text-ink">{pkg.status}</span> —
          shown as read-only history. Logging a new session isn't available
          once an assignment is no longer active.
        </div>
      )}

      {/* a. Basic info header */}
      <div className="flex flex-wrap items-center gap-4">
        {pkg.members ? (
          <>
            <span
              className={clsx(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-xl font-semibold text-white",
                avatarTone(pkg.members.id),
              )}
            >
              {pkg.members.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {pkg.members.name}
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                {pkg.members.phone} · {GOAL_LABELS[pkg.goal] ?? pkg.goal}
              </p>
            </div>
          </>
        ) : (
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {GOAL_LABELS[pkg.goal] ?? pkg.goal} package
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Member details aren't available for this package.
            </p>
          </div>
        )}
        <span
          className={clsx(
            "ml-auto rounded-full px-2.5 py-1 text-xs font-medium",
            PACKAGE_STATUS_STYLE[pkg.status] ?? "bg-line text-muted",
          )}
        >
          {pkg.status}
        </span>
      </div>

      {/* b. Training structure summary */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
          <span className="text-sm text-muted">Sessions</span>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
            {pkg.sessions_used}
            <span className="text-lg text-muted">/{pkg.sessions_purchased}</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={pkg.sessions_used} max={pkg.sessions_purchased} />
          </div>
        </div>
        <StatCard
          label="Weeks since start"
          value={String(Math.max(0, weeksSinceStart))}
          icon={<Calendar size={16} />}
        />
        <StatCard
          label="Package started"
          value={new Date(pkg.start_date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          icon={<Calendar size={16} />}
        />
      </div>
      {/* No weeks_total/end_date column exists on pt_packages yet, so there's
          no real "X of Y weeks" or "remaining" figure to show — only
          "elapsed" is honestly derivable from start_date alone. */}

      {pkg.members && (
        <>
          {/* c. Current stats */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Latest weight"
              value={latestMeasurement ? `${latestMeasurement.weight_kg} kg` : "—"}
              icon={<Scale size={16} />}
            />
            <StatCard
              label="Height"
              value={latestMeasurement ? `${latestMeasurement.height_cm} cm` : "—"}
              icon={<Ruler size={16} />}
            />
            <StatCard
              label="BMI"
              value={latestMeasurement ? String(latestMeasurement.bmi) : "—"}
              icon={<Activity size={16} />}
            />
          </div>

          {/* d. Progress chart — same getSessionHistory source as the list below */}
          <div className="mt-8 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
            <h2 className="mb-4 font-display font-semibold">
              Weight &amp; BMI over time
            </h2>
            {chartPoints.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                No measurements recorded yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartPoints} margin={{ left: -12, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E6E1" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "#6B7370" }}
                    axisLine={{ stroke: "#E4E6E1" }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="weight"
                    tick={{ fontSize: 12, fill: "#6B7370" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <YAxis
                    yAxisId="bmi"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "#6B7370" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "#E4E6E1",
                      fontSize: 13,
                      boxShadow: "0 10px 24px -14px rgba(20,24,26,0.25)",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    formatter={(value) => (value === "weight" ? "Weight (kg)" : "BMI")}
                  />
                  <Line
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weight"
                    stroke="#E8623D"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#E8623D" }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    yAxisId="bmi"
                    type="monotone"
                    dataKey="bmi"
                    stroke="#4E9A6B"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#4E9A6B" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* f. Log session action */}
          <div className="mt-8">
            <button
              onClick={() => setShowLogModal(true)}
              disabled={!isActive}
              title={!isActive ? "Assignment isn't active" : undefined}
              className="focus-ring flex items-center gap-2 rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-sage-dark hover:shadow-glow-sage disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <Plus size={16} /> Log session
            </button>
          </div>

          {/* e. Paginated session history */}
          <div className="mt-6 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
            <div className="border-b border-line px-5 py-3.5">
              <h2 className="font-display font-semibold">Session history</h2>
            </div>
            <div className="divide-y divide-line/70">
              {historyRows.map((row) => (
                <div key={row.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted">
                      {new Date(row.session_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    {row.measurement && (
                      <span className="rounded-full bg-sage/10 px-2 py-0.5 text-xs text-sage-dark">
                        {row.measurement.weight_kg} kg · BMI {row.measurement.bmi}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{row.note_text}</p>
                </div>
              ))}
              {historyRows.length === 0 && (
                <p className="px-5 py-10 text-center text-sm text-muted">
                  No sessions logged yet.
                </p>
              )}
            </div>
            {historyTotal > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3">
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
            )}
          </div>
        </>
      )}

      {showLogModal && memberId && packageId && (
        <LogSessionModal
          memberId={memberId}
          packageId={packageId}
          currentHeightCm={latestMeasurement?.height_cm ?? 170}
          onClose={() => setShowLogModal(false)}
          onSaved={handleSessionSaved}
        />
      )}
    </div>
  );
}

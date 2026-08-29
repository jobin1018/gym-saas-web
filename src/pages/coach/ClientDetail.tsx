import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
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
import {
  MOCK_CLIENTS,
  GOAL_LABELS,
  computeBmi,
  evaluateTrend,
  type Measurement,
  type Note,
} from "../../lib/mockCoachData";
import { StatCard } from "../../components/StatCard";
import { ProgressBar } from "./ProgressBar";
import { AddNoteModal } from "./AddNoteModal";
import { AddMeasurementModal } from "./AddMeasurementModal";

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

export function ClientDetail() {
  const { clientId } = useParams();
  const original = MOCK_CLIENTS.find((c) => c.id === clientId);

  const [measurements, setMeasurements] = useState<Measurement[]>(
    original?.measurements ?? [],
  );
  const [notes, setNotes] = useState<Note[]>(original?.notes ?? []);
  const [heightCm, setHeightCm] = useState(original?.heightCm ?? 0);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);

  if (!original) {
    return (
      <div className="max-w-2xl">
        <Link
          to="/coach-demo"
          className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} /> Back to clients
        </Link>
        <p className="text-sm text-muted">No client found for this link.</p>
      </div>
    );
  }

  const client = original;
  const latestWeight = measurements[measurements.length - 1]?.weightKg ?? 0;
  const bmi = computeBmi(latestWeight, heightCm);
  const trend = evaluateTrend({ ...client, measurements });

  const chartData = measurements.map((m) => ({
    label: new Date(m.date).toLocaleDateString("en-IN", { month: "short" }),
    weight: m.weightKg,
    bmi: computeBmi(m.weightKg, heightCm),
  }));

  function saveNote(note: Note) {
    // Multiple notes on the same day are fine (a coach might log two
    // separate observations) — just a straightforward descending sort.
    setNotes((prev) =>
      [...prev, note].sort((a, b) => b.date.localeCompare(a.date)),
    );
  }

  function saveMeasurement(measurement: Measurement, updatedHeightCm: number) {
    // Unlike notes, a second measurement for a date that already has one
    // (e.g. the mock data's newest point happens to land on "today", same
    // as this form's date default) replaces it rather than creating an
    // ambiguous duplicate — there's only one real bodyweight per day.
    setMeasurements((prev) => {
      const withoutSameDate = prev.filter((m) => m.date !== measurement.date);
      return [...withoutSameDate, measurement].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    });
    // A height correction applies retroactively — every BMI figure (chart
    // included) recomputes from the corrected height, not just new entries.
    // Treating it as "this is what the height has always actually been" is
    // more correct than pretending the member grew on this date.
    if (updatedHeightCm > 0) setHeightCm(updatedHeightCm);
  }

  return (
    <div className="max-w-4xl">
      <Link
        to="/coach-demo"
        className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to clients
      </Link>

      {/* a. Basic info header */}
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={clsx(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-xl font-semibold text-white",
            avatarTone(client.id),
          )}
        >
          {client.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {client.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {client.phone} · {GOAL_LABELS[client.goal]} · {client.planName}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Coach-assigned since{" "}
            {new Date(client.coachAssignedDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* b. Training structure summary */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
          <span className="text-sm text-muted">Sessions</span>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
            {client.sessionsUsed}
            <span className="text-lg text-muted">/{client.sessionsPurchased}</span>
          </p>
          <div className="mt-3">
            <ProgressBar value={client.sessionsUsed} max={client.sessionsPurchased} />
          </div>
        </div>
        <div className="rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
          <span className="text-sm text-muted">Weeks</span>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
            {client.weeksElapsed}
            <span className="text-lg text-muted">/{client.weeksTotal}</span>
          </p>
          <div className="mt-3">
            <ProgressBar
              value={client.weeksElapsed}
              max={client.weeksTotal}
              tone="sage"
            />
          </div>
        </div>
        <StatCard
          label="Next session"
          value={new Date(client.nextSessionAt).toLocaleString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
          icon={<Calendar size={16} />}
        />
      </div>

      {/* c. Current stats */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Latest weight" value={`${latestWeight} kg`} icon={<Scale size={16} />} />
        <StatCard label="Height" value={`${heightCm} cm`} icon={<Ruler size={16} />} />
        <div className="rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">BMI</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-ink/10 to-ink/[0.03] text-ink">
              <Activity size={16} />
            </span>
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
            {bmi}
          </p>
          <span
            className={clsx(
              "mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              trend.verdict === "good"
                ? "bg-sage/10 text-sage-dark"
                : "bg-amberflag/15 text-amberflag",
            )}
          >
            <span
              className={clsx(
                "h-1.5 w-1.5 rounded-full",
                trend.verdict === "good" ? "bg-sage" : "bg-amberflag",
              )}
            />
            {trend.label}
          </span>
        </div>
      </div>

      {/* d. Progress chart */}
      <div className="mt-8 rounded-xl2 border border-line/70 bg-white p-5 shadow-card">
        <h2 className="mb-4 font-display font-semibold">
          Weight &amp; BMI — last 6 months
        </h2>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ left: -12, right: 8 }}>
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
      </div>

      {/* f. Add note / Add measurement actions */}
      <div className="mt-8 flex gap-2">
        <button
          onClick={() => setShowNoteModal(true)}
          className="focus-ring flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-card"
        >
          <Plus size={16} /> Add note
        </button>
        <button
          onClick={() => setShowMeasurementModal(true)}
          className="focus-ring flex items-center gap-2 rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-sage-dark hover:shadow-glow-sage"
        >
          <Plus size={16} /> Add measurement
        </button>
      </div>

      {/* e. Training notes / session log */}
      <div className="mt-6 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="border-b border-line px-5 py-3.5">
          <h2 className="font-display font-semibold">Session notes</h2>
        </div>
        <div className="divide-y divide-line/70">
          {notes.map((note, i) => (
            <div key={`${note.date}-${i}`} className="px-5 py-3.5">
              <p className="text-xs font-medium text-muted">
                {new Date(note.date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p className="mt-1 text-sm">{note.text}</p>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No notes yet.
            </p>
          )}
        </div>
      </div>

      {showNoteModal && (
        <AddNoteModal
          onClose={() => setShowNoteModal(false)}
          onSave={saveNote}
        />
      )}
      {showMeasurementModal && (
        <AddMeasurementModal
          currentHeightCm={heightCm}
          onClose={() => setShowMeasurementModal(false)}
          onSave={saveMeasurement}
        />
      )}
    </div>
  );
}

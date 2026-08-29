// Mock data for the /coach-demo UI-only prototype. No Supabase involved —
// dates are computed relative to "now" at module load so the demo (recent
// activity flags, "next session" times, the 6-month chart) always looks
// current instead of drifting stale against a hardcoded past date.

export type Goal = "muscle_gain" | "fat_loss" | "general_fitness";

export const GOAL_LABELS: Record<Goal, string> = {
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  general_fitness: "General fitness",
};

export type Measurement = { date: string; weightKg: number };
export type Note = { date: string; text: string };

// Deliberately distinct names from MOCK_CLIENTS (those are coach-demo
// clients, these are the coaches themselves) — used by the "Assign coach"
// UI-only demo control on the real Members.tsx edit flow. No coach_id
// column or backend query yet; see that file's comment for the real
// backend follow-up this stands in for.
export const MOCK_COACHES = ["Vikram Nair", "Deepa Menon", "Arjun Bhatt"];

export type CoachClient = {
  id: string;
  name: string;
  phone: string;
  goal: Goal;
  planName: string;
  coachAssignedDate: string;
  sessionsPurchased: number;
  sessionsUsed: number;
  weeksElapsed: number;
  weeksTotal: number;
  nextSessionAt: string;
  heightCm: number;
  measurements: Measurement[];
  notes: Note[];
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function hoursFromNow(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() + n);
  return d.toISOString();
}

// 6 monthly points, oldest first, trending toward `direction` from `start`.
// The most recent point is `lastLoggedDaysAgo` days back (default 0 = today)
// rather than always literally today — otherwise every client's last
// measurement would land on "today" by construction, and the "hasn't logged
// recently" flag (below) could never trigger for anyone, regardless of how
// stale their notes are. Vikram and Ananya pass a real gap here specifically
// to demonstrate that flag.
function weightSeries(
  start: number,
  direction: "down" | "up" | "flat",
  lastLoggedDaysAgo = 0,
): Measurement[] {
  const step = direction === "down" ? -0.9 : direction === "up" ? 0.9 : 0.1;
  const reference = new Date();
  reference.setDate(reference.getDate() - lastLoggedDaysAgo);
  return [5, 4, 3, 2, 1, 0].map((monthsBack, i) => {
    const d = new Date(reference);
    d.setMonth(d.getMonth() - monthsBack);
    return {
      date: d.toISOString().slice(0, 10),
      weightKg: Math.round((start + step * i) * 10) / 10,
    };
  });
}

export const MOCK_CLIENTS: CoachClient[] = [
  {
    id: "c1",
    name: "Aarav Malhotra",
    phone: "919812340001",
    goal: "muscle_gain",
    planName: "Personal Training — 12 sessions",
    coachAssignedDate: monthsAgo(5),
    sessionsPurchased: 12,
    sessionsUsed: 8,
    weeksElapsed: 9,
    weeksTotal: 12,
    nextSessionAt: hoursFromNow(20),
    heightCm: 176,
    measurements: weightSeries(68, "up"),
    notes: [
      { date: daysAgo(2), text: "Increased squat weight to 80kg, good form throughout." },
      { date: daysAgo(9), text: "Bench press stalled — deloaded and rebuilt from 60kg." },
      { date: daysAgo(16), text: "Good energy today, added an extra accessory set." },
      { date: daysAgo(24), text: "Discussed protein intake — aiming for 140g/day." },
    ],
  },
  {
    id: "c2",
    name: "Sneha Reddy",
    phone: "919812340002",
    goal: "fat_loss",
    planName: "Personal Training — 12 sessions",
    coachAssignedDate: monthsAgo(5),
    sessionsPurchased: 12,
    sessionsUsed: 10,
    weeksElapsed: 10,
    weeksTotal: 12,
    nextSessionAt: hoursFromNow(3),
    heightCm: 162,
    measurements: weightSeries(74, "down"),
    notes: [
      { date: daysAgo(1), text: "Down another 0.5kg — cardio + diet plan is working well." },
      { date: daysAgo(8), text: "Great session, upped incline walk pace." },
      { date: daysAgo(15), text: "Felt low energy, kept intensity moderate." },
      { date: daysAgo(23), text: "Reviewed food log together, mostly on track." },
      { date: daysAgo(30), text: "First month check-in — goals still realistic, kept plan as-is." },
    ],
  },
  {
    id: "c3",
    name: "Vikram Chauhan",
    phone: "919812340003",
    goal: "muscle_gain",
    planName: "Personal Training — 8 sessions",
    coachAssignedDate: monthsAgo(4),
    sessionsPurchased: 8,
    sessionsUsed: 4,
    weeksElapsed: 8,
    weeksTotal: 8,
    nextSessionAt: hoursFromNow(96),
    heightCm: 180,
    measurements: weightSeries(75, "flat", 24),
    notes: [
      { date: daysAgo(19), text: "Missed session, will reschedule for later this week." },
      { date: daysAgo(33), text: "Good form on deadlifts, ready to add weight next time." },
    ],
  },
  {
    id: "c4",
    name: "Meera Iyer",
    phone: "919812340004",
    goal: "fat_loss",
    planName: "Personal Training — 16 sessions",
    coachAssignedDate: monthsAgo(6),
    sessionsPurchased: 16,
    sessionsUsed: 11,
    weeksElapsed: 11,
    weeksTotal: 16,
    nextSessionAt: hoursFromNow(44),
    heightCm: 158,
    measurements: weightSeries(70, "down"),
    notes: [
      { date: daysAgo(4), text: "Hit a new 5k walk time — visible progress in stamina." },
      { date: daysAgo(11), text: "Adjusted meal timing around evening sessions." },
      { date: daysAgo(18), text: "Strong session, added resistance band work." },
    ],
  },
  {
    id: "c5",
    name: "Rohan Kapoor",
    phone: "919812340005",
    goal: "general_fitness",
    planName: "Personal Training — 12 sessions",
    coachAssignedDate: monthsAgo(3),
    sessionsPurchased: 12,
    sessionsUsed: 9,
    weeksElapsed: 9,
    weeksTotal: 12,
    nextSessionAt: hoursFromNow(28),
    heightCm: 172,
    measurements: weightSeries(71, "flat"),
    notes: [
      { date: daysAgo(3), text: "Mobility much improved — hip flexors loosening up." },
      { date: daysAgo(10), text: "Mixed in some light jogging, good recovery after." },
      { date: daysAgo(17), text: "Consistent as always, steady effort every session." },
    ],
  },
  {
    id: "c6",
    name: "Ananya Desai",
    phone: "919812340006",
    goal: "fat_loss",
    planName: "Personal Training — 8 sessions",
    coachAssignedDate: monthsAgo(3),
    sessionsPurchased: 8,
    sessionsUsed: 3,
    weeksElapsed: 8,
    weeksTotal: 8,
    nextSessionAt: hoursFromNow(120),
    heightCm: 165,
    measurements: weightSeries(66, "up", 21),
    notes: [
      { date: daysAgo(21), text: "Hasn't been able to make regular sessions — checking in by phone." },
    ],
  },
];

export function computeBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

// "Hasn't logged progress recently" — most recent of their last measurement
// or last note, flagged past this many days.
export const STALE_ACTIVITY_DAYS = 14;

export function daysSinceLastActivity(client: CoachClient): number {
  const lastMeasurement = client.measurements[client.measurements.length - 1]?.date;
  const lastNote = client.notes[0]?.date;
  const latest = [lastMeasurement, lastNote].filter(Boolean).sort().pop();
  if (!latest) return Infinity;
  const diffMs = Date.now() - new Date(latest).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export type TrendVerdict = "good" | "watch";

// muscle_gain / fat_loss have an obvious weight direction to check against.
// general_fitness deliberately doesn't — there's no single "correct"
// direction for a body-recomposition-agnostic goal, so its indicator is
// based on session adherence instead. Judgment call: flagged for review.
export function evaluateTrend(client: CoachClient): {
  verdict: TrendVerdict;
  label: string;
} {
  const points = client.measurements;
  if (points.length < 2) {
    return { verdict: "watch", label: "Not enough data yet" };
  }
  const delta =
    points[points.length - 1].weightKg - points[0].weightKg;

  if (client.goal === "fat_loss") {
    if (delta <= -1) return { verdict: "good", label: "Trending toward goal" };
    if (delta >= 1) return { verdict: "watch", label: "Moving away from goal" };
    return { verdict: "watch", label: "Holding steady" };
  }
  if (client.goal === "muscle_gain") {
    if (delta >= 1) return { verdict: "good", label: "Trending toward goal" };
    if (delta <= -1) return { verdict: "watch", label: "Moving away from goal" };
    return { verdict: "watch", label: "Holding steady" };
  }
  const adherence = client.sessionsUsed / client.sessionsPurchased;
  return adherence >= 0.7
    ? { verdict: "good", label: "Consistent attendance" }
    : { verdict: "watch", label: "Attendance dipping" };
}

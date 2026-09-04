import { supabase } from "./supabase";
import { getCurrentClaims } from "./authSession";

export type Goal = "muscle_gain" | "fat_loss" | "general_fitness";

export const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "muscle_gain", label: "Muscle gain" },
  { value: "fat_loss", label: "Fat loss" },
  { value: "general_fitness", label: "General fitness" },
];

export type Coach = {
  id: string;
  name: string;
  active_client_count: number;
  most_recent_session_date: string | null;
};

// "4 clients, active 2d ago" — shared between AddPtPackageModal (Member
// Detail's Personal Training section) and the /pt/add magic-link page, so
// whoever's picking a coach reads the same workload context regardless of
// which entry point they came in through.
export function workloadLabel(c: Coach): string {
  const clients = `${c.active_client_count} client${c.active_client_count === 1 ? "" : "s"}`;
  if (!c.most_recent_session_date) return `${clients}, no sessions logged yet`;
  const days = Math.floor(
    (Date.now() - new Date(c.most_recent_session_date).getTime()) / 86400000,
  );
  const recency = days <= 0 ? "active today" : `active ${days}d ago`;
  return `${clients}, ${recency}`;
}

export async function loadCoaches(): Promise<Coach[]> {
  const { data } = await supabase
    .from("coaches_workload")
    .select("id, name, active_client_count, most_recent_session_date");
  return data ?? [];
}

export type PtPackageFormInput = {
  coachId: string;
  durationMonths: string;
  sessionsPerMonth: string;
  price: string;
};

export type ParsedPtPackageInput = {
  months: number;
  perMonth: number;
  price: number;
};

export type PtPackageValidation =
  | { error: string; parsed?: undefined }
  | { error: null; parsed: ParsedPtPackageInput };

// The one place "is this PT-package form submittable" is decided — same
// rules AddPtPackageModal always enforced, now shared with the /pt/add
// magic-link page so the two entry points can't drift apart on what counts
// as a valid package.
export function validatePtPackageInput(input: PtPackageFormInput): PtPackageValidation {
  if (!input.coachId) return { error: "Select a coach" };
  const months = Number(input.durationMonths);
  if (!Number.isInteger(months) || months <= 0) {
    return { error: "Duration must be a whole number of months greater than 0" };
  }
  const perMonth = Number(input.sessionsPerMonth);
  if (!Number.isInteger(perMonth) || perMonth <= 0) {
    return { error: "Sessions per month must be a whole number greater than 0" };
  }
  const price = Number(input.price);
  if (!input.price.trim() || Number.isNaN(price) || price < 0) {
    return { error: "Enter a valid price" };
  }
  return { error: null, parsed: { months, perMonth, price } };
}

export type NewPtPackagePayload = {
  member_id: string;
  coach_id: string;
  goal: Goal;
  duration_months: number;
  sessions_per_month: number;
  price: number;
  start_date: string;
};

// sessions_purchased is intentionally NOT sent — the pt_packages_derive_sessions
// trigger derives it as duration_months * sessions_per_month
// (20260829098500_pt_packages_session_calc.sql).
export async function createPtPackage(payload: NewPtPackagePayload): Promise<void> {
  const claims = await getCurrentClaims();
  const { error } = await supabase.from("pt_packages").insert({
    organization_id: claims.organizationId,
    member_id: payload.member_id,
    coach_id: payload.coach_id,
    goal: payload.goal,
    duration_months: payload.duration_months,
    sessions_per_month: payload.sessions_per_month,
    price: payload.price,
    start_date: payload.start_date,
  });
  if (error) throw error;
}

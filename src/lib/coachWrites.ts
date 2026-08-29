import { supabase } from "./supabase";
import { getCurrentClaims } from "./authSession";

// ---------------------------------------------------------------------------
// RLS rejection -> a typed error, so the UI can say "this client isn't
// currently assigned to you" instead of a generic failure, and so
// isNetworkError() doesn't mistake a genuine 42501 for a connectivity blip
// and queue it for endless retry. Verified against a real rejection body:
// { code: "42501", message: "new row violates row-level security policy..." }.
// ---------------------------------------------------------------------------
export class AssignmentNotActiveError extends Error {
  constructor() {
    super("This client isn't currently assigned to you.");
    this.name = "AssignmentNotActiveError";
  }
}

// P0001 = a RAISE EXCEPTION from one of the coaching triggers/RPC guards:
// package full, both-or-neither measurement halves, completed package, etc.
// The message is human-usable; surface it rather than swallowing it.
export class SessionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionRejectedError";
  }
}

function classifyWriteError(err: unknown): never {
  const code = (err as { code?: string })?.code;
  const message = String((err as { message?: string })?.message ?? "");
  if (code === "42501" && /row-level security/i.test(message)) {
    throw new AssignmentNotActiveError();
  }
  if (code === "P0001") {
    throw new SessionRejectedError(message);
  }
  throw err;
}

// ===========================================================================
// logSession — the unified "log a session" write
// ===========================================================================
// One session = always a note, optionally a linked weigh-in, one date.
// Backed by the log_session() Postgres RPC (migration
// 20260829097500_log_session_rpc.sql), which does BOTH inserts in one
// transaction — a partial "note saved, measurement lost" is impossible.
//
// organization_id and coach_id are taken from the JWT server-side; do NOT
// pass them. The RPC returns the package's post-write state so the caller can
// update sessions_used / status without a re-fetch.
// ===========================================================================
export type LogSessionPayload = {
  member_id: string;
  pt_package_id: string;
  note_text: string;
  session_date: string; // 'YYYY-MM-DD'
  // Both or neither. Omit for a note-only session.
  weight_kg?: number;
  height_cm?: number;
};

export type LoggedSession = {
  trainingNoteId: string;
  bodyMeasurementId: string | null;
  sessionsUsed: number;
  sessionsPurchased: number;
  packageStatus: "active" | "completed" | "cancelled";
};

export async function logSession(
  payload: LogSessionPayload,
): Promise<LoggedSession> {
  const hasWeight = payload.weight_kg != null;
  const hasHeight = payload.height_cm != null;
  if (hasWeight !== hasHeight) {
    throw new SessionRejectedError(
      "Enter both weight and height, or leave both blank.",
    );
  }

  const { data, error } = await supabase
    .rpc("log_session", {
      p_member_id: payload.member_id,
      p_pt_package_id: payload.pt_package_id,
      p_note_text: payload.note_text,
      p_session_date: payload.session_date,
      p_weight_kg: hasWeight ? payload.weight_kg : null,
      p_height_cm: hasHeight ? payload.height_cm : null,
    })
    .single(); // RETURNS TABLE(1 row) -> PostgREST array; .single() unwraps it

  if (error) classifyWriteError(error);

  const row = data as {
    training_note_id: string;
    body_measurement_id: string | null;
    sessions_used: number;
    sessions_purchased: number;
    package_status: LoggedSession["packageStatus"];
  };
  return {
    trainingNoteId: row.training_note_id,
    bodyMeasurementId: row.body_measurement_id,
    sessionsUsed: row.sessions_used,
    sessionsPurchased: row.sessions_purchased,
    packageStatus: row.package_status,
  };
}

// ===========================================================================
// getSessionHistory — paginated, newest-first, per member
// ===========================================================================
// training_notes for one member + the optional weigh-in linked to each,
// ordered session_date desc with a stable created_at,id tiebreak.
// limit/offset (not keyset): a single member's history is small and bounded,
// deep offset is never a problem here, and count=exact gives an exact total
// for "page N of M" for free. Assignment-scoped by RLS — the coach only gets
// their own clients (completed packages included, read-only, per 097000);
// the owner gets everyone org-wide.
// ===========================================================================
export type SessionHistoryRow = {
  id: string;
  session_date: string;
  note_text: string;
  created_at: string;
  measurement: {
    weight_kg: number;
    height_cm: number;
    bmi: number;
    recorded_at: string;
  } | null;
};

export async function getSessionHistory(opts: {
  member_id: string;
  page?: number; // 0-based
  pageSize?: number; // default 20
}): Promise<{ rows: SessionHistoryRow[]; total: number }> {
  const page = opts.page ?? 0;
  const pageSize = opts.pageSize ?? 20;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from("training_notes")
    .select(
      "id,session_date,note_text,created_at," +
        "body_measurements(weight_kg,height_cm,bmi,recorded_at)",
      { count: "exact" },
    )
    .eq("member_id", opts.member_id)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows: SessionHistoryRow[] = (data ?? []).map((r: any) => ({
    id: r.id,
    session_date: r.session_date,
    note_text: r.note_text,
    created_at: r.created_at,
    // reverse embed comes back as an array; a note has 0 or 1 linked weigh-in
    measurement: r.body_measurements?.[0] ?? null,
  }));
  return { rows, total: count ?? rows.length };
}

// ===========================================================================
// addTrainingNote — DEPRECATED. Use logSession() instead.
// ===========================================================================
// A bare note IS a session now (the session-count trigger fires on any
// training_notes insert). Kept only so the existing offline queue / AddNote
// modal keep compiling until the merged "Session" modal replaces them; it
// still works and still advances sessions_used.
// ===========================================================================
export type AddNotePayload = {
  member_id: string;
  pt_package_id: string;
  note_text: string;
  session_date: string;
};

/** @deprecated prefer {@link logSession} — the unified session write. */
export async function addTrainingNote(payload: AddNotePayload): Promise<void> {
  const claims = await getCurrentClaims();
  const { error } = await supabase.from("training_notes").insert({
    organization_id: claims.organizationId,
    member_id: payload.member_id,
    coach_id: claims.userId,
    pt_package_id: payload.pt_package_id,
    note_text: payload.note_text,
    session_date: payload.session_date,
  });
  if (error) classifyWriteError(error);
}

// ===========================================================================
// addBodyMeasurement — standalone weigh-in, NO note, NOT counted as a session
// ===========================================================================
// Kept for the "member drops in, gets weighed, no training happened" case.
// Requires an ACTIVE assignment (RLS WITH CHECK, unchanged) — unlike a
// session weigh-in it is not authorised by a note. bmi is a generated column,
// never sent.
// ===========================================================================
export type AddMeasurementPayload = {
  member_id: string;
  weight_kg: number;
  height_cm: number;
};

export async function addBodyMeasurement(
  payload: AddMeasurementPayload,
): Promise<void> {
  const claims = await getCurrentClaims();
  const { error } = await supabase.from("body_measurements").insert({
    organization_id: claims.organizationId,
    member_id: payload.member_id,
    recorded_by: claims.userId,
    weight_kg: payload.weight_kg,
    height_cm: payload.height_cm,
  });
  if (error) classifyWriteError(error);
}

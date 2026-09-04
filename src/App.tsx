import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Members } from "./pages/Members";
import { MemberDetail } from "./pages/MemberDetail";
import { ImportMembers } from "./pages/ImportMembers";
import { Revenue } from "./pages/Revenue";
import { PlansAdmin } from "./pages/PlansAdmin";
import { Transactions } from "./pages/Transactions";
import { Staff } from "./pages/Staff";
import { OwnerDashboard } from "./pages/OwnerDashboard";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CoachShell } from "./pages/coach/CoachShell";
import { CoachClients } from "./pages/coach/CoachClients";
import { ClientDetail } from "./pages/coach/ClientDetail";
import { CoachShell as RealCoachShell } from "./pages/coachReal/CoachShell";
import { CoachClients as RealCoachClients } from "./pages/coachReal/CoachClients";
import { ClientDetail as RealClientDetail } from "./pages/coachReal/ClientDetail";
import { CoachQuickLog } from "./pages/coachReal/CoachQuickLog";
import { AddMemberLinkPage } from "./pages/magicLink/AddMember";
import { AddPtPackageLinkPage } from "./pages/magicLink/AddPtPackage";

function RequireAuth({ children }: { children: ReactElement }) {
  const { status, claims } = useAuth();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  // Coaches have their own section (/coach) with no RLS access to the
  // owner/front_desk views this shell renders (memberships, attendance,
  // revenue aren't coach-scoped) — redirect rather than show a broken
  // Overview/Members/Revenue.
  if (claims?.role === "coach") return <Navigate to="/coach" replace />;
  return children;
}

function RequireCoach({ children }: { children: ReactElement }) {
  const { status, claims } = useAuth();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (claims?.role !== "coach") return <Navigate to="/" replace />;
  return children;
}

// Revenue is financial data the backend restricts to the owner role —
// v_daily_revenue (derived from payments) returns a hard 403 for front_desk.
// Gate the route itself, not just the sidebar link, since a front_desk user
// could still navigate to /revenue directly by URL.
function RequireOwner({ children }: { children: ReactElement }) {
  const { claims } = useAuth();
  if (claims?.role !== "owner") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Overview />} />
            <Route path="/members" element={<Members />} />
            <Route path="/members/import" element={<ImportMembers />} />
            {/* Static "/members/import" above ranks over this dynamic
                segment regardless of declaration order (React Router
                matches by specificity, not source order) — same reasoning
                already established for "/coach/quick-log" vs
                "/coach/:packageId". */}
            <Route path="/members/:id" element={<MemberDetail />} />
            {/* Owner/front_desk only "by construction" — RequireAuth above
                already redirects a coach out of this whole route group to
                /coach, so nothing extra is needed here to keep coaches out.
                No RequireOwner either: front_desk manages plans too. */}
            <Route path="/plans" element={<PlansAdmin />} />
            {/* Owner/front_desk only, same "by construction" reasoning as
                /plans above — front_desk is server-side scoped to their own
                location by v_payments_ledger's own WHERE clause, not by
                anything here. */}
            <Route path="/transactions" element={<Transactions />} />
            <Route
              path="/revenue"
              element={
                <RequireOwner>
                  <Revenue />
                </RequireOwner>
              }
            />
            <Route
              path="/staff"
              element={
                <RequireOwner>
                  <Staff />
                </RequireOwner>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireOwner>
                  <OwnerDashboard />
                </RequireOwner>
              }
            />
          </Route>

          {/* UI-only coach prototype, mock data, no auth — see mockCoachData.ts.
              Deliberately outside RequireAuth/AppShell: not part of the real
              app yet, just a standalone route to view and iterate on. Left
              as-is for reference — the real version below is a fully
              separate set of files, not a conversion of this one. */}
          <Route path="/coach-demo" element={<CoachShell />}>
            <Route index element={<CoachClients />} />
            <Route path=":clientId" element={<ClientDetail />} />
          </Route>

          {/* WhatsApp magic-link destination — deliberately OUTSIDE
              RequireAuth/RequireCoach: there is no session yet when this
              loads, the token itself is the credential (see
              validate-magic-link + magicLink.ts). A static "/coach/quick-log"
              route ranks above the dynamic "/coach/:packageId" below
              regardless of declaration order (React Router matches by
              specificity, not source order) — kept first here anyway for
              readability. */}
          <Route path="/coach/quick-log" element={<CoachQuickLog />} />

          {/* WhatsApp "ADD MEMBER" / "ADD PT" magic-link destinations —
              same reasoning as /coach/quick-log above: deliberately OUTSIDE
              RequireAuth, since there is no session yet when either loads.
              Owner/front_desk only (validate-magic-link's PURPOSE_ROLES
              enforces this server-side), but that's not a route guard
              either — same as /coach/quick-log, the token IS the
              credential. Not linked from anywhere in the app's own
              nav/sidebar — reachable only via a magic link. */}
          <Route path="/members/add" element={<AddMemberLinkPage />} />
          <Route path="/pt/add" element={<AddPtPackageLinkPage />} />

          {/* Real coach section — real Supabase queries, RLS-scoped by
              assignment. Package-id-keyed (not member-id-keyed like the
              mock version) since a member can have more than one pt_package
              over time; see RealClientDetail's own comment. */}
          <Route
            path="/coach"
            element={
              <RequireCoach>
                <RealCoachShell />
              </RequireCoach>
            }
          >
            <Route index element={<RealCoachClients />} />
            <Route path=":packageId" element={<RealClientDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

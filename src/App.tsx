import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Members } from "./pages/Members";
import { ImportMembers } from "./pages/ImportMembers";
import { Revenue } from "./pages/Revenue";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

function RequireAuth({ children }: { children: ReactElement }) {
  const { status } = useAuth();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
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
            <Route
              path="/revenue"
              element={
                <RequireOwner>
                  <Revenue />
                </RequireOwner>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

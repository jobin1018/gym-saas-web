import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Users, LogOut } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { initOfflineQueue } from "../../lib/offlineQueue";
import { PulseMark } from "../../components/PulseMark";
import { PendingSyncIndicator } from "../../components/PendingSyncIndicator";

// Real coach shell — parallel to AppShell, not a variant of it, since a
// coach session has no RLS access to anything AppShell renders. Visually
// mirrors ../coach/CoachShell.tsx (the mock version) but wired for a real,
// signed-in session: real sign-out, real offline queue, no "demo" badge.
export function CoachShell() {
  const navigate = useNavigate();
  const { name, claims } = useAuth();

  useEffect(() => {
    initOfflineQueue();
  }, []);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
      isActive
        ? "bg-ember text-white shadow-glow-ember"
        : "text-white/60 hover:bg-white/[0.07] hover:text-white",
    );

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="relative flex w-64 flex-col justify-between overflow-hidden bg-gradient-to-b from-ink-light to-ink p-5">
        <div
          className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-sage/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="mb-10 flex items-center gap-2.5 px-1 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <PulseMark className="h-4 w-6 text-sage" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Kinetiq Coach
            </span>
          </div>
          <nav className="space-y-1">
            <NavLink to="/coach" end className={linkClass}>
              <Users
                size={18}
                className="transition-transform group-hover:scale-110"
              />
              My Clients
            </NavLink>
          </nav>
        </div>
        <div className="relative border-t border-white/10 pt-4">
          <PendingSyncIndicator />
          {(name || claims) && (
            <div className="mb-2 px-3 text-xs text-white/40">
              {name ?? "Signed in"}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/50 transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}

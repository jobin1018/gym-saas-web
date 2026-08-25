import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, IndianRupee, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { PulseMark } from "../components/PulseMark";
import { PendingSyncIndicator } from "../components/PendingSyncIndicator";
import { initOfflineQueue } from "../lib/offlineQueue";
import clsx from "clsx";

export function AppShell() {
  const navigate = useNavigate();
  const { claims, name, organizationName } = useAuth();

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
    // Defensive cleanup — the old placeholder auth wrote this key directly;
    // nothing should still be writing it, but a stale copy from before this
    // change shouldn't linger.
    localStorage.removeItem("gym_session");
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="relative flex w-64 flex-col justify-between overflow-hidden bg-gradient-to-b from-ink-light to-ink p-5">
        <div
          className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-ember/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="mb-10 flex items-center gap-2.5 px-1 text-white">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <PulseMark className="h-4 w-6 text-ember" />
            </div>
            <div className="min-w-0">
              <span className="block font-display text-lg font-semibold leading-tight tracking-tight">
                Kinetiq
              </span>
              {organizationName && (
                <span className="block truncate text-xs text-white/50">
                  {organizationName}
                </span>
              )}
            </div>
          </div>
          <nav className="space-y-1">
            <NavLink to="/" end className={linkClass}>
              <LayoutDashboard
                size={18}
                className="transition-transform group-hover:scale-110"
              />
              Overview
            </NavLink>
            <NavLink to="/members" className={linkClass}>
              <Users
                size={18}
                className="transition-transform group-hover:scale-110"
              />
              Members
            </NavLink>
            {claims?.role === "owner" && (
              <NavLink to="/revenue" className={linkClass}>
                <IndianRupee
                  size={18}
                  className="transition-transform group-hover:scale-110"
                />
                Revenue
              </NavLink>
            )}
          </nav>
        </div>
        <div className="relative border-t border-white/10 pt-4">
          <div className="mb-2 flex items-center gap-2.5 px-1 py-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-xs font-semibold text-white">
              {(name ?? claims?.role ?? "?").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">
                {name ?? "Signed in"}
              </span>
              <span className="block text-xs capitalize text-white/50">
                {claims?.role.replace("_", " ")}
              </span>
            </div>
          </div>
          <PendingSyncIndicator />
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

import { Link, NavLink, Outlet } from "react-router-dom";
import { Users, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { PulseMark } from "../../components/PulseMark";

// Standalone layout for the /coach-demo prototype — deliberately NOT AppShell.
// This is UI-only, unauthenticated, mock-data-backed, and must never share a
// component with the real authenticated app shell, so nothing here can
// accidentally regress Overview/Members/Revenue when the coach section
// eventually gets wired to real data and real auth.
export function CoachShell() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
      isActive
        ? "bg-ember text-white shadow-glow-ember"
        : "text-white/60 hover:bg-white/[0.07] hover:text-white",
    );

  return (
    <div className="flex min-h-screen">
      <aside className="relative flex w-64 flex-col justify-between overflow-hidden bg-gradient-to-b from-ink-light to-ink p-5">
        <div
          className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-sage/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="mb-2 flex items-center gap-2.5 px-1 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <PulseMark className="h-4 w-6 text-sage" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Kinetiq Coach
            </span>
          </div>
          <span className="mb-8 inline-block rounded-full bg-amberflag/20 px-2.5 py-0.5 text-xs font-medium text-amberflag">
            Demo — mock data, not live
          </span>
          <nav className="space-y-1">
            <NavLink to="/coach-demo" end className={linkClass}>
              <Users
                size={18}
                className="transition-transform group-hover:scale-110"
              />
              My Clients
            </NavLink>
          </nav>
        </div>
        <div className="relative border-t border-white/10 pt-4">
          <Link
            to="/"
            className="focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/50 transition-colors duration-150 hover:bg-white/[0.07] hover:text-white"
          >
            <ArrowLeft size={18} /> Back to main app
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { ProgressBar } from "../coach/ProgressBar";

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  general_fitness: "General fitness",
};

const STALE_ACTIVITY_DAYS = 14;

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

type Package = {
  id: string;
  goal: string;
  sessions_purchased: number;
  sessions_used: number;
  start_date: string;
  status: string;
  members: { id: string; name: string; phone: string } | null;
};

export function CoachClients() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  // Frozen at mount rather than read fresh per render/row: a "days since"
  // staleness flag doesn't need to tick live within a session, and reading
  // Date.now() directly during render trips React Compiler's purity check.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    supabase
      .from("pt_packages")
      .select(
        "id, goal, sessions_purchased, sessions_used, start_date, status, members(id, name, phone)",
      )
      .eq("status", "active")
      .then(async ({ data }) => {
        const pkgs = (data as unknown as Package[]) ?? [];
        setPackages(pkgs);

        const memberIds = pkgs
          .map((p) => p.members?.id)
          .filter((id): id is string => !!id);

        if (memberIds.length > 0) {
          const [{ data: notes }, { data: measurements }] = await Promise.all([
            supabase
              .from("training_notes")
              .select("member_id, session_date")
              .in("member_id", memberIds),
            supabase
              .from("body_measurements")
              .select("member_id, recorded_at")
              .in("member_id", memberIds),
          ]);

          const latest: Record<string, string> = {};
          for (const n of notes ?? []) {
            const prev = latest[n.member_id];
            if (!prev || n.session_date > prev) latest[n.member_id] = n.session_date;
          }
          for (const m of measurements ?? []) {
            const day = m.recorded_at.slice(0, 10);
            const prev = latest[m.member_id];
            if (!prev || day > prev) latest[m.member_id] = day;
          }
          setLastActivity(latest);
        }
        setLoaded(true);
      });
  }, []);

  const filtered = packages.filter((p) => {
    const q = query.toLowerCase();
    return (
      p.members?.name.toLowerCase().includes(q) ||
      GOAL_LABELS[p.goal]?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        My Clients
      </h1>
      <p className="mt-1 text-sm text-muted">
        {packages.length} active assignment{packages.length === 1 ? "" : "s"}
      </p>

      <div className="relative mt-5 max-w-sm">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or goal"
          className="focus-ring w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm transition-shadow focus:shadow-card"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filtered.map((pkg) => {
          if (!pkg.members) return null;
          const lastDate = lastActivity[pkg.members.id];
          const staleDays = lastDate
            ? Math.floor((now - new Date(lastDate).getTime()) / 86400000)
            : Infinity;
          const isStale = staleDays > STALE_ACTIVITY_DAYS;
          return (
            <Link
              key={pkg.id}
              to={`/coach/${pkg.id}`}
              className="group rounded-xl2 border border-line/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-base font-semibold text-white ${avatarTone(pkg.members.id)}`}
                  >
                    {pkg.members.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-medium">{pkg.members.name}</p>
                    <p className="text-xs text-muted">
                      {GOAL_LABELS[pkg.goal] ?? pkg.goal}
                    </p>
                  </div>
                </div>
                {isStale && (
                  <span
                    title={
                      lastDate
                        ? `No logged activity in ${staleDays} days`
                        : "No activity logged yet"
                    }
                    className="flex items-center gap-1 rounded-full bg-amberflag/15 px-2 py-0.5 text-xs font-medium text-amberflag"
                  >
                    <AlertCircle size={12} />
                    Inactive
                  </span>
                )}
              </div>

              <div className="mt-4">
                <ProgressBar
                  value={pkg.sessions_used}
                  max={pkg.sessions_purchased}
                  label="Sessions this package"
                />
              </div>
            </Link>
          );
        })}

        {loaded && filtered.length === 0 && packages.length > 0 && (
          <p className="col-span-2 rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            No clients match "{query}".
          </p>
        )}
        {loaded && packages.length === 0 && (
          <p className="col-span-2 rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            Your assigned clients will appear here once the owner or front
            desk assigns them to you.
          </p>
        )}
      </div>
    </div>
  );
}

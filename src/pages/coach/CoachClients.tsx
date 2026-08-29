import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, AlertCircle } from "lucide-react";
import {
  MOCK_CLIENTS,
  GOAL_LABELS,
  daysSinceLastActivity,
  STALE_ACTIVITY_DAYS,
} from "../../lib/mockCoachData";
import { ProgressBar } from "./ProgressBar";

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

export function CoachClients() {
  const [query, setQuery] = useState("");

  const filtered = MOCK_CLIENTS.filter((c) => {
    const q = query.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      GOAL_LABELS[c.goal].toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        My Clients
      </h1>
      <p className="mt-1 text-sm text-muted">
        {MOCK_CLIENTS.length} members assigned to you
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
        {filtered.map((client) => {
          const staleDays = daysSinceLastActivity(client);
          const isStale = staleDays > STALE_ACTIVITY_DAYS;
          return (
            <Link
              key={client.id}
              to={`/coach-demo/${client.id}`}
              className="group rounded-xl2 border border-line/70 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-base font-semibold text-white ${avatarTone(client.id)}`}
                  >
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-xs text-muted">
                      {GOAL_LABELS[client.goal]}
                    </p>
                  </div>
                </div>
                {isStale && (
                  <span
                    title={`No logged activity in ${staleDays} days`}
                    className="flex items-center gap-1 rounded-full bg-amberflag/15 px-2 py-0.5 text-xs font-medium text-amberflag"
                  >
                    <AlertCircle size={12} />
                    Inactive
                  </span>
                )}
              </div>

              <div className="mt-4">
                <ProgressBar
                  value={client.sessionsUsed}
                  max={client.sessionsPurchased}
                  label="Sessions this package"
                />
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && MOCK_CLIENTS.length > 0 && (
          <p className="col-span-2 rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            No clients match "{query}".
          </p>
        )}
        {/* Coaches don't create clients — front desk/owner create members and
            assign them to a coach (see Members.tsx). This is unreachable
            with the current 6-client mock array, but is the correct state
            once real assignment data can be empty, so it's worth having now
            rather than only adding it once the backend exists. */}
        {MOCK_CLIENTS.length === 0 && (
          <p className="col-span-2 rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            Your assigned clients will appear here once the owner or front
            desk assigns them to you.
          </p>
        )}
      </div>
    </div>
  );
}

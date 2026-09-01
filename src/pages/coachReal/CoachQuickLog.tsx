import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronRight, LogIn } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { redeemMagicLink, MagicLinkError } from "../../lib/magicLink";
import { PulseMark } from "../../components/PulseMark";
import { ProgressBar } from "../coach/ProgressBar";
import { LogSessionModal } from "./LogSessionModal";
import type { LoggedSession } from "../../lib/coachWrites";

const GOAL_LABELS: Record<string, string> = {
  muscle_gain: "Muscle gain",
  fat_loss: "Fat loss",
  general_fitness: "General fitness",
};

type Step = "checking" | "error" | "ready";

type ClientPackage = {
  id: string;
  goal: string;
  sessions_purchased: number;
  sessions_used: number;
  members: { id: string; name: string } | null;
};

// The WhatsApp-generated link's whole destination — no PIN, no sidebar, no
// desktop chrome. A coach taps a link on their phone, picks a client, logs
// one session, done. Deliberately its own page shell, not AppShell/
// RealCoachShell — this needs to work standalone before any session exists.
export function CoachQuickLog() {
  const [searchParams] = useSearchParams();
  const { completeLogin } = useAuth();
  const [step, setStep] = useState<Step>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [coachName, setCoachName] = useState("");
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [selected, setSelected] = useState<ClientPackage | null>(null);
  const [selectedHeightCm, setSelectedHeightCm] = useState(170);

  useEffect(() => {
    (async () => {
      // A page refresh after a successful redemption re-sends the same
      // single-use token in the URL — the server would correctly reject it
      // as already-used. If this browser already has a live session (from
      // the redemption that already happened), skip straight past that
      // instead of showing a false "link expired" on a simple refresh.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        setStep("ready");
        loadClients();
        return;
      }

      const token = searchParams.get("token");
      if (!token) {
        setErrorMessage(
          "This link isn't valid — text SESSION again on WhatsApp for a new one.",
        );
        setStep("error");
        return;
      }

      try {
        const redeemed = await redeemMagicLink(token);
        const { error } = await completeLogin(
          redeemed.access_token,
          redeemed.refresh_token,
          redeemed.name,
        );
        if (error) {
          setErrorMessage("Couldn't start your session — text SESSION again on WhatsApp.");
          setStep("error");
          return;
        }
        setCoachName(redeemed.name);
        setStep("ready");
        loadClients();
      } catch (err) {
        setErrorMessage(
          err instanceof MagicLinkError
            ? err.message
            : "Something went wrong — text SESSION again on WhatsApp.",
        );
        setStep("error");
      }
    })();
    // Redeem at most once on mount — never re-run on searchParams identity
    // changes, which would re-send a now-already-used token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadClients() {
    supabase
      .from("pt_packages")
      .select("id, goal, sessions_purchased, sessions_used, members(id, name)")
      .eq("status", "active")
      .then(({ data }) => data && setPackages(data as unknown as ClientPackage[]));
  }

  function openClient(pkg: ClientPackage) {
    if (!pkg.members) return;
    supabase
      .from("body_measurements")
      .select("height_cm")
      .eq("member_id", pkg.members.id)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setSelectedHeightCm(data?.height_cm ?? 170);
        setSelected(pkg);
      });
  }

  function handleSaved(result: LoggedSession | null) {
    // Update this one package's numbers in place when we have a real
    // result; a queued/offline write (result === null) means refetch.
    if (result && selected) {
      setPackages((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? { ...p, sessions_used: result.sessionsUsed, sessions_purchased: result.sessionsPurchased }
            : p,
        ),
      );
      if (result.packageStatus !== "active") loadClients();
    } else {
      loadClients();
    }
  }

  return (
    <div className="flex min-h-screen justify-center bg-paper px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-ink">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5">
            <PulseMark className="h-3.5 w-5 text-ember" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">
            GymDean
          </span>
        </div>

        {step === "checking" && (
          <div className="animate-fade-in-up rounded-xl2 border border-line/70 bg-white p-8 text-center shadow-card">
            <p className="text-sm text-muted">Checking your link…</p>
          </div>
        )}

        {step === "error" && (
          <div className="animate-fade-in-up rounded-xl2 border border-line/70 bg-white p-6 text-center shadow-card">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ember/10 text-ember-dark">
              <AlertCircle size={22} />
            </span>
            <h1 className="font-display text-lg font-semibold tracking-tight">
              Can't open this link
            </h1>
            <p className="mt-1 text-sm text-muted">{errorMessage}</p>
            <a
              href="/login"
              className="focus-ring mt-5 flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-paper"
            >
              <LogIn size={15} /> Sign in with PIN instead
            </a>
          </div>
        )}

        {step === "ready" && (
          <div className="animate-fade-in-up">
            {coachName && (
              <p className="mb-3 text-center text-sm text-muted">
                Hi <span className="font-medium text-ink">{coachName}</span> —
                who are you logging a session for?
              </p>
            )}
            <div className="space-y-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => openClient(pkg)}
                  className="focus-ring flex w-full items-center justify-between rounded-xl2 border border-line/70 bg-white px-4 py-3.5 text-left shadow-card transition-all duration-150 active:scale-[0.98]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{pkg.members?.name}</p>
                    <p className="text-xs text-muted">
                      {GOAL_LABELS[pkg.goal] ?? pkg.goal}
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={pkg.sessions_used} max={pkg.sessions_purchased} tone="sage" />
                    </div>
                  </div>
                  <ChevronRight size={18} className="ml-2 shrink-0 text-muted" />
                </button>
              ))}
              {packages.length === 0 && (
                <p className="rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
                  No active clients assigned to you right now.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {selected && selected.members && (
        <LogSessionModal
          memberId={selected.members.id}
          packageId={selected.id}
          currentHeightCm={selectedHeightCm}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

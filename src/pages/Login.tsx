import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { normalizeLocalPhone } from "../lib/phone";
import { PulseMark } from "../components/PulseMark";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";
const STAFF_LOOKUP_URL = `${FUNCTIONS_URL}/staff-lookup-by-phone`;
const STAFF_LOGIN_URL = `${FUNCTIONS_URL}/staff-login`;

type OrgMatch = {
  organization_id: string;
  organization_name: string;
  name: string;
  role: string;
};

type Step = "phone" | "select-org" | "pin";

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

function formatCountdown(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.ceil(seconds / 60);
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function Login() {
  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [resolvedPhone, setResolvedPhone] = useState("");
  const [matches, setMatches] = useState<OrgMatch[]>([]);
  const [staff, setStaff] = useState<OrgMatch | null>(null);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const navigate = useNavigate();
  const { setDisplayName } = useAuth();

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) setLockedUntil(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = normalizeLocalPhone(phoneInput);
    if (!result.value) {
      setPhoneError(result.error ?? "Doesn't look like a valid mobile number");
      return;
    }
    const phoneValue = result.value;

    setLookingUp(true);
    setPhoneError("");
    try {
      const res = await fetch(STAFF_LOOKUP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ phone: phoneValue }),
      });
      const body = await res.json();

      if (!res.ok) {
        setPhoneError(
          res.status === 404
            ? "We couldn't find that number — check with your gym"
            : "Something went wrong — try again",
        );
        return;
      }

      setResolvedPhone(phoneValue);

      if (Array.isArray(body.matches)) {
        setMatches(body.matches);
        setStep("select-org");
        return;
      }

      setStaff({
        organization_id: body.organization_id,
        organization_name: body.organization_name,
        name: body.name,
        role: body.role,
      });
      setStep("pin");
    } catch {
      setPhoneError("Couldn't reach the server — check your connection");
    } finally {
      setLookingUp(false);
    }
  }

  function selectOrg(match: OrgMatch) {
    setStaff(match);
    setStep("pin");
  }

  function backToPhone() {
    setStep("phone");
    setStaff(null);
    setMatches([]);
    setPin("");
    setError("");
  }

  function backFromPin() {
    if (matches.length > 1) {
      setStep("select-org");
      setPin("");
      setError("");
    } else {
      backToPhone();
    }
  }

  async function submitPin(nextPin: string) {
    setPin(nextPin);
    if (nextPin.length !== 4 || !staff || lockedUntil) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(STAFF_LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          organization_id: staff.organization_id,
          phone: resolvedPhone,
          pin: nextPin,
        }),
      });
      const body = await res.json();

      if (res.status === 429) {
        const retrySeconds = Number(body.retry_after_seconds) || 15 * 60;
        setLockedUntil(Date.now() + retrySeconds * 1000);
        setPin("");
        return;
      }

      if (!res.ok || !body.access_token) {
        // Same message whether the phone/pin combo is wrong or unknown —
        // matches the backend's deliberate non-distinguishing 401 contract.
        setError("Incorrect phone or PIN — try again");
        setPin("");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      if (sessionError) {
        setError("Couldn't start your session — try again");
        setPin("");
        return;
      }

      setDisplayName(body.name ?? staff.name);
      navigate("/");
    } catch {
      setError("Couldn't reach the server — check your connection");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink p-4">
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/20 blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-sage/10 blur-[100px]"
        aria-hidden="true"
      />

      {step === "phone" && (
        <div className="animate-fade-in-up relative w-full max-w-sm rounded-xl2 bg-white p-8 shadow-2xl">
          <div className="mx-auto mb-5 flex h-12 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-ember/15 to-ember/5">
            <PulseMark className="h-5 w-9 text-ember" />
          </div>
          <h1 className="text-center font-display text-xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-1 text-center text-sm text-muted">
            Enter your phone number to continue
          </p>
          <form onSubmit={handlePhoneSubmit} className="mt-6">
            <div
              className={clsx(
                "flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow",
                phoneError ? "border-ember" : "border-line",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-ember focus-within:ring-offset-2 focus-within:ring-offset-paper",
              )}
            >
              <span className="flex items-center border-r border-line bg-paper px-3 text-sm font-medium text-muted">
                +91
              </span>
              <input
                autoFocus
                inputMode="numeric"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="98765 43210"
                className="w-full px-3 py-2.5 text-sm outline-none"
              />
            </div>
            {phoneError && (
              <p className="mt-2 text-sm font-medium text-ember-dark">
                {phoneError}
              </p>
            )}
            <button
              type="submit"
              disabled={lookingUp}
              className="focus-ring mt-4 w-full rounded-xl bg-ember py-3 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
            >
              {lookingUp ? "Checking…" : "Continue"}
            </button>
          </form>
        </div>
      )}

      {step === "select-org" && (
        <div className="animate-fade-in-up relative w-full max-w-sm rounded-xl2 bg-white p-8 shadow-2xl">
          <button
            onClick={backToPhone}
            className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} /> Change number
          </button>
          <h1 className="text-center font-display text-xl font-semibold tracking-tight">
            You're staff at more than one gym
          </h1>
          <p className="mt-1 text-center text-sm text-muted">Which one?</p>
          <div className="mt-6 space-y-2">
            {matches.map((m) => (
              <button
                key={m.organization_id}
                onClick={() => selectOrg(m)}
                className="focus-ring group flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-ember/40 hover:shadow-card"
              >
                <span
                  className={clsx(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-sm font-semibold text-white",
                    avatarTone(m.organization_id),
                  )}
                >
                  {m.organization_name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.organization_name}
                  </span>
                  <span className="block text-xs uppercase tracking-wide text-muted">
                    {m.role.replace("_", " ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "pin" && staff && (
        <div className="animate-fade-in-up relative w-full max-w-xs rounded-xl2 bg-white p-8 text-center shadow-2xl">
          <span
            className={clsx(
              "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br font-display text-lg font-semibold text-white",
              avatarTone(staff.organization_id + staff.name),
            )}
          >
            {staff.name.charAt(0).toUpperCase()}
          </span>
          <p className="text-sm text-muted">
            Hi <span className="font-medium text-ink">{staff.name}</span>,
            enter your PIN
          </p>
          <div className="my-6 flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={clsx(
                  "h-3 w-3 rounded-full border-2 transition-all duration-150",
                  pin.length > i
                    ? "scale-110 border-ember bg-ember"
                    : "border-line",
                )}
              />
            ))}
          </div>
          {lockedUntil ? (
            <p className="mb-3 text-sm font-medium text-ember-dark">
              Too many attempts — try again in {formatCountdown(secondsLeft)}
            </p>
          ) : (
            error && (
              <p className="mb-3 text-sm font-medium text-ember-dark">
                {error}
              </p>
            )
          )}
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => submitPin(pin + n)}
                disabled={submitting || !!lockedUntil}
                className="focus-ring rounded-xl border border-line py-3 font-display text-lg transition-all duration-150 hover:border-ember hover:bg-ember/5 active:scale-95 disabled:opacity-40"
              >
                {n}
              </button>
            ))}
            <button
              onClick={backFromPin}
              className="focus-ring rounded-xl py-3 text-sm text-muted transition-colors hover:bg-paper"
            >
              Back
            </button>
            <button
              onClick={() => submitPin(pin + "0")}
              disabled={submitting || !!lockedUntil}
              className="focus-ring rounded-xl border border-line py-3 font-display text-lg transition-all duration-150 hover:border-ember hover:bg-ember/5 active:scale-95 disabled:opacity-40"
            >
              0
            </button>
            <button
              onClick={() => setPin(pin.slice(0, -1))}
              disabled={submitting || !!lockedUntil}
              className="focus-ring rounded-xl py-3 text-sm text-muted transition-colors hover:bg-paper disabled:opacity-40"
            >
              Del
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

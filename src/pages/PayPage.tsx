import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, LinkIcon, PauseCircle, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import {
  PayPageError,
  claimPaid,
  getPayPage,
  type PayPageData,
  type PayPageFailure,
} from "../lib/payPage";
import { PayCard } from "../components/PayCard";

// PUBLIC route (/pay/:token): outside RequireAuth and AppShell — no session
// exists for a member; the 128-bit token is the credential. Phone-first.

const REFRESH_MARGIN_S = 60; // refresh the signed QR link this long before it dies

const FAILURE_COPY: Record<PayPageFailure, { icon: ReactNode; title: string; body: string }> = {
  not_found: {
    icon: <Clock size={28} />,
    title: "This payment link isn't valid",
    body: "It may have expired, been replaced by a newer link, or the gym may have changed how it takes payments. Please ask your gym for a fresh link.",
  },
  paused: {
    icon: <PauseCircle size={28} />,
    title: "Payments are unavailable right now",
    body: "This gym can't take payments through this page at the moment. Please contact the gym directly.",
  },
  rate_limited: {
    icon: <Clock size={28} />,
    title: "Too many tries",
    body: "Please wait a minute and then reload this page.",
  },
  error: {
    icon: <WifiOff size={28} />,
    title: "Couldn't load this page",
    body: "Check your internet connection and try again.",
  },
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-6">
        {children}
        <p className="mt-6 text-center text-xs text-muted">Secure payment page</p>
      </div>
    </div>
  );
}

export function PayPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PayPageData | null>(null);
  const [failure, setFailure] = useState<PayPageFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimedLocal, setClaimedLocal] = useState(false);
  const loadedAt = useRef(0);
  const expiresIn = useRef(300);
  const refreshing = useRef(false);

  const load = useCallback(
    async (initial: boolean) => {
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        const d = await getPayPage(token);
        setData(d);
        setFailure(null);
        loadedAt.current = Date.now();
        expiresIn.current = d.qr_url_expires_in || 300;
      } catch (e) {
        // A failed background refresh keeps what's on screen; only the first
        // load (or a definitive "gone") replaces the page.
        const kind = e instanceof PayPageError ? e.kind : "error";
        if (initial || kind === "not_found" || kind === "paused") setFailure(kind);
      } finally {
        refreshing.current = false;
        if (initial) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load(true);
  }, [load]);

  // Refresh the signed QR link before it expires: on a timer, and when the tab
  // comes back to the foreground after sitting idle (timers are throttled).
  useEffect(() => {
    if (!data) return;
    const dueMs = Math.max(
      (expiresIn.current - REFRESH_MARGIN_S) * 1000 - (Date.now() - loadedAt.current),
      5000,
    );
    const t = setTimeout(() => load(false), dueMs);
    return () => clearTimeout(t);
  }, [data, load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible" || !loadedAt.current) return;
      if (Date.now() - loadedAt.current > (expiresIn.current - REFRESH_MARGIN_S) * 1000) {
        load(false);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function handleClaim() {
    if (claiming) return;
    setClaiming(true);
    setClaimError("");
    try {
      await claimPaid(token);
      setClaimedLocal(true);
    } catch (e) {
      const kind = e instanceof PayPageError ? e.kind : "error";
      if (kind === "not_found" || kind === "paused") setFailure(kind);
      else if (kind === "rate_limited") setClaimError("Too many tries. Please wait a minute and try again.");
      else setClaimError("Couldn't send that. Check your connection and tap again.");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <p className="mt-24 text-sm text-muted" role="status">Loading…</p>
      </Shell>
    );
  }

  if (failure || !data) {
    const copy = FAILURE_COPY[failure ?? "error"];
    return (
      <Shell>
        <div
          data-testid={`pay-${failure ?? "error"}`}
          className="mt-16 w-full rounded-xl2 border border-line/70 bg-white p-6 text-center shadow-card"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-muted">
            {copy.icon ?? <LinkIcon size={28} />}
          </div>
          <h1 className="font-display text-lg font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted">{copy.body}</p>
          {(failure === "error" || failure === "rate_limited") && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setFailure(null);
                load(true);
              }}
              className="focus-ring mt-4 min-h-[44px] rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <PayCard
        gymName={data.gym_name}
        firstName={data.member_first_name}
        planName={data.plan_name}
        amount={data.amount}
        upiId={data.upi_id}
        qrUrl={data.qr_url}
        razorpay={data.options.razorpay}
        claimed={data.claimed_paid || claimedLocal}
        claiming={claiming}
        claimError={claimError}
        onClaim={handleClaim}
        onQrError={() => load(false)}
      />
    </Shell>
  );
}

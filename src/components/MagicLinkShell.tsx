import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { PulseMark } from "./PulseMark";

export type MagicLinkStep = "checking" | "error" | "ready";

// Shared chrome for the owner/front_desk magic-link destination pages
// (/members/add, /pt/add) — same "checking / error / ready" shape
// CoachQuickLog already renders inline for its own coach flow, pulled out
// here since both new pages need it. Deliberately has NO "sign in with PIN
// instead" escape hatch on the error state, unlike CoachQuickLog's own
// version — the task is explicit that the only path forward on an invalid
// or expired link here is texting the bot again for a fresh one, so this
// isn't a trimmed-down copy, it's a different, narrower contract.
export function MagicLinkShell({
  step,
  errorMessage,
  children,
}: {
  step: MagicLinkStep;
  errorMessage: string;
  children: ReactNode;
}) {
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
          </div>
        )}

        {step === "ready" && <div className="animate-fade-in-up">{children}</div>}
      </div>
    </div>
  );
}

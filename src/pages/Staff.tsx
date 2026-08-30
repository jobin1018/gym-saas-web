import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import { resetStaffPin, PinResetError } from "../lib/staffAdmin";
import { Toast, type ToastState } from "../components/Toast";

type StaffMember = {
  id: string;
  name: string;
  role: "owner" | "front_desk" | "coach";
  phone: string;
};

const ROLE_STYLES: Record<StaffMember["role"], string> = {
  owner: "bg-amberflag/15 text-amberflag",
  front_desk: "bg-sage/10 text-sage-dark",
  coach: "bg-ember/10 text-ember-dark",
};

function ResetPinModal({
  staffMember,
  onClose,
  onDone,
}: {
  staffMember: StaffMember;
  onClose: () => void;
  onDone: (message: ToastState) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter a 4-digit PIN");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await resetStaffPin(staffMember.id, pin);
      onDone({ kind: "success", message: `PIN reset for ${staffMember.name}.` });
      onClose();
    } catch (err) {
      setError(err instanceof PinResetError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-sm rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Reset PIN
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          Set a new 4-digit PIN for{" "}
          <span className="font-medium text-ink">{staffMember.name}</span>.
          They'll use it immediately — any lockout on their account clears too.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              New PIN
            </label>
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                if (error) setError("");
              }}
              autoFocus
              placeholder="••••"
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-center font-display text-lg tracking-[0.5em] shadow-sm transition-shadow"
            />
            {error && <p className="mt-1 text-xs text-ember-dark">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? "Resetting…" : "Reset PIN"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    supabase
      .from("staff_directory")
      .select("id, name, role, phone")
      .order("role")
      .order("name")
      .then(({ data }) => data && setStaff(data));
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Staff
      </h1>
      <p className="mt-1 text-sm text-muted">
        Reset a staff member's login PIN. Only you can see this page.
      </p>

      {toast && (
        <div className="mt-4">
          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
      )}

      <div className="mt-5 space-y-2">
        {staff.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-xl2 border border-line/70 bg-white px-5 py-3.5 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink/10 to-ink/[0.03] font-display text-sm font-semibold text-ink">
                {s.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted">{s.phone}</p>
              </div>
              <span
                className={clsx(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                  ROLE_STYLES[s.role],
                )}
              >
                {s.role.replace("_", " ")}
              </span>
            </div>
            <button
              onClick={() => setResetting(s)}
              className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <KeyRound size={14} /> Reset PIN
            </button>
          </div>
        ))}
        {staff.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            No staff found.
          </p>
        )}
      </div>

      {resetting && (
        <ResetPinModal
          staffMember={resetting}
          onClose={() => setResetting(null)}
          onDone={setToast}
        />
      )}
    </div>
  );
}

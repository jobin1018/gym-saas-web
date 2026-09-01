import { useEffect, useState } from "react";
import { KeyRound, X, Plus, UserX, RotateCcw, Pencil } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import {
  resetStaffPin,
  createStaff,
  editStaff,
  setStaffActive,
  PinResetError,
  StaffManageError,
} from "../lib/staffAdmin";
import { normalizeLocalPhone, toLocalDigits } from "../lib/phone";
import { Toast, type ToastState } from "../components/Toast";

type StaffMember = {
  id: string;
  name: string;
  role: "owner" | "front_desk" | "coach";
  phone: string;
  active: boolean;
  location_id: string | null;
};

type Location = { id: string; name: string };

const ROLE_STYLES: Record<StaffMember["role"], string> = {
  owner: "bg-amberflag/15 text-amberflag",
  front_desk: "bg-sage/10 text-sage-dark",
  coach: "bg-ember/10 text-ember-dark",
};

const ROLE_OPTIONS: { value: StaffMember["role"]; label: string }[] = [
  { value: "front_desk", label: "Front desk" },
  { value: "coach", label: "Coach" },
  { value: "owner", label: "Owner" },
];

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

function AddStaffModal({
  locations,
  onClose,
  onSaved,
}: {
  locations: Location[];
  onClose: () => void;
  onSaved: (message: ToastState) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffMember["role"]>("front_desk");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const needsLocation = role !== "owner";

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    // Same "+91" fixed-chip UI as MemberFormModal — normalizeLocalPhone is
    // the canonical helper for that shape, matching every other phone
    // already stored (91XXXXXXXXXX). Rolling a bare-digits check here would
    // silently drop the country code staff-manage still expects.
    const phoneResult = normalizeLocalPhone(phone);
    if (phoneResult.error) errs.phone = phoneResult.error;
    if (needsLocation && !locationId) errs.location = "Select a location";
    if (!/^\d{4}$/.test(pin)) errs.pin = "PIN must be 4 digits";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      // validate() already confirmed this parses, so the assertion is safe.
      const normalizedPhone = normalizeLocalPhone(phone).value!;
      await createStaff({
        name: name.trim(),
        phone: normalizedPhone,
        role,
        location_id: needsLocation ? locationId : null,
        pin,
      });
      onSaved({ kind: "success", message: `${name.trim()} added.` });
      onClose();
    } catch (err) {
      setServerError(err instanceof StaffManageError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Add staff
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {serverError && <p className="mb-4 text-sm text-ember-dark">{serverError}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
            {errors.name && <p className="mt-1 text-xs text-ember-dark">{errors.name}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
            <div
              className={clsx(
                "flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow",
                errors.phone ? "border-ember" : "border-line",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-ember focus-within:ring-offset-2 focus-within:ring-offset-paper",
              )}
            >
              <span className="flex items-center border-r border-line bg-paper px-3 text-sm font-medium text-muted">
                +91
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="w-full px-3 py-2.5 text-sm outline-none"
              />
            </div>
            {errors.phone && <p className="mt-1 text-xs text-ember-dark">{errors.phone}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffMember["role"])}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {needsLocation && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {errors.location && (
                <p className="mt-1 text-xs text-ember-dark">{errors.location}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Initial PIN</label>
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-center font-display text-lg tracking-[0.5em] shadow-sm transition-shadow"
            />
            {errors.pin && <p className="mt-1 text-xs text-ember-dark">{errors.pin}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              {submitting ? "Adding…" : "Add staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditStaffModal({
  staffMember,
  locations,
  onClose,
  onSaved,
}: {
  staffMember: StaffMember;
  locations: Location[];
  onClose: () => void;
  onSaved: (message: ToastState) => void;
}) {
  const [name, setName] = useState(staffMember.name);
  const [phone, setPhone] = useState(toLocalDigits(staffMember.phone));
  const [role, setRole] = useState<StaffMember["role"]>(staffMember.role);
  const [locationId, setLocationId] = useState(
    staffMember.location_id ?? locations[0]?.id ?? "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const needsLocation = role !== "owner";

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    const phoneResult = normalizeLocalPhone(phone);
    if (phoneResult.error) errs.phone = phoneResult.error;
    if (needsLocation && !locationId) errs.location = "Select a location";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setSubmitting(true);
    try {
      const normalizedPhone = normalizeLocalPhone(phone).value!;
      await editStaff({
        target_user_id: staffMember.id,
        name: name.trim(),
        phone: normalizedPhone,
        role,
        location_id: needsLocation ? locationId : null,
      });
      onSaved({ kind: "success", message: `${name.trim()} updated.` });
      onClose();
    } catch (err) {
      // staffAdmin already turns coach_has_active_packages into a specific,
      // count-bearing message (see callStaffManage) — this branch just
      // decides generic vs. that, same pattern as every other modal here.
      setServerError(err instanceof StaffManageError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Edit staff
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {serverError && <p className="mb-4 text-sm text-ember-dark">{serverError}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
            {errors.name && <p className="mt-1 text-xs text-ember-dark">{errors.name}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
            <div
              className={clsx(
                "flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow",
                errors.phone ? "border-ember" : "border-line",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-ember focus-within:ring-offset-2 focus-within:ring-offset-paper",
              )}
            >
              <span className="flex items-center border-r border-line bg-paper px-3 text-sm font-medium text-muted">
                +91
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="w-full px-3 py-2.5 text-sm outline-none"
              />
            </div>
            {errors.phone && <p className="mt-1 text-xs text-ember-dark">{errors.phone}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffMember["role"])}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {staffMember.role === "coach" && role !== "coach" && (
              <p className="mt-1 text-xs text-amberflag">
                Changing this coach's role is blocked if they still have
                active PT packages — reassign or complete those first.
              </p>
            )}
          </div>

          {needsLocation && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              {errors.location && (
                <p className="mt-1 text-xs text-ember-dark">{errors.location}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeactivateConfirmModal({
  staffMember,
  onClose,
  onDone,
}: {
  staffMember: StaffMember;
  onClose: () => void;
  onDone: (message: ToastState) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setSubmitting(true);
    setError("");
    try {
      await setStaffActive(staffMember.id, false);
      onDone({ kind: "success", message: `${staffMember.name} deactivated.` });
      onClose();
    } catch (err) {
      setError(err instanceof StaffManageError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-sm rounded-xl2 bg-white p-6 shadow-2xl">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ember/10 text-ember-dark">
          <UserX size={20} />
        </span>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Deactivate {staffMember.name}?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This immediately revokes their access — they won't be able to sign
          in, and any active session is ended right away. You can reactivate
          them later from the Inactive tab.
        </p>
        {error && <p className="mt-3 text-xs text-ember-dark">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Staff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [deactivating, setDeactivating] = useState<StaffMember | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  function refresh() {
    supabase
      .from("staff_directory")
      .select("id, name, role, phone, active, location_id")
      .order("role")
      .order("name")
      .then(({ data }) => data && setStaff(data));
  }

  useEffect(() => {
    refresh();
    supabase
      .from("locations")
      .select("id, name")
      .then(({ data }) => data && setLocations(data));
  }, []);

  async function handleReactivate(s: StaffMember) {
    setReactivatingId(s.id);
    try {
      await setStaffActive(s.id, true);
      refresh();
      setToast({ kind: "success", message: `${s.name} reactivated.` });
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof StaffManageError ? err.message : "Something went wrong.",
      });
    } finally {
      setReactivatingId(null);
    }
  }

  const visible = staff.filter((s) => (tab === "active" ? s.active : !s.active));
  const inactiveCount = staff.filter((s) => !s.active).length;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Staff
          </h1>
          <p className="mt-1 text-sm text-muted">
            Add staff, reset PINs, and manage access. Only you can see this
            page.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="focus-ring flex items-center gap-2 rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-ember-dark hover:shadow-glow-ember active:translate-y-0"
        >
          <Plus size={16} /> Add staff
        </button>
      </div>

      {toast && (
        <div className="mt-4">
          <Toast toast={toast} onDismiss={() => setToast(null)} />
        </div>
      )}

      <div className="mt-5 flex rounded-lg border border-line bg-white p-1 shadow-sm w-fit">
        <button
          onClick={() => setTab("active")}
          className={clsx(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
            tab === "active" ? "bg-ember text-white shadow-glow-ember" : "text-muted hover:text-ink",
          )}
        >
          Active
        </button>
        <button
          onClick={() => setTab("inactive")}
          className={clsx(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
            tab === "inactive" ? "bg-ember text-white shadow-glow-ember" : "text-muted hover:text-ink",
          )}
        >
          Inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {visible.map((s) => (
          <div
            key={s.id}
            className={clsx(
              "flex items-center justify-between rounded-xl2 border border-line/70 bg-white px-5 py-3.5 shadow-card",
              !s.active && "opacity-60",
            )}
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
            <div className="flex items-center gap-1.5">
              {s.active ? (
                <>
                  <button
                    onClick={() => setEditing(s)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => setResetting(s)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-paper hover:text-ink"
                  >
                    <KeyRound size={14} /> Reset PIN
                  </button>
                  <button
                    onClick={() => setDeactivating(s)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ember-dark transition-colors hover:bg-ember/10"
                  >
                    <UserX size={14} /> Deactivate
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleReactivate(s)}
                  disabled={reactivatingId === s.id}
                  className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-sage-dark transition-colors hover:bg-sage/10 disabled:opacity-50"
                >
                  <RotateCcw size={14} /> Reactivate
                </button>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="rounded-xl2 border border-dashed border-line bg-white px-5 py-10 text-center text-sm text-muted">
            {tab === "active" ? "No active staff found." : "No inactive staff."}
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
      {editing && (
        <EditStaffModal
          staffMember={editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            refresh();
            setToast(t);
          }}
        />
      )}
      {deactivating && (
        <DeactivateConfirmModal
          staffMember={deactivating}
          onClose={() => setDeactivating(null)}
          onDone={(t) => {
            refresh();
            setToast(t);
          }}
        />
      )}
      {showAdd && (
        <AddStaffModal
          locations={locations}
          onClose={() => setShowAdd(false)}
          onSaved={(t) => {
            refresh();
            setToast(t);
          }}
        />
      )}
    </div>
  );
}

import { useState } from "react";
import { X, Pencil } from "lucide-react";
import { computeBmi, type Measurement } from "../../lib/mockCoachData";

export function AddMeasurementModal({
  currentHeightCm,
  onClose,
  onSave,
}: {
  currentHeightCm: number;
  onClose: () => void;
  onSave: (measurement: Measurement, heightCm: number) => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState(String(currentHeightCm));
  // Height rarely changes for an adult member, so it defaults to read-only
  // (the client's last-recorded height) and only becomes editable if the
  // coach explicitly asks to correct it — not re-entered on every weigh-in.
  const [editingHeight, setEditingHeight] = useState(false);
  const [error, setError] = useState("");

  const parsedWeight = Number(weight);
  const parsedHeight = Number(height);
  const liveBmi =
    weight.trim() && !Number.isNaN(parsedWeight) && parsedHeight > 0
      ? computeBmi(parsedWeight, parsedHeight)
      : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!weight.trim() || Number.isNaN(parsedWeight)) {
      setError("Enter a weight");
      return;
    }
    if (parsedWeight < 30 || parsedWeight > 300) {
      setError("Doesn't look like a realistic weight (30–300 kg)");
      return;
    }
    if (editingHeight && (Number.isNaN(parsedHeight) || parsedHeight < 100 || parsedHeight > 250)) {
      setError("Doesn't look like a realistic height (100–250 cm)");
      return;
    }
    onSave(
      { date, weightKg: Math.round(parsedWeight * 10) / 10 },
      Math.round(parsedHeight),
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="animate-fade-in-up w-full max-w-md rounded-xl2 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            Add measurement
          </h2>
          <button
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Weight (kg)
            </label>
            <input
              inputMode="decimal"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value);
                if (error) setError("");
              }}
              placeholder="72.5"
              className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-muted">
                Height (cm)
              </label>
              {!editingHeight && (
                <button
                  type="button"
                  onClick={() => setEditingHeight(true)}
                  className="focus-ring flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
                >
                  <Pencil size={11} /> Update height
                </button>
              )}
            </div>
            {editingHeight ? (
              <input
                inputMode="decimal"
                value={height}
                onChange={(e) => {
                  setHeight(e.target.value);
                  if (error) setError("");
                }}
                autoFocus
                className="focus-ring w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow"
              />
            ) : (
              <p className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-muted">
                {currentHeightCm} cm (last recorded)
              </p>
            )}
          </div>

          <div
            className={
              liveBmi
                ? "rounded-lg bg-sage/10 px-3 py-2.5 text-sm"
                : "rounded-lg bg-paper px-3 py-2.5 text-sm text-muted"
            }
          >
            {liveBmi ? (
              <>
                Resulting BMI:{" "}
                <span className="font-display font-semibold text-sage-dark">
                  {liveBmi}
                </span>
              </>
            ) : (
              "Enter weight to see the resulting BMI"
            )}
          </div>

          {error && <p className="text-xs text-ember-dark">{error}</p>}

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
              className="focus-ring rounded-lg bg-sage px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-sage-dark hover:shadow-glow-sage active:scale-[0.98]"
            >
              Save measurement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

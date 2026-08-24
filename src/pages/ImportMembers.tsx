import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, ArrowLeft, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import { parseMembersCsv, type ParsedMemberRow } from "../lib/csv";
import {
  importMembersBatch,
  isNetworkError,
  type CsvImportRow,
} from "../lib/memberWrites";
import {
  getPendingWrites,
  queuePendingWrite,
  retryPendingWrites,
} from "../lib/offlineQueue";

type Plan = { id: string; name: string };

export function ImportMembers() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rows, setRows] = useState<ParsedMemberRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [networkQueuedId, setNetworkQueuedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    supabase
      .from("membership_plans")
      .select("id, name")
      .eq("active", true)
      .then(({ data }) => data && setPlans(data));
  }, []);

  async function handleFile(file: File) {
    const text = await file.text();
    const planNames = new Set(plans.map((p) => p.name));
    setRows(parseMembersCsv(text, planNames));
    setSummary(null);
    setNetworkQueuedId(null);
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  async function handleImport() {
    const planByName = new Map(plans.map((p) => [p.name, p.id]));
    const importRows: CsvImportRow[] = validRows.map((r) => ({
      name: r.name,
      phone: r.phone,
      plan_id: planByName.get(r.plan_name)!,
      start_date: r.start_date,
    }));

    setImporting(true);
    try {
      await importMembersBatch({ rows: importRows });
      setSummary(
        `${validRows.length} imported, ${invalidRows.length} skipped.`,
      );
      setRows([]);
    } catch (err) {
      if (isNetworkError(err)) {
        // A whole failed CSV batch is queued as one unit rather than per-row:
        // this is a rare, one-shot action (not a form someone edits and
        // resubmits repeatedly), so there's no benefit to the complexity of
        // partial per-row retry — either the whole batch goes in once
        // connectivity returns, or it's still sitting here to retry by hand.
        const id = queuePendingWrite({
          kind: "csv_import",
          payload: { rows: importRows },
        });
        setNetworkQueuedId(id);
      } else {
        setSummary("Something went wrong — please try again.");
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleRetryQueued() {
    if (!networkQueuedId) return;
    setImporting(true);
    await retryPendingWrites();
    const stillPending = getPendingWrites().some(
      (w) => w.id === networkQueuedId,
    );
    setImporting(false);
    if (!stillPending) {
      setNetworkQueuedId(null);
      setSummary(`${validRows.length} imported, ${invalidRows.length} skipped.`);
    }
  }

  return (
    <div className="max-w-4xl">
      <button
        onClick={() => navigate("/members")}
        className="focus-ring mb-4 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to members
      </button>

      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Import members
      </h1>
      <p className="mt-1 text-sm text-muted">
        CSV columns: name, phone, plan_name, start_date (optional).
      </p>

      {networkQueuedId ? (
        <div className="mt-5 rounded-lg border border-amberflag/30 bg-amberflag/10 p-4 text-sm">
          <p className="font-medium text-ink">
            Couldn't save — check your connection.
          </p>
          <p className="mt-1 text-muted">
            This batch of {validRows.length} rows is queued and will import
            automatically once you're back online, or tap retry now.
          </p>
          <button
            onClick={handleRetryQueued}
            disabled={importing}
            className="focus-ring mt-3 flex items-center gap-2 rounded-lg bg-ember px-3 py-1.5 text-xs font-medium text-white hover:bg-ember-dark disabled:opacity-60"
          >
            {importing && <RefreshCw size={14} className="animate-spin" />}
            Retry now
          </button>
        </div>
      ) : null}

      {summary && !networkQueuedId && (
        <div className="mt-5 rounded-lg border border-sage/30 bg-sage/10 px-4 py-3 text-sm font-medium text-sage-dark">
          {summary}
        </div>
      )}

      {rows.length === 0 && !summary && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={clsx(
            "group mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-xl2 border-2 border-dashed bg-white px-6 py-14 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-ember/50 hover:shadow-card-hover",
            dragActive ? "border-ember bg-ember/5" : "border-line",
          )}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-ember/15 to-ember/5 transition-transform duration-200 group-hover:scale-110">
            <Upload size={20} className="text-ember" />
          </span>
          <span className="text-sm font-medium">
            Click to choose a CSV file
          </span>
          <span className="text-xs text-muted">or drag and drop it here</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-5 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-4 py-2.5 font-medium">Row</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Plan</th>
                  <th className="px-4 py-2.5 font-medium">Start</th>
                  <th className="px-4 py-2.5 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.line}
                    className={clsx(
                      "border-b border-line/70 transition-colors last:border-0",
                      r.errors.length > 0 ? "bg-ember/5" : "hover:bg-paper/60",
                    )}
                  >
                    <td className="px-4 py-2.5 text-muted">{r.line}</td>
                    <td className="px-4 py-2.5">{r.name || "—"}</td>
                    <td className="px-4 py-2.5">{r.phone || "—"}</td>
                    <td className="px-4 py-2.5">{r.plan_name || "—"}</td>
                    <td className="px-4 py-2.5">{r.start_date}</td>
                    <td className="px-4 py-2.5 text-ember-dark">
                      {r.errors.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted">
              {validRows.length} valid, {invalidRows.length} will be skipped
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setRows([])}
                className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-paper"
              >
                Choose different file
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="focus-ring rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-ember-dark hover:shadow-glow-ember active:scale-[0.98] disabled:opacity-60"
              >
                {importing
                  ? "Importing…"
                  : `Import ${validRows.length} member${validRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

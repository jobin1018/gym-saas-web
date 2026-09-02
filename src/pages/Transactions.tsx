import { useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Dumbbell, Wallet } from "lucide-react";
import clsx from "clsx";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

type PaymentStatus = "success" | "failed" | "pending" | "manual";
type PaymentType = "membership" | "personal_training";

type LedgerRow = {
  id: string;
  member_name: string;
  location_id: string;
  transaction_date: string;
  amount: number;
  status: PaymentStatus;
  provider: "razorpay" | "manual";
  provider_payment_id: string | null;
  payment_type: PaymentType;
};

type Location = { id: string; name: string };

const PAGE_SIZE = 20;

const STATUS_OPTIONS: PaymentStatus[] = ["success", "failed", "pending", "manual"];
const TYPE_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: "membership", label: "Membership" },
  { value: "personal_training", label: "PT" },
];

// Same pill+dot visual convention as StatusBadge.tsx, built locally rather
// than importing it — StatusBadge is typed to membership status
// (active/past_due/expired/cancelled), a different union, and this page is
// meant to stay fully isolated from every other production file.
const STATUS_STYLES: Record<PaymentStatus, string> = {
  success: "bg-sage/10 text-sage-dark",
  failed: "bg-ember/10 text-ember-dark",
  pending: "bg-amberflag/15 text-amberflag",
  // A manual entry IS a completed, money-in-hand transaction (front desk
  // recorded a cash/UPI payment directly) — same positive tone as success,
  // just labelled for what it actually says in the data (status='manual'
  // literally, not a synthesized "success").
  manual: "bg-sage/10 text-sage-dark",
};
const STATUS_DOT: Record<PaymentStatus, string> = {
  success: "bg-sage",
  failed: "bg-ember",
  pending: "bg-amberflag",
  manual: "bg-sage",
};
const STATUS_LABEL: Record<PaymentStatus, string> = {
  success: "Success",
  failed: "Failed",
  pending: "Pending",
  manual: "Manual",
};

const TYPE_STYLES: Record<PaymentType, string> = {
  membership: "bg-ink/5 text-ink",
  personal_training: "bg-amberflag/15 text-amberflag",
};

function PaymentTypeBadge({ type }: { type: PaymentType }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        TYPE_STYLES[type],
      )}
    >
      {type === "personal_training" && <Dumbbell size={11} />}
      {type === "personal_training" ? "PT" : "Membership"}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Transactions() {
  const { claims } = useAuth();
  const isOwner = claims?.role === "owner";

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [type, setType] = useState<PaymentType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);

  function refresh() {
    // Same established pattern as Members.tsx: .range(from, to) +
    // { count: 'exact' } + deterministic ordering (date desc, id as a
    // tiebreak so paging stays stable when timestamps collide).
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from("v_payments_ledger").select("*", { count: "exact" });

    if (debouncedQuery.trim()) {
      const term = debouncedQuery.trim().replace(/[%,]/g, "");
      q = q.ilike("member_name", `%${term}%`);
    }
    if (status) q = q.eq("status", status);
    if (type) q = q.eq("payment_type", type);
    if (locationId) q = q.eq("location_id", locationId);
    if (dateFrom) q = q.gte("transaction_date", dateFrom);
    if (dateTo) q = q.lte("transaction_date", `${dateTo}T23:59:59.999`);

    q.order("transaction_date", { ascending: false })
      .order("id")
      .range(from, to)
      .then(({ data, count }) => {
        const r = (data as unknown as LedgerRow[]) ?? [];
        setRows(r);
        setTotal(count ?? r.length);
      });
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Any filter change resets to page 0 — same reasoning as Members.tsx's
  // search: staying on e.g. page 3 while a narrower filter renders would
  // just show an empty page.
  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, status, type, dateFrom, dateTo, locationId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedQuery, status, type, dateFrom, dateTo, locationId]);

  useEffect(() => {
    // Location filter is owner-only (front_desk is already server-side
    // scoped to their own location by the view itself — see
    // v_payments_ledger's WHERE clause — so a filter for them would be
    // redundant), and only shown at all when the org has more than one
    // branch to filter between.
    if (isOwner) {
      supabase
        .from("locations")
        .select("id, name")
        .then(({ data }) => data && setLocations(data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectClass =
    "focus-ring rounded-lg border border-line bg-white px-3 py-2.5 text-sm shadow-sm transition-shadow";

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Transactions
      </h1>
      <p className="mt-1 text-sm text-muted">
        Every membership and PT payment recorded{isOwner ? " across all locations" : " for your location"}.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by member name"
            className="focus-ring w-full rounded-lg border border-line bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm transition-shadow focus:shadow-card"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as PaymentStatus | "")}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as PaymentType | "")}
          className={selectClass}
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {isOwner && locations.length > 1 && (
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className={selectClass}
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
          className={selectClass}
        />
        <span className="text-sm text-muted">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
          className={selectClass}
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-xl2 border border-line/70 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="px-5 py-2.5 font-medium">Member</th>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 font-medium">Amount</th>
                <th className="px-5 py-2.5 font-medium">Transaction ID</th>
                <th className="px-5 py-2.5 font-medium">Type</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Method</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-line/70 transition-colors last:border-0 hover:bg-paper/60"
                >
                  <td className="px-5 py-3.5 font-medium">{r.member_name}</td>
                  <td className="px-5 py-3.5 text-muted">
                    {new Date(r.transaction_date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3.5">
                    ₹{Number(r.amount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">
                    {r.provider_payment_id ?? "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <PaymentTypeBadge type={r.payment_type} />
                  </td>
                  <td className="px-5 py-3.5">
                    <PaymentStatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-3.5 capitalize text-muted">
                    {r.provider === "razorpay" ? "Razorpay" : "Manual"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center text-sm text-muted">
            <Wallet size={20} className="text-muted/60" />
            No transactions match these filters.
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted">
            {total} transaction{total === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

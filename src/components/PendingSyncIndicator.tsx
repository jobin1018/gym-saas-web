import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import {
  getPendingWrites,
  retryPendingWrites,
  subscribeToPendingWrites,
} from "../lib/offlineQueue";

export function PendingSyncIndicator() {
  const [count, setCount] = useState(() => getPendingWrites().length);
  const [retrying, setRetrying] = useState(false);

  useEffect(
    () => subscribeToPendingWrites(() => setCount(getPendingWrites().length)),
    [],
  );

  if (count === 0) return null;

  async function handleRetry() {
    setRetrying(true);
    await retryPendingWrites();
    setRetrying(false);
  }

  return (
    <button
      onClick={handleRetry}
      disabled={retrying}
      className="focus-ring mb-2 flex w-full items-center gap-2 rounded-xl bg-amberflag/15 px-3 py-2 text-left text-xs font-medium text-amberflag transition-colors hover:bg-amberflag/20"
    >
      {retrying ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : (
        <CloudOff size={14} />
      )}
      {count} change{count === 1 ? "" : "s"} waiting to sync — tap to retry
    </button>
  );
}

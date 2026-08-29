import {
  createMember,
  importMembersBatch,
  updateMemberAndMembership,
  type CsvImportPayload,
  type EditMemberPayload,
  type NewMemberPayload,
} from "./memberWrites";
import { logSession, type LogSessionPayload } from "./coachWrites";

type PendingWrite =
  | { id: string; kind: "add_member"; payload: NewMemberPayload; createdAt: string }
  | { id: string; kind: "edit_member"; payload: EditMemberPayload; createdAt: string }
  | { id: string; kind: "csv_import"; payload: CsvImportPayload; createdAt: string }
  | { id: string; kind: "log_session"; payload: LogSessionPayload; createdAt: string };

const STORAGE_KEY = "pending_writes";

// localStorage's own "storage" event only fires in OTHER tabs, not the one
// that made the change, so the pending-writes indicator needs its own
// same-tab pub/sub to know when to re-render.
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}

export function subscribeToPendingWrites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingWrites(): PendingWrite[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function savePendingWrites(writes: PendingWrite[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(writes));
  notify();
}

export function queuePendingWrite(
  write: Omit<PendingWrite, "id" | "createdAt">,
): string {
  const full: PendingWrite = {
    ...write,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  } as PendingWrite;
  savePendingWrites([...getPendingWrites(), full]);
  return full.id;
}

async function execute(write: PendingWrite): Promise<void> {
  if (write.kind === "add_member") return createMember(write.payload);
  if (write.kind === "edit_member") return updateMemberAndMembership(write.payload);
  if (write.kind === "csv_import") return importMembersBatch(write.payload);
  await logSession(write.payload);
}

let retrying = false;

export async function retryPendingWrites(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    const writes = getPendingWrites();
    const stillPending: PendingWrite[] = [];
    for (const write of writes) {
      try {
        await execute(write);
      } catch {
        // Still failing (offline again, or a real server error) — keep it
        // queued and try the rest; a later 'online' event will retry again.
        stillPending.push(write);
      }
    }
    savePendingWrites(stillPending);
  } finally {
    retrying = false;
  }
}

let initialized = false;

export function initOfflineQueue() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("online", () => {
    retryPendingWrites();
  });
  if (navigator.onLine) retryPendingWrites();
}

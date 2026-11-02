export const DISPLAY_INTERVAL_MS = 250;

/** Emit a snapshot every N batches so the UI refreshes about every displayIntervalMs. */
export function snapshotEvery(batchIntervalMs: number, displayIntervalMs = DISPLAY_INTERVAL_MS): number {
  return Math.max(1, Math.round(displayIntervalMs / batchIntervalMs));
}

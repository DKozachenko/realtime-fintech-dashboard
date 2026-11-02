export interface ProducerSettings {
  instrumentCount: number;
  updatesPerBatch: number;
  batchIntervalMs: number;
}

export const DEFAULT_SETTINGS: ProducerSettings = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

export const SETTINGS_LIMITS: Record<keyof ProducerSettings, { min: number; max: number }> = {
  instrumentCount: { min: 1, max: 50 },
  updatesPerBatch: { min: 1, max: 1000 },
  batchIntervalMs: { min: 50, max: 2000 },
};

export function sameSettings(a: ProducerSettings, b: ProducerSettings): boolean {
  return (
    a.instrumentCount === b.instrumentCount &&
    a.updatesPerBatch === b.updatesPerBatch &&
    a.batchIntervalMs === b.batchIntervalMs
  );
}

/** Nominal producer rate in updates per second. */
export function nominalRate(s: ProducerSettings): number {
  return (s.updatesPerBatch * 1000) / s.batchIntervalMs;
}

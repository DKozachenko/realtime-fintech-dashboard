import { DEFAULT_SETTINGS, nominalRate, sameSettings, SETTINGS_LIMITS } from './settings';

describe('settings', () => {
  it('has the documented defaults and limits', () => {
    expect(DEFAULT_SETTINGS).toEqual({ instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 500 });
    expect(SETTINGS_LIMITS.instrumentCount).toEqual({ min: 1, max: 50 });
    expect(SETTINGS_LIMITS.updatesPerBatch).toEqual({ min: 1, max: 1000 });
    expect(SETTINGS_LIMITS.batchIntervalMs).toEqual({ min: 50, max: 2000 });
  });

  it('computes the nominal rate', () => {
    expect(nominalRate(DEFAULT_SETTINGS)).toBe(200);
    expect(nominalRate({ instrumentCount: 1, updatesPerBatch: 1, batchIntervalMs: 2000 })).toBe(0.5);
    expect(nominalRate({ instrumentCount: 50, updatesPerBatch: 1000, batchIntervalMs: 50 })).toBe(20000);
  });

  it('compares settings field by field', () => {
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS })).toBeTrue();
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, instrumentCount: 6 })).toBeFalse();
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, updatesPerBatch: 101 })).toBeFalse();
    expect(sameSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, batchIntervalMs: 501 })).toBeFalse();
  });
});

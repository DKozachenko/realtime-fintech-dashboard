import { DISPLAY_INTERVAL_MS, snapshotEvery } from './snapshot-throttle';

describe('snapshot throttle (snapshotEvery)', () => {
  it('uses a 250 ms display interval by default', () => {
    expect(DISPLAY_INTERVAL_MS).toBe(250);
  });

  const cases: [number, number][] = [
    [50, 5], [60, 4], [100, 3], [130, 2], [150, 2], [170, 1], [200, 1], [500, 1], [600, 1], [2000, 1],
  ];
  for (const [interval, expected] of cases) {
    it(`batchIntervalMs ${interval} -> ${expected}`, () => {
      expect(snapshotEvery(interval)).toBe(expected);
    });
  }
});

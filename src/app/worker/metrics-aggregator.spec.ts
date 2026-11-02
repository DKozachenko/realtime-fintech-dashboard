import { emptyRows } from '../shared/instruments';
import { MetricsAggregator } from './metrics-aggregator';
import { encodeUpdates, MarketUpdate } from './testing/encode-updates';

function update(overrides: Partial<MarketUpdate>): MarketUpdate {
  return {
    instrument: 0,
    priceCents: 10000,
    tradeQuantity: 10,
    bidCents: 9996,
    askCents: 10000,
    bidQuantity: 600,
    askQuantity: 400,
    ...overrides,
  };
}

describe('MetricsAggregator', () => {
  it('worked example from the spec', () => {
    const agg = new MetricsAggregator(2);
    agg.apply(
      encodeUpdates([update({}), update({ priceCents: 10200, tradeQuantity: 30, bidCents: 10196, askCents: 10200 })]),
    );
    const { rows, tradesCounted } = agg.snapshot();
    expect(rows[0]).toEqual({
      lastPriceCents: 10200,
      spreadCents: 4,
      volume: 40,
      vwapCents: 10150,
      imbalance: 0.2,
    });
    expect(tradesCounted).toBe(2);
  });

  it('starts empty', () => {
    const snap = new MetricsAggregator(3).snapshot();
    expect(snap.rows).toEqual(emptyRows(3));
    expect(snap.tradesCounted).toBe(0);
  });

  it('imbalance is null when both book quantities are zero', () => {
    const agg = new MetricsAggregator(1);
    agg.apply(encodeUpdates([update({ bidQuantity: 0, askQuantity: 0 })]));
    expect(agg.snapshot().rows[0].imbalance).toBeNull();
  });

  it('isolates instruments', () => {
    const agg = new MetricsAggregator(2);
    agg.apply(encodeUpdates([update({ instrument: 0 })]));
    expect(agg.snapshot().rows[1]).toEqual(emptyRows(1)[0]);
  });

  it('keeps values for an instrument missing from a later batch', () => {
    const agg = new MetricsAggregator(2);
    agg.apply(encodeUpdates([update({ instrument: 0 }), update({ instrument: 1, priceCents: 5000 })]));
    const afterFirst = agg.snapshot().rows[1];
    agg.apply(encodeUpdates([update({ instrument: 0, priceCents: 10100 })]));
    expect(agg.snapshot().rows[1]).toEqual(afterFirst);
  });

  it('accumulates across batches', () => {
    const agg = new MetricsAggregator(1);
    agg.apply(encodeUpdates([update({})]));
    agg.apply(encodeUpdates([update({ priceCents: 10200, tradeQuantity: 30 }), update({ tradeQuantity: 0 })]));
    const { rows, tradesCounted } = agg.snapshot();
    expect(rows[0].volume).toBe(40);
    expect(rows[0].vwapCents).toBe(10150);
    expect(tradesCounted).toBe(3);
  });

  it('snapshot returns copies', () => {
    const agg = new MetricsAggregator(1);
    agg.apply(encodeUpdates([update({})]));
    const first = agg.snapshot();
    first.rows[0].volume = 999;
    first.rows.pop();
    expect(agg.snapshot().rows.length).toBe(1);
    expect(agg.snapshot().rows[0].volume).toBe(10);
  });
});

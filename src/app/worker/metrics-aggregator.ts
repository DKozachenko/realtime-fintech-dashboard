import { InstrumentMetrics } from '../shared/messages';
import { BatchField, FIELDS_PER_UPDATE } from './batch-layout';

/**
 * Keeps cumulative per-instrument state from flat update batches.
 * State lives in typed arrays; apply() allocates nothing per update.
 */
export class MetricsAggregator {
  private readonly seen: Uint8Array;
  private readonly lastPrice: Float64Array;
  private readonly bid: Float64Array;
  private readonly ask: Float64Array;
  private readonly bidQty: Float64Array;
  private readonly askQty: Float64Array;
  private readonly volume: Float64Array;
  private readonly priceVolume: Float64Array;
  private tradesCounted = 0;

  constructor(private readonly instrumentCount: number) {
    this.seen = new Uint8Array(instrumentCount);
    this.lastPrice = new Float64Array(instrumentCount);
    this.bid = new Float64Array(instrumentCount);
    this.ask = new Float64Array(instrumentCount);
    this.bidQty = new Float64Array(instrumentCount);
    this.askQty = new Float64Array(instrumentCount);
    this.volume = new Float64Array(instrumentCount);
    this.priceVolume = new Float64Array(instrumentCount);
  }

  apply(batch: Uint32Array): void {
    const count = Math.floor(batch.length / FIELDS_PER_UPDATE);
    for (let i = 0; i < count; i++) {
      const o = i * FIELDS_PER_UPDATE;
      const id = batch[o + BatchField.Instrument];
      const price = batch[o + BatchField.Price];
      const qty = batch[o + BatchField.TradeQty];
      this.seen[id] = 1;
      this.lastPrice[id] = price;
      this.bid[id] = batch[o + BatchField.Bid];
      this.ask[id] = batch[o + BatchField.Ask];
      this.bidQty[id] = batch[o + BatchField.BidQty];
      this.askQty[id] = batch[o + BatchField.AskQty];
      this.volume[id] += qty;
      this.priceVolume[id] += price * qty;
    }
    this.tradesCounted += count;
  }

  snapshot(): { rows: InstrumentMetrics[]; tradesCounted: number } {
    const rows: InstrumentMetrics[] = [];
    for (let id = 0; id < this.instrumentCount; id++) {
      if (!this.seen[id]) {
        rows.push({ lastPriceCents: null, spreadCents: null, volume: 0, vwapCents: null, imbalance: null });
        continue;
      }
      const volume = this.volume[id];
      const depth = this.bidQty[id] + this.askQty[id];
      rows.push({
        lastPriceCents: this.lastPrice[id],
        spreadCents: this.ask[id] - this.bid[id],
        volume,
        vwapCents: volume > 0 ? this.priceVolume[id] / volume : null,
        imbalance: depth > 0 ? (this.bidQty[id] - this.askQty[id]) / depth : null,
      });
    }
    return { rows, tradesCounted: this.tradesCounted };
  }
}

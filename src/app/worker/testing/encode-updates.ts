import { BatchField, FIELDS_PER_UPDATE } from '../batch-layout';

export interface MarketUpdate {
  instrument: number;
  priceCents: number;
  tradeQuantity: number;
  bidCents: number;
  askCents: number;
  bidQuantity: number;
  askQuantity: number;
}

/** Test helper: packs updates into the flat batch layout the worker consumes. */
export function encodeUpdates(updates: MarketUpdate[]): Uint32Array {
  const batch = new Uint32Array(updates.length * FIELDS_PER_UPDATE);
  updates.forEach((u, i) => {
    const o = i * FIELDS_PER_UPDATE;
    batch[o + BatchField.Instrument] = u.instrument;
    batch[o + BatchField.Price] = u.priceCents;
    batch[o + BatchField.TradeQty] = u.tradeQuantity;
    batch[o + BatchField.Bid] = u.bidCents;
    batch[o + BatchField.Ask] = u.askCents;
    batch[o + BatchField.BidQty] = u.bidQuantity;
    batch[o + BatchField.AskQty] = u.askQuantity;
  });
  return batch;
}

/** Number of numeric fields per update in the flat batch buffer. */
export const FIELDS_PER_UPDATE = 7;

/** Field offsets within one update of the flat batch buffer. */
export const BatchField = {
  Instrument: 0,
  Price: 1,
  TradeQty: 2,
  Bid: 3,
  Ask: 4,
  BidQty: 5,
  AskQty: 6,
} as const;

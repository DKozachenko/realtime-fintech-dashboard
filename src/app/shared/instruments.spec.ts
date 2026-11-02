import { emptyRows, INSTRUMENT_SYMBOLS, instrumentSymbol } from './instruments';

describe('instruments', () => {
  it('has 50 unique symbols of at most 5 chars', () => {
    expect(INSTRUMENT_SYMBOLS.length).toBe(50);
    expect(new Set(INSTRUMENT_SYMBOLS).size).toBe(50);
    expect(INSTRUMENT_SYMBOLS.every((s) => s.length <= 5)).toBeTrue();
    expect(INSTRUMENT_SYMBOLS[0]).toBe('ALFA');
    expect(INSTRUMENT_SYMBOLS[1]).toBe('BETA');
    expect(INSTRUMENT_SYMBOLS[49]).toBe('ZINN');
  });

  it('looks up a symbol by index', () => {
    expect(instrumentSymbol(0)).toBe('ALFA');
    expect(instrumentSymbol(2)).toBe('GAMA');
  });

  it('builds empty rows', () => {
    const empty = { lastPriceCents: null, spreadCents: null, volume: 0, vwapCents: null, imbalance: null };
    expect(emptyRows(3)).toEqual([empty, empty, empty]);
    const rows = emptyRows(2);
    expect(rows[0]).not.toBe(rows[1]);
  });
});

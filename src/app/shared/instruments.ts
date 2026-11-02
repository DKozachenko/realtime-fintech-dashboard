import { InstrumentMetrics } from './messages';

export const INSTRUMENT_SYMBOLS: readonly string[] = (
  'ALFA BETA GAMA DLTA EPSI ZETA ETA THTA IOTA KAPA LMBD MU NU XI OMCR PI RHO SGMA TAU UPSL PHI CHI PSI OMGA ' +
  'ACRN BRCH CEDR DUNE ELMW FERN GROV HAZL IVYS JUNP KELP LARC MAPL NETL OAKS PINE QUIL REED SAGE TEAK UMBR ' +
  'VINE WILW XYLM YEWS ZINN'
).split(' ');

export function instrumentSymbol(index: number): string {
  return INSTRUMENT_SYMBOLS[index];
}

export function emptyRows(count: number): InstrumentMetrics[] {
  return Array.from({ length: count }, () => ({
    lastPriceCents: null,
    spreadCents: null,
    volume: 0,
    vwapCents: null,
    imbalance: null,
  }));
}

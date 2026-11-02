import { ProducerSettings } from './settings';

export interface InstrumentMetrics {
  lastPriceCents: number | null;
  spreadCents: number | null;
  volume: number;
  vwapCents: number | null;
  imbalance: number | null;
}

export type WorkerCommand =
  | { type: 'start'; runId: number; settings: ProducerSettings }
  | { type: 'pause'; runId: number }
  | { type: 'resume'; runId: number }
  | { type: 'dispose' };

export type WorkerEvent =
  | { type: 'ready' }
  | { type: 'snapshot'; runId: number; rows: InstrumentMetrics[]; tradesCounted: number }
  | { type: 'error'; runId: number | null; source: 'wasm' | 'worker'; message: string };

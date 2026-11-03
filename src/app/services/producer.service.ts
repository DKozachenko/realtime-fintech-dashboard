import { computed, inject, Injectable, InjectionToken, OnDestroy, signal } from '@angular/core';

import { emptyRows } from '../shared/instruments';
import { InstrumentMetrics, WorkerCommand, WorkerEvent } from '../shared/messages';
import { DEFAULT_SETTINGS, ProducerSettings } from '../shared/settings';
import { LoggerService } from './logger.service';

export interface WorkerLike {
  postMessage(command: WorkerCommand): void;
  terminate(): void;
  onmessage: ((e: MessageEvent<WorkerEvent>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export const PRODUCER_WORKER_FACTORY = new InjectionToken<() => WorkerLike>('PRODUCER_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => () => new Worker(new URL('../worker/producer.worker', import.meta.url), { type: 'module' }),
});

export type ProducerStatus = 'initializing' | 'running' | 'paused' | 'error';

interface RunState {
  readonly activeSettings: ProducerSettings;
  readonly runId: number;
  readonly status: ProducerStatus;
  readonly rows: InstrumentMetrics[];
  readonly tradesCounted: number;
  readonly errorMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProducerService implements OnDestroy {
  private readonly createWorker = inject(PRODUCER_WORKER_FACTORY);
  private readonly logger = inject(LoggerService);

  /** The only writable state; everything public below is a read-only view of it. */
  private readonly state = signal<RunState>({
    activeSettings: DEFAULT_SETTINGS,
    runId: 0,
    status: 'initializing',
    rows: [],
    tradesCounted: 0,
    errorMessage: null,
  });

  readonly activeSettings = computed(() => this.state().activeSettings);
  readonly runId = computed(() => this.state().runId);
  readonly status = computed(() => this.state().status);
  readonly rows = computed(() => this.state().rows);
  readonly tradesCounted = computed(() => this.state().tradesCounted);
  readonly errorMessage = computed(() => this.state().errorMessage);

  private worker!: WorkerLike;
  private ready = false;

  constructor() {
    this.spawnWorker();
    this.beginRun(DEFAULT_SETTINGS);
  }

  ngOnDestroy(): void {
    this.worker.postMessage({ type: 'dispose' });
    this.worker.terminate();
  }

  apply(settings: ProducerSettings): void {
    if (this.status() === 'error') {
      this.replaceWorker(settings);
      return;
    }
    this.beginRun(settings);
  }

  pause(): void {
    if (this.status() !== 'running') {
      return;
    }
    this.worker.postMessage({ type: 'pause', runId: this.runId() });
    this.patch({ status: 'paused' });
  }

  resume(): void {
    if (this.status() !== 'paused') {
      return;
    }
    this.worker.postMessage({ type: 'resume', runId: this.runId() });
    this.patch({ status: 'running' });
  }

  retry(): void {
    this.replaceWorker(this.activeSettings());
  }

  private patch(changes: Partial<RunState>): void {
    this.state.update((state) => ({ ...state, ...changes }));
  }

  private replaceWorker(settings: ProducerSettings): void {
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.spawnWorker();
    this.beginRun(settings);
  }

  private spawnWorker(): void {
    const worker = this.createWorker();
    this.worker = worker;
    this.ready = false;
    worker.onmessage = (e) => {
      if (worker === this.worker) {
        this.handleEvent(e.data);
      }
    };
    worker.onerror = (e) => {
      if (worker === this.worker) {
        this.fail('worker', e.message || 'The producer worker failed to start.');
      }
    };
  }

  /** Starts a new run: bumps runId, shows an empty table at once, tells the worker. */
  private beginRun(settings: ProducerSettings): void {
    const runId = this.runId() + 1;
    this.state.set({
      activeSettings: settings,
      runId,
      // A ready worker starts generating right away, even from pause.
      status: this.ready ? 'running' : 'initializing',
      rows: emptyRows(settings.instrumentCount),
      tradesCounted: 0,
      errorMessage: null,
    });
    this.worker.postMessage({ type: 'start', runId, settings });
  }

  private handleEvent(event: WorkerEvent): void {
    switch (event.type) {
      case 'ready':
        this.ready = true;
        if (this.status() === 'initializing') {
          this.patch({ status: 'running' });
        }
        break;
      case 'snapshot':
        if (event.runId === this.runId()) {
          this.patch({ rows: event.rows, tradesCounted: event.tradesCounted });
        }
        break;
      case 'error':
        if (event.runId === null || event.runId === this.runId()) {
          this.fail(event.source, event.message);
        } else {
          this.logger.warn('worker', 'Dropped error from a previous run', {
            runId: event.runId,
            message: event.message,
          });
        }
        break;
    }
  }

  private fail(source: 'wasm' | 'worker', message: string): void {
    this.patch({ status: 'error', errorMessage: message });
    this.logger.error(source, message, { runId: this.runId() });
  }
}

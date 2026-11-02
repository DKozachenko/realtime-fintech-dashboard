import { WorkerCommand, WorkerEvent } from '../shared/messages';
import { ProducerSettings } from '../shared/settings';
import { MetricsAggregator } from './metrics-aggregator';
import { snapshotEvery } from './snapshot-throttle';

export interface BatchSource {
  nextBatch(size: number): Uint32Array;
  free(): void;
}

export interface Scheduler {
  setInterval(callback: () => void, ms: number): number;
  clearInterval(handle: number): void;
}

export interface EngineDeps {
  createSource(instrumentCount: number, seed: number): BatchSource;
  nextSeed(): number;
  scheduler: Scheduler;
  post(event: WorkerEvent): void;
}

interface Run {
  runId: number;
  settings: ProducerSettings;
  source: BatchSource;
  aggregator: MetricsAggregator;
  every: number;
  batches: number;
  timer: number | null;
}

/** Testable core of the worker: owns the batch timer, aggregation and snapshot cadence. */
export class ProducerEngine {
  private run: Run | null = null;
  private disposed = false;

  constructor(private readonly deps: EngineDeps) {}

  handle(command: WorkerCommand): void {
    if (this.disposed) {
      return;
    }
    switch (command.type) {
      case 'start':
        return this.start(command.runId, command.settings);
      case 'pause':
        return this.pause(command.runId);
      case 'resume':
        return this.resume(command.runId);
      case 'dispose':
        this.disposed = true;
        this.teardown();
        return;
    }
  }

  private start(runId: number, settings: ProducerSettings): void {
    this.teardown();
    try {
      const aggregator = new MetricsAggregator(settings.instrumentCount);
      const every = snapshotEvery(settings.batchIntervalMs);
      const source = this.deps.createSource(settings.instrumentCount, this.deps.nextSeed());
      this.run = { runId, settings, source, aggregator, every, batches: 0, timer: null };
      this.schedule(this.run);
    } catch (e) {
      this.teardown();
      this.fail(runId, e);
    }
  }

  private pause(runId: number): void {
    const run = this.run;
    if (!run || run.runId !== runId || run.timer === null) {
      return;
    }
    this.stopTimer(run);
    this.publish(run);
  }

  private resume(runId: number): void {
    const run = this.run;
    if (!run || run.runId !== runId || run.timer !== null) {
      return;
    }
    this.schedule(run);
  }

  private schedule(run: Run): void {
    run.timer = this.deps.scheduler.setInterval(() => this.tick(run), run.settings.batchIntervalMs);
  }

  private tick(run: Run): void {
    if (this.run !== run) {
      return;
    }
    try {
      run.aggregator.apply(run.source.nextBatch(run.settings.updatesPerBatch));
    } catch (e) {
      this.teardown();
      this.fail(run.runId, e);
      return;
    }
    run.batches++;
    if (run.batches % run.every === 0) {
      this.publish(run);
    }
  }

  private publish(run: Run): void {
    const { rows, tradesCounted } = run.aggregator.snapshot();
    this.deps.post({ type: 'snapshot', runId: run.runId, rows, tradesCounted });
  }

  private stopTimer(run: Run): void {
    if (run.timer !== null) {
      this.deps.scheduler.clearInterval(run.timer);
    }
    run.timer = null;
  }

  private teardown(): void {
    const run = this.run;
    this.run = null;
    if (!run) {
      return;
    }
    this.stopTimer(run);
    try {
      run.source.free();
    } catch {
      // Freeing a broken generator must not escape the engine.
    }
  }

  private fail(runId: number, e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    this.deps.post({ type: 'error', runId, source: 'wasm', message: `Generator stopped: ${message}` });
  }
}

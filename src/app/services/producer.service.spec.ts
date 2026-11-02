import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { emptyRows } from '../shared/instruments';
import { InstrumentMetrics } from '../shared/messages';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { LoggerService } from './logger.service';
import { PRODUCER_WORKER_FACTORY, ProducerService } from './producer.service';
import { FakeWorker } from './testing/fake-worker';

describe('ProducerService', () => {
  let workers: FakeWorker[];
  let logger: jasmine.SpyObj<LoggerService>;

  const newSettings = { instrumentCount: 12, updatesPerBatch: 200, batchIntervalMs: 250 };
  const filledRows = (count: number): InstrumentMetrics[] =>
    emptyRows(count).map((row) => ({ ...row, lastPriceCents: 10000, volume: 5 }));

  function create(): ProducerService {
    workers = [];
    logger = jasmine.createSpyObj<LoggerService>('LoggerService', ['info', 'warn', 'error']);
    TestBed.configureTestingModule({
      providers: [
        provideExperimentalZonelessChangeDetection(),
        { provide: LoggerService, useValue: logger },
        {
          provide: PRODUCER_WORKER_FACTORY,
          useValue: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
          },
        },
      ],
    });
    return TestBed.inject(ProducerService);
  }

  it('starts run 1 with defaults', () => {
    const service = create();
    expect(workers.length).toBe(1);
    expect(workers[0].sent).toEqual([{ type: 'start', runId: 1, settings: DEFAULT_SETTINGS }]);
    expect(service.runId()).toBe(1);
    expect(service.status()).toBe('initializing');
    expect(service.rows()).toEqual(emptyRows(5));
    expect(service.tradesCounted()).toBe(0);
    expect(service.activeSettings()).toEqual(DEFAULT_SETTINGS);
    expect(service.errorMessage()).toBeNull();
  });

  it('becomes running on ready', () => {
    const service = create();
    workers[0].emit({ type: 'ready' });
    expect(service.status()).toBe('running');
  });

  it('applies snapshots of the current run', () => {
    const service = create();
    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'snapshot', runId: 1, rows: filledRows(5), tradesCounted: 42 });
    expect(service.rows()).toEqual(filledRows(5));
    expect(service.tradesCounted()).toBe(42);
  });

  it('apply resets and drops results from the previous run', () => {
    const service = create();
    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'snapshot', runId: 1, rows: filledRows(5), tradesCounted: 42 });

    service.apply(newSettings);

    expect(service.runId()).toBe(2);
    expect(service.rows()).toEqual(emptyRows(12));
    expect(service.tradesCounted()).toBe(0);
    expect(service.activeSettings()).toEqual(newSettings);
    expect(workers[0].sent.at(-1)).toEqual({ type: 'start', runId: 2, settings: newSettings });

    workers[0].emit({ type: 'snapshot', runId: 1, rows: filledRows(5), tradesCounted: 99 });
    expect(service.rows()).toEqual(emptyRows(12));
    expect(service.tradesCounted()).toBe(0);
  });

  it('apply before ready keeps initializing', () => {
    const service = create();
    service.apply(newSettings);
    expect(service.status()).toBe('initializing');
    workers[0].emit({ type: 'ready' });
    expect(service.status()).toBe('running');
  });

  it('apply while paused resumes generation', () => {
    const service = create();
    workers[0].emit({ type: 'ready' });
    service.pause();
    service.apply(newSettings);
    expect(service.status()).toBe('running');
    expect(workers[0].sent.slice(-2)).toEqual([
      { type: 'pause', runId: 1 },
      { type: 'start', runId: 2, settings: newSettings },
    ]);
  });

  it('pause and resume send commands and update status', () => {
    const service = create();
    workers[0].emit({ type: 'ready' });

    service.pause();
    expect(service.status()).toBe('paused');
    expect(workers[0].sent.at(-1)).toEqual({ type: 'pause', runId: 1 });

    service.resume();
    expect(service.status()).toBe('running');
    expect(workers[0].sent.at(-1)).toEqual({ type: 'resume', runId: 1 });
  });

  it('error event switches to error and logs', () => {
    const service = create();
    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'error', runId: 1, source: 'wasm', message: 'boom' });
    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toBe('boom');
    expect(logger.error).toHaveBeenCalledWith('wasm', 'boom', { runId: 1 });
  });

  it('worker onerror does the same', () => {
    const service = create();
    workers[0].fail('script failed');
    expect(service.status()).toBe('error');
    expect(service.errorMessage()).toBe('script failed');
    expect(logger.error).toHaveBeenCalledWith('worker', 'script failed', { runId: 1 });
  });

  it('retry replaces the worker', () => {
    const service = create();
    service.apply(newSettings);
    workers[0].emit({ type: 'error', runId: 2, source: 'worker', message: 'boom' });

    service.retry();

    expect(workers[0].terminated).toBeTrue();
    expect(workers.length).toBe(2);
    expect(workers[1].sent).toEqual([{ type: 'start', runId: 3, settings: newSettings }]);
    expect(service.runId()).toBe(3);
    expect(service.activeSettings()).toEqual(newSettings);
    expect(service.rows()).toEqual(emptyRows(12));
    expect(service.status()).toBe('initializing');
    expect(service.errorMessage()).toBeNull();
  });

  it('apply in error state replaces the worker with new settings', () => {
    const service = create();
    workers[0].fail('boom');

    service.apply(newSettings);

    expect(workers[0].terminated).toBeTrue();
    expect(workers.length).toBe(2);
    expect(workers[1].sent).toEqual([{ type: 'start', runId: 2, settings: newSettings }]);
    expect(service.status()).toBe('initializing');
    expect(service.activeSettings()).toEqual(newSettings);
  });

  it('ignores events from a replaced worker', () => {
    const service = create();
    workers[0].fail('boom');
    const oldOnMessage = workers[0].onmessage;
    const oldOnError = workers[0].onerror;
    service.retry();
    // retry() clears handlers on the old worker; reattach them to exercise the guard
    workers[0].onmessage = oldOnMessage;
    workers[0].onerror = oldOnError;

    workers[0].emit({ type: 'ready' });
    workers[0].emit({ type: 'snapshot', runId: 2, rows: filledRows(5), tradesCounted: 9 });
    workers[0].emit({ type: 'error', runId: 2, source: 'wasm', message: 'late' });
    workers[0].fail('late');

    expect(service.status()).toBe('initializing');
    expect(service.errorMessage()).toBeNull();
    expect(service.tradesCounted()).toBe(0);
  });

  it('ignores pause in error and keeps the error', () => {
    const service = create();
    workers[0].fail('boom');
    service.pause();
    expect(service.status()).toBe('error');
    expect(workers[0].sent.length).toBe(1);
  });

  it('ignores pause and resume while initializing', () => {
    const service = create();
    service.pause();
    service.resume();
    expect(service.status()).toBe('initializing');
    expect(workers[0].sent.length).toBe(1);
  });

  it('destroy disposes and terminates the worker', () => {
    create();
    TestBed.resetTestingModule();
    expect(workers[0].sent.at(-1)).toEqual({ type: 'dispose' });
    expect(workers[0].terminated).toBeTrue();
  });
});

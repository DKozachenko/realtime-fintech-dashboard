import { WorkerEvent } from '../shared/messages';
import { ProducerSettings } from '../shared/settings';
import { BatchSource, ProducerEngine } from './producer-engine';
import { encodeUpdates } from './testing/encode-updates';
import { FakeScheduler } from './testing/fake-scheduler';

class FakeSource implements BatchSource {
  sizes: number[] = [];
  freed = false;
  failWith: Error | null = null;
  nextBatch(size: number): Uint32Array {
    if (this.failWith) throw this.failWith;
    this.sizes.push(size);
    return encodeUpdates(
      Array.from({ length: size }, () => ({
        instrument: 0,
        priceCents: 10000,
        tradeQuantity: 10,
        bidCents: 9996,
        askCents: 10000,
        bidQuantity: 600,
        askQuantity: 400,
      })),
    );
  }
  free(): void {
    this.freed = true;
  }
}

const settings = (over: Partial<ProducerSettings> = {}): ProducerSettings => ({
  instrumentCount: 3,
  updatesPerBatch: 4,
  batchIntervalMs: 50,
  ...over,
});

function setup() {
  const scheduler = new FakeScheduler();
  const events: WorkerEvent[] = [];
  const sources: FakeSource[] = [];
  const created: { instrumentCount: number; seed: number }[] = [];
  const engine = new ProducerEngine({
    createSource: (instrumentCount, seed) => {
      created.push({ instrumentCount, seed });
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    nextSeed: () => 42,
    scheduler,
    post: (e) => events.push(e),
  });
  const snapshots = () => events.filter((e) => e.type === 'snapshot');
  return { engine, scheduler, events, sources, created, snapshots };
}

describe('ProducerEngine', () => {
  it('start creates a source with instrumentCount and seed and schedules batchIntervalMs', () => {
    const { engine, scheduler, created, events } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings({ batchIntervalMs: 80 }) });
    expect(created).toEqual([{ instrumentCount: 3, seed: 42 }]);
    expect(scheduler.activeCount).toBe(1);
    expect(scheduler.lastIntervalMs).toBe(80);
    expect(events).toEqual([]);
  });

  it('each tick pulls updatesPerBatch updates', () => {
    const { engine, scheduler, sources } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings({ updatesPerBatch: 7 }) });
    scheduler.tick(3);
    expect(sources[0].sizes).toEqual([7, 7, 7]);
  });

  it('publishes on every 5th batch at 50 ms', () => {
    const { engine, scheduler, snapshots } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    scheduler.tick(4);
    expect(snapshots().length).toBe(0);
    scheduler.tick(1);
    expect(snapshots().length).toBe(1);
    scheduler.tick(5);
    expect(snapshots().length).toBe(2);
  });

  it('publishes on every batch at 500 ms', () => {
    const { engine, scheduler, snapshots } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings({ batchIntervalMs: 500 }) });
    scheduler.tick(3);
    expect(snapshots().length).toBe(3);
  });

  it('pause stops batches and publishes immediately', () => {
    const { engine, scheduler, sources, snapshots } = setup();
    engine.handle({ type: 'start', runId: 7, settings: settings() });
    scheduler.tick(2);
    engine.handle({ type: 'pause', runId: 7 });
    const snaps = snapshots();
    expect(snaps.length).toBe(1);
    expect(snaps[0]).toEqual(jasmine.objectContaining({ runId: 7, tradesCounted: 8 }));
    expect(scheduler.activeCount).toBe(0);
    scheduler.tick(3);
    expect(sources[0].sizes.length).toBe(2);
  });

  it('resume schedules a new interval, publishes nothing, keeps totals', () => {
    const { engine, scheduler, snapshots } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    scheduler.tick(2);
    engine.handle({ type: 'pause', runId: 1 });
    engine.handle({ type: 'resume', runId: 1 });
    expect(scheduler.activeCount).toBe(1);
    expect(snapshots().length).toBe(1);
    scheduler.tick(1);
    engine.handle({ type: 'pause', runId: 1 });
    const last = snapshots()[1] as Extract<WorkerEvent, { type: 'snapshot' }>;
    expect(last.tradesCounted).toBe(12);
  });

  it('keeps the batch counter across resume', () => {
    const { engine, scheduler, snapshots } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    scheduler.tick(3);
    engine.handle({ type: 'pause', runId: 1 });
    engine.handle({ type: 'resume', runId: 1 });
    scheduler.tick(1);
    expect(snapshots().length).toBe(1); // only the pause snapshot
    scheduler.tick(1); // 5th batch overall
    expect(snapshots().length).toBe(2);
  });

  it('start while paused runs a fresh run', () => {
    const { engine, scheduler, sources, created } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    scheduler.tick(2);
    engine.handle({ type: 'pause', runId: 1 });
    engine.handle({ type: 'start', runId: 2, settings: settings() });
    expect(sources[0].freed).toBeTrue();
    expect(created.length).toBe(2);
    expect(scheduler.activeCount).toBe(1);
    scheduler.tick(1);
  });

  it('restarts counting totals from zero on start', () => {
    const { engine, scheduler, snapshots, sources } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    scheduler.tick(3);
    engine.handle({ type: 'start', runId: 2, settings: settings() });
    scheduler.tick(1);
    expect(sources[0].sizes.length).toBe(3);
    expect(sources[1].sizes).toEqual([4]);
    engine.handle({ type: 'pause', runId: 2 });
    const last = snapshots().pop() as Extract<WorkerEvent, { type: 'snapshot' }>;
    expect(last).toEqual(jasmine.objectContaining({ runId: 2, tradesCounted: 4 }));
  });

  it('ignores pause/resume for another runId', () => {
    const { engine, scheduler, events } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    engine.handle({ type: 'pause', runId: 2 });
    expect(scheduler.activeCount).toBe(1);
    expect(events).toEqual([]);
    engine.handle({ type: 'pause', runId: 1 });
    engine.handle({ type: 'resume', runId: 2 });
    expect(scheduler.activeCount).toBe(0);
  });

  it('ignores pause when not running and resume when running', () => {
    const { engine, scheduler, events } = setup();
    engine.handle({ type: 'pause', runId: 1 });
    engine.handle({ type: 'resume', runId: 1 });
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    engine.handle({ type: 'resume', runId: 1 });
    expect(scheduler.activeCount).toBe(1);
    expect(events).toEqual([]);
  });

  it('reports generator failures', () => {
    const { engine, scheduler, sources, events } = setup();
    engine.handle({ type: 'start', runId: 3, settings: settings() });
    sources[0].failWith = new Error('boom');
    scheduler.tick(1);
    expect(events).toEqual([
      { type: 'error', runId: 3, source: 'wasm', message: 'Generator stopped: boom' },
    ]);
    expect(scheduler.activeCount).toBe(0);
  });

  it('drops the run after a failure so resume does nothing', () => {
    const { engine, scheduler, sources, events } = setup();
    engine.handle({ type: 'start', runId: 3, settings: settings() });
    sources[0].failWith = new Error('boom');
    scheduler.tick(1);
    expect(sources[0].freed).toBeTrue();
    const eventCount = events.length;
    sources[0].failWith = null;
    engine.handle({ type: 'resume', runId: 3 });
    engine.handle({ type: 'pause', runId: 3 });
    scheduler.tick(2);
    expect(sources[0].sizes.length).toBe(0);
    expect(events.length).toBe(eventCount);
    expect(scheduler.activeCount).toBe(0);
  });

  it('reports source creation failures', () => {
    const scheduler = new FakeScheduler();
    const events: WorkerEvent[] = [];
    const engine = new ProducerEngine({
      createSource: () => {
        throw new Error('no wasm');
      },
      nextSeed: () => 1,
      scheduler,
      post: (e) => events.push(e),
    });
    engine.handle({ type: 'start', runId: 4, settings: settings() });
    expect(events).toEqual([
      { type: 'error', runId: 4, source: 'wasm', message: 'Generator stopped: no wasm' },
    ]);
    expect(scheduler.activeCount).toBe(0);
  });

  it('dispose clears the timer and frees the source; later commands are ignored', () => {
    const { engine, scheduler, sources, created } = setup();
    engine.handle({ type: 'start', runId: 1, settings: settings() });
    engine.handle({ type: 'dispose' });
    expect(scheduler.activeCount).toBe(0);
    expect(sources[0].freed).toBeTrue();
    engine.handle({ type: 'start', runId: 2, settings: settings() });
    expect(created.length).toBe(1);
    expect(scheduler.activeCount).toBe(0);
  });
});

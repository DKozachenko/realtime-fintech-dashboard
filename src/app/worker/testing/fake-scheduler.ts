import { Scheduler } from '../producer-engine';

/** Manual scheduler for tests: intervals fire only when tick() is called. */
export class FakeScheduler implements Scheduler {
  private nextHandle = 1;
  private readonly timers = new Map<number, { callback: () => void; ms: number }>();
  private lastMs: number | null = null;

  setInterval(callback: () => void, ms: number): number {
    const handle = this.nextHandle++;
    this.timers.set(handle, { callback, ms });
    this.lastMs = ms;
    return handle;
  }

  clearInterval(handle: number): void {
    this.timers.delete(handle);
  }

  /** Fires every active interval callback once per tick. */
  tick(times = 1): void {
    for (let i = 0; i < times; i++) {
      for (const [handle, timer] of [...this.timers]) {
        if (this.timers.get(handle) === timer) timer.callback();
      }
    }
  }

  get activeCount(): number {
    return this.timers.size;
  }

  get lastIntervalMs(): number | null {
    return this.lastMs;
  }
}

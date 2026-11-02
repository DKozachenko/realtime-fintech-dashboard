/// <reference lib="webworker" />

import init, { Generator } from '../../wasm/generator/generator.js';
import { WorkerCommand, WorkerEvent } from '../shared/messages';
import { ProducerEngine } from './producer-engine';
import { WasmBatchSource } from './wasm-batch-source';

const post = (event: WorkerEvent): void => postMessage(event);

let engine: ProducerEngine | null = null;
const pending: WorkerCommand[] = [];

addEventListener('message', ({ data }: MessageEvent<WorkerCommand>) => {
  if (engine) {
    engine.handle(data);
  } else {
    pending.push(data);
  }
});

const wasmUrl = new URL('wasm/generator_bg.wasm', new URL('.', self.location.href));

init({ module_or_path: wasmUrl }).then(
  (wasm) => {
    engine = new ProducerEngine({
      createSource: (instrumentCount, seed) =>
        new WasmBatchSource(new Generator(instrumentCount, seed), wasm.memory),
      nextSeed: () => crypto.getRandomValues(new Uint32Array(1))[0],
      scheduler: {
        setInterval: (callback, ms) => self.setInterval(callback, ms),
        clearInterval: (handle) => self.clearInterval(handle),
      },
      post,
    });
    post({ type: 'ready' });
    for (const command of pending.splice(0)) {
      engine.handle(command);
    }
  },
  (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    post({ type: 'error', runId: null, source: 'wasm', message: `Generator failed to load: ${message}` });
  },
);

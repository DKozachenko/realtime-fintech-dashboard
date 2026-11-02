import { BatchSource } from './producer-engine';

export interface GeneratorHandle {
  next_batch(size: number): number;
  batch_ptr(): number;
  free(): void;
}

/** Reads generated batches straight out of Wasm linear memory. */
export class WasmBatchSource implements BatchSource {
  constructor(
    private readonly generator: GeneratorHandle,
    private readonly memory: { readonly buffer: ArrayBufferLike },
  ) {}

  nextBatch(size: number): Uint32Array {
    const length = this.generator.next_batch(size);
    // The view is recreated every time: memory growth detaches the previous buffer.
    return new Uint32Array(this.memory.buffer, this.generator.batch_ptr(), length);
  }

  free(): void {
    this.generator.free();
  }
}

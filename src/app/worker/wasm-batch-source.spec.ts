import { WasmBatchSource } from './wasm-batch-source';

function bufferOf(values: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 4);
  new Uint32Array(buffer).set(values);
  return buffer;
}

describe('WasmBatchSource', () => {
  it('reads from the current memory buffer on every batch', () => {
    const memory = { buffer: bufferOf([1, 2, 3]) as ArrayBufferLike };
    const lengths = [3, 2];
    const generator = {
      next_batch: jasmine.createSpy('next_batch').and.callFake(() => lengths.shift()!),
      batch_ptr: () => 0,
      free: jasmine.createSpy('free'),
    };
    const source = new WasmBatchSource(generator, memory);

    expect(Array.from(source.nextBatch(3))).toEqual([1, 2, 3]);

    // Simulates memory growth: the old buffer is replaced by a new one.
    memory.buffer = bufferOf([7, 8, 9, 10]);
    expect(Array.from(source.nextBatch(2))).toEqual([7, 8]);
    expect(generator.next_batch).toHaveBeenCalledWith(2);
  });

  it('proxies free to the generator', () => {
    const generator = { next_batch: () => 0, batch_ptr: () => 0, free: jasmine.createSpy('free') };
    new WasmBatchSource(generator, { buffer: new ArrayBuffer(0) }).free();
    expect(generator.free).toHaveBeenCalledTimes(1);
  });
});

import { InstrumentPipe } from './instrument.pipe';

describe('InstrumentPipe', () => {
  const pipe = new InstrumentPipe();

  it('maps an instrument index to its symbol', () => {
    expect(pipe.transform(0)).toBe('ALFA');
    expect(pipe.transform(4)).toBe('EPSI');
  });
});

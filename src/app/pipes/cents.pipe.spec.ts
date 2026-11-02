import { CentsPipe } from './cents.pipe';

describe('CentsPipe', () => {
  const pipe = new CentsPipe();

  it('formats whole dollars', () => {
    expect(pipe.transform(10200)).toBe('$102.00');
  });

  it('formats cents', () => {
    expect(pipe.transform(10150)).toBe('$101.50');
    expect(pipe.transform(4)).toBe('$0.04');
  });

  it('rounds unrounded cents only at display time', () => {
    expect(pipe.transform(10150.4)).toBe('$101.50');
  });

  it('uses thousands separators', () => {
    expect(pipe.transform(123456789)).toBe('$1,234,567.89');
  });

  it('renders null as an em dash', () => {
    expect(pipe.transform(null)).toBe('—');
  });
});

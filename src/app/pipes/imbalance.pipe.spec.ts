import { ImbalancePipe } from './imbalance.pipe';

describe('ImbalancePipe', () => {
  const pipe = new ImbalancePipe();

  it('prefixes positive values with a plus', () => {
    expect(pipe.transform(0.2)).toBe('+0.20');
    expect(pipe.transform(1)).toBe('+1.00');
  });

  it('prefixes negative values with U+2212', () => {
    expect(pipe.transform(-0.35)).toBe('−0.35');
    expect(pipe.transform(-1)).toBe('−1.00');
  });

  it('shows zero without a sign', () => {
    expect(pipe.transform(0)).toBe('0.00');
  });

  it('shows values rounding to zero without a sign', () => {
    expect(pipe.transform(-0.001)).toBe('0.00');
    expect(pipe.transform(0.004)).toBe('0.00');
  });

  it('renders null as an em dash', () => {
    expect(pipe.transform(null)).toBe('—');
  });
});

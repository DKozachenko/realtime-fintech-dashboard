import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

const MINUS = '−';

@Pipe({ name: 'imbalance' })
export class ImbalancePipe implements PipeTransform {
  transform(value: number | null): string {
    if (value === null) {
      return '—';
    }
    const text = formatter.format(Math.abs(value));
    if (text === '0.00') {
      return text;
    }
    return (value > 0 ? '+' : MINUS) + text;
  }
}

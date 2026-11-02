import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

@Pipe({ name: 'cents' })
export class CentsPipe implements PipeTransform {
  transform(value: number | null): string {
    if (value === null) {
      return '—';
    }
    return formatter.format(value / 100);
  }
}

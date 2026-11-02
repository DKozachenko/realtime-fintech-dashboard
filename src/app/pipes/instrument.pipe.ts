import { Pipe, PipeTransform } from '@angular/core';

import { instrumentSymbol } from '../shared/instruments';

/** Instrument index → ticker symbol. */
@Pipe({ name: 'instrument' })
export class InstrumentPipe implements PipeTransform {
  transform(index: number): string {
    return instrumentSymbol(index);
  }
}

import { Directive, effect, ElementRef, inject, input } from '@angular/core';

/**
 * Colours the host by the direction of the last price move: `up` (green) or `down` (red).
 * An unchanged price keeps the previous colour; "no data" clears it.
 */
@Directive({ selector: '[appPriceTrend]' })
export class PriceTrendDirective {
  readonly price = input.required<number | null>({ alias: 'appPriceTrend' });

  private readonly classes: DOMTokenList = inject(ElementRef).nativeElement.classList;
  private previous: number | null = null;

  constructor() {
    effect(() => {
      const next = this.price();
      if (next === null) {
        this.classes.remove('up', 'down');
      } else if (this.previous !== null && next !== this.previous) {
        const up = next > this.previous;
        this.classes.toggle('up', up);
        this.classes.toggle('down', !up);
      }
      this.previous = next;
    });
  }
}

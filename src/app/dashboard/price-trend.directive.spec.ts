import { ChangeDetectionStrategy, Component, provideExperimentalZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PriceTrendDirective } from './price-trend.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PriceTrendDirective],
  template: `<span [appPriceTrend]="price()"></span>`,
})
class HostComponent {
  readonly price = signal<number | null>(null);
}

describe('PriceTrendDirective', () => {
  async function setup() {
    TestBed.configureTestingModule({ providers: [provideExperimentalZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(HostComponent);
    const span: HTMLElement = fixture.nativeElement.querySelector('span');
    const set = async (price: number | null) => {
      fixture.componentInstance.price.set(price);
      await fixture.whenStable();
    };
    await fixture.whenStable();
    return { span, set };
  }

  it('has no colour for the first price', async () => {
    const { span, set } = await setup();
    await set(100);
    expect(span.className).toBe('');
  });

  it('follows the direction of the last move', async () => {
    const { span, set } = await setup();
    await set(100);
    await set(101);
    expect(span.className).toBe('up');
    await set(99);
    expect(span.className).toBe('down');
  });

  it('keeps the colour while the price is unchanged', async () => {
    const { span, set } = await setup();
    await set(100);
    await set(101);
    await set(101);
    expect(span.className).toBe('up');
  });

  it('clears the colour when a new run resets the price', async () => {
    const { span, set } = await setup();
    await set(100);
    await set(101);
    await set(null);
    expect(span.className).toBe('');
    await set(100);
    expect(span.className).toBe('');
  });
});

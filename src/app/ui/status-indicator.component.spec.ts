import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ProducerStatus } from '../services/producer.service';
import { StatusIndicatorComponent } from './status-indicator.component';

describe('StatusIndicatorComponent', () => {
  async function render(status: ProducerStatus): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [StatusIndicatorComponent],
      providers: [provideExperimentalZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StatusIndicatorComponent);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    return <HTMLElement>fixture.nativeElement;
  }

  const labels: [ProducerStatus, string][] = [
    ['initializing', 'Initializing'],
    ['running', 'Running'],
    ['paused', 'Paused'],
    ['error', 'Error'],
  ];

  for (const [status, label] of labels) {
    it(`renders "${label}" with a ${status} dot`, async () => {
      const el = await render(status);
      expect(el.textContent?.trim()).toBe(label);
      expect(el.querySelector('.dot')?.classList.contains(status)).toBeTrue();
    });
  }
});

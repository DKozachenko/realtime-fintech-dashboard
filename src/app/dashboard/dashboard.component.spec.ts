import { provideExperimentalZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProducerService, ProducerStatus } from '../services/producer.service';
import { emptyRows } from '../shared/instruments';
import { InstrumentMetrics } from '../shared/messages';
import { DEFAULT_SETTINGS, ProducerSettings } from '../shared/settings';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  function createFake() {
    return {
      activeSettings: signal<ProducerSettings>(DEFAULT_SETTINGS),
      runId: signal(1),
      status: signal<ProducerStatus>('running'),
      rows: signal<InstrumentMetrics[]>(emptyRows(5)),
      tradesCounted: signal(0),
      errorMessage: signal<string | null>(null),
      pause: jasmine.createSpy('pause'),
      resume: jasmine.createSpy('resume'),
      retry: jasmine.createSpy('retry'),
    };
  }

  let fake: ReturnType<typeof createFake>;
  let fixture: ComponentFixture<DashboardComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    fake = createFake();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideExperimentalZonelessChangeDetection(), { provide: ProducerService, useValue: fake }],
    }).compileComponents();
    fixture = TestBed.createComponent(DashboardComponent);
    el = <HTMLElement>fixture.nativeElement;
    await fixture.whenStable();
  });

  function cells(row: number): string[] {
    const tr = el.querySelectorAll('tbody tr')[row];
    return Array.from(tr.querySelectorAll('td')).map((td) => td.textContent!.trim());
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label);
    return <HTMLButtonElement>found;
  }

  it('renders one row per instrument with placeholders', () => {
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);
    const symbols = Array.from(rows).map((r) => r.querySelector('td')!.textContent!.trim());
    expect(symbols).toEqual(['ALFA', 'BETA', 'GAMA', 'DLTA', 'EPSI']);
    expect(cells(0)).toEqual(['ALFA', '—', '—', '0', '—', '—']);
  });

  it('renders formatted metrics', async () => {
    fake.rows.set([
      { lastPriceCents: 10200, spreadCents: 4, volume: 40, vwapCents: 10150, imbalance: 0.2 },
      ...emptyRows(4),
    ]);
    await fixture.whenStable();
    expect(cells(0)).toEqual(['ALFA', '$102.00', '$0.04', '40', '$101.50', '+0.20']);
  });

  it('scales the imbalance bar by the signed value and hides it without data', async () => {
    const row = (imbalance: number | null): InstrumentMetrics => ({
      lastPriceCents: 100,
      spreadCents: 1,
      volume: 1,
      vwapCents: 100,
      imbalance,
    });
    fake.rows.set([row(0.4), row(-0.25), row(null), ...emptyRows(2)]);
    await fixture.whenStable();
    const fills = Array.from(el.querySelectorAll('tbody tr')).map((tr) => tr.querySelector<HTMLElement>('.bar i'));
    expect(fills[0]!.style.getPropertyValue('--imbalance')).toBe('0.4');
    expect(fills[0]!.classList.contains('pos')).toBeTrue();
    expect(fills[1]!.style.getPropertyValue('--imbalance')).toBe('-0.25');
    expect(fills[1]!.classList.contains('pos')).toBeFalse();
    expect(fills[2]).toBeNull();
  });

  it('shows run stats', async () => {
    fake.runId.set(3);
    fake.tradesCounted.set(3400);
    await fixture.whenStable();
    const stats = el.querySelector('.stats')!.textContent!;
    expect(stats).toContain('#3');
    expect(stats).toContain('200 / s');
    expect(stats).toContain('Trades counted');
    expect(stats).toContain('3,400');
  });

  it('pauses when running', () => {
    expect(button('Pause').disabled).toBeFalse();
    button('Pause').click();
    expect(fake.pause).toHaveBeenCalled();
  });

  it('resumes when paused', async () => {
    fake.status.set('paused');
    await fixture.whenStable();
    button('Resume').click();
    expect(fake.resume).toHaveBeenCalled();
  });

  for (const status of <const>['initializing', 'error']) {
    it(`disables the pause button in ${status}`, async () => {
      fake.status.set(status);
      await fixture.whenStable();
      expect(button('Pause').disabled).toBeTrue();
    });
  }

  it('shows an error banner with retry', async () => {
    expect(el.querySelector('.banner')).toBeNull();
    fake.status.set('error');
    fake.errorMessage.set('Generator stopped: unreachable');
    await fixture.whenStable();
    expect(el.querySelector('.banner-message')!.textContent).toBe('Generator stopped: unreachable');
    expect(el.querySelector('.banner-hint')!.textContent).toBe('Retry to start a new run.');
    button('Retry').click();
    expect(fake.retry).toHaveBeenCalled();
  });
});

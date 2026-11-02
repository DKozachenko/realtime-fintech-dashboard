import { provideExperimentalZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProducerService, ProducerStatus } from '../services/producer.service';
import { DEFAULT_SETTINGS, ProducerSettings } from '../shared/settings';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  function createFake() {
    const activeSettings = signal<ProducerSettings>(DEFAULT_SETTINGS);
    const runId = signal(1);
    return {
      activeSettings,
      runId,
      status: signal<ProducerStatus>('running'),
      apply: jasmine.createSpy('apply').and.callFake((settings: ProducerSettings) => {
        activeSettings.set(settings);
        runId.update((id) => id + 1);
      }),
    };
  }

  let fake: ReturnType<typeof createFake>;
  let fixture: ComponentFixture<SettingsComponent>;
  let el: HTMLElement;

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(SettingsComponent);
    el = <HTMLElement>fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fake = createFake();
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideExperimentalZonelessChangeDetection(), { provide: ProducerService, useValue: fake }],
    });
    await create();
  });

  function input(index: number): HTMLInputElement {
    return el.querySelectorAll<HTMLInputElement>('input')[index];
  }

  async function type(index: number, value: string): Promise<void> {
    const field = input(index);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function blur(index: number): Promise<void> {
    input(index).dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  function button(label: string): HTMLButtonElement {
    return <HTMLButtonElement>Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.trim() === label);
  }

  it('starts from the active run and Apply is disabled', () => {
    expect(Array.from(el.querySelectorAll('input')).map((i) => i.value)).toEqual(['5', '100', '500']);
    expect(button('Apply').disabled).toBeTrue();
    expect(button('Apply').title).toBe('Change a setting to apply it');
  });

  it('enables Apply after a change and disables it when changed back', async () => {
    await type(0, '12');
    expect(button('Apply').disabled).toBeFalse();
    expect(button('Apply').title).toBe('');
    await type(0, '5');
    expect(button('Apply').disabled).toBeTrue();
  });

  it('keeps Apply disabled for an invalid value', async () => {
    await type(0, '51');
    expect(button('Apply').disabled).toBeTrue();
  });

  it('shows a field error only after blur', async () => {
    await type(0, '51');
    expect(el.querySelector('.err')!.textContent!.trim()).toBe('');
    await blur(0);
    expect(el.querySelector('.err')!.textContent!.trim()).toBe('Must be between 1 and 50.');
    expect(input(0).classList.contains('bad')).toBeTrue();
  });

  it('apply calls the service with parsed numbers and shows the confirmation', async () => {
    await type(0, '12');
    await type(1, '100');
    await type(2, '250');
    button('Apply').click();
    await fixture.whenStable();
    expect(fake.apply).toHaveBeenCalledWith({
      instrumentCount: 12,
      updatesPerBatch: 100,
      batchIntervalMs: 250,
    });
    expect(el.querySelector('.toast')!.textContent).toContain(
      'Run #2 started: 12 instruments, 100 updates every 250 ms. Dashboard values were reset.',
    );
    await type(0, '13');
    expect(el.querySelector('.toast')).toBeNull();
  });

  it('reset restores defaults without applying', async () => {
    await type(0, '12');
    button('Reset to defaults').click();
    await fixture.whenStable();
    expect(input(0).value).toBe('5');
    expect(fake.apply).not.toHaveBeenCalled();
  });

  it('re-created component shows the active run, not discarded edits', async () => {
    await type(0, '12');
    fixture.destroy();
    await create();
    expect(input(0).value).toBe('5');
  });

  it('comparison panel marks changed values and nominal rate', async () => {
    await type(0, '12');
    await type(2, '250');
    const cells = Array.from(el.querySelectorAll('.cmp tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => td.textContent!.trim()),
    );
    expect(cells).toEqual([
      ['Instrument count', '5', '12'],
      ['Updates per batch', '100', '100'],
      ['Batch interval', '500', '250'],
      ['Nominal rate, updates/s', '200', '400'],
    ]);
    const changed = Array.from(el.querySelectorAll('.cmp td.changed')).map((td) => td.textContent!.trim());
    expect(changed).toEqual(['12', '250', '400']);
  });

  it('shows a dash for invalid values in the comparison', async () => {
    await type(0, 'abc');
    const next = Array.from(el.querySelectorAll('.cmp tbody tr td:last-child')).map((td) => td.textContent!.trim());
    expect(next[0]).toBe('—');
    expect(next[3]).toBe('—');
  });
});

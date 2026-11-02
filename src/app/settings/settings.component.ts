import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ProducerService } from '../services/producer.service';
import { DEFAULT_SETTINGS, nominalRate, ProducerSettings, sameSettings, SETTINGS_LIMITS } from '../shared/settings';
import { StatusIndicatorComponent } from '../ui/status-indicator.component';
import {
  fieldError,
  formatSettings,
  parseField,
  parseSettings,
  settingsErrorMessage,
  wholeNumberInRange,
} from './settings-form';

type Key = keyof ProducerSettings;

interface FieldDefinition {
  key: Key;
  label: string;
  rowLabel: string;
  help: string;
  range: string;
  errorId: string;
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const DASH = '—';

function field(key: Key, label: string, rowLabel: string, help: string): FieldDefinition {
  const { min, max } = SETTINGS_LIMITS[key];
  return {
    key,
    label,
    rowLabel,
    help,
    range: `${NUMBER.format(min)}–${NUMBER.format(max)}`,
    errorId: `${key}-error`,
  };
}

interface ComparisonRow {
  label: string;
  active: string;
  next: string;
  changed: boolean;
}

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, StatusIndicatorComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  protected readonly producer = inject(ProducerService);

  protected readonly fields: FieldDefinition[] = [
    field('instrumentCount', 'Instrument count', 'Instrument count', 'How many instruments to generate data for.'),
    field(
      'updatesPerBatch',
      'Updates per batch',
      'Updates per batch',
      'Market updates in each batch, across all instruments.',
    ),
    field('batchIntervalMs', 'Batch interval, ms', 'Batch interval', 'Requested time between batches.'),
  ];

  protected readonly form = this.createForm();
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // Hand-rolled because control.touched is not a signal.
  private readonly touched = signal<Partial<Record<Key, boolean>>>({});
  private readonly applied = signal(false);

  private readonly parsed = computed(() => parseSettings(<Record<Key, string>>this.values()));

  private readonly errors = computed(() => {
    const values = <Record<Key, string>>this.values();
    const messages = <Record<Key, string | null>>{};
    for (const { key } of this.fields) {
      messages[key] = settingsErrorMessage(fieldError(key, values[key]));
    }
    return messages;
  });

  /** Error message per field, present only after blur. */
  protected readonly visibleErrors = computed(() => {
    const touched = this.touched();
    const errors = this.errors();
    const visible = <Record<Key, string | null>>{};
    for (const { key } of this.fields) {
      visible[key] = touched[key] ? errors[key] : null;
    }
    return visible;
  });

  protected readonly canApply = computed(() => {
    const parsed = this.parsed();
    return parsed !== null && !sameSettings(parsed, this.producer.activeSettings());
  });

  protected readonly comparison = computed<ComparisonRow[]>(() => {
    const active = this.producer.activeSettings();
    const parsed = this.parsed();
    const values = <Record<Key, string>>this.values();
    const rows = this.fields.map(({ key, rowLabel }) => {
      const next = parseField(key, values[key]);
      return {
        label: rowLabel,
        active: NUMBER.format(active[key]),
        next: next === null ? DASH : NUMBER.format(next),
        changed: next !== null && next !== active[key],
      };
    });
    const activeRate = nominalRate(active);
    const nextRate = parsed === null ? null : nominalRate(parsed);
    rows.push({
      label: 'Nominal rate, updates/s',
      active: NUMBER.format(activeRate),
      next: nextRate === null ? DASH : NUMBER.format(nextRate),
      changed: nextRate !== null && nextRate !== activeRate,
    });
    return rows;
  });

  protected readonly confirmation = computed(() => {
    if (!this.applied()) {
      return null;
    }
    const { instrumentCount, updatesPerBatch, batchIntervalMs } = this.producer.activeSettings();
    return (
      `Run #${this.producer.runId()} started: ${NUMBER.format(instrumentCount)} instruments, ` +
      `${NUMBER.format(updatesPerBatch)} updates every ${NUMBER.format(batchIntervalMs)} ms. ` +
      'Dashboard values were reset.'
    );
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.applied.set(false);
    });
  }

  protected touch(key: Key): void {
    this.touched.update((touched) => ({ ...touched, [key]: true }));
  }

  protected apply(): void {
    const parsed = this.parsed();
    if (parsed === null || !this.canApply()) {
      return;
    }
    this.producer.apply(parsed);
    this.applied.set(true);
  }

  protected reset(): void {
    this.touched.set({});
    this.form.reset(formatSettings(DEFAULT_SETTINGS));
  }

  private createForm() {
    const initial = formatSettings(this.producer.activeSettings());
    const control = (key: Key) =>
      new FormControl(initial[key], {
        nonNullable: true,
        validators: [wholeNumberInRange(SETTINGS_LIMITS[key].min, SETTINGS_LIMITS[key].max)],
        updateOn: 'change',
      });
    return new FormGroup({
      instrumentCount: control('instrumentCount'),
      updatesPerBatch: control('updatesPerBatch'),
      batchIntervalMs: control('batchIntervalMs'),
    });
  }
}

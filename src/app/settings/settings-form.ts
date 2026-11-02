import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ProducerSettings, SETTINGS_LIMITS } from '../shared/settings';

function check(value: string, min: number, max: number): ValidationErrors | null {
  const text = value.trim();
  if (text === '') {
    return { required: true };
  }
  if (!/^\d+$/.test(text)) {
    return { wholeNumber: true };
  }
  const number = Number(text);
  if (number < min || number > max) {
    return { range: { min, max } };
  }
  return null;
}

/** Validates a string control: a whole number (digits only) within [min, max]. */
export function wholeNumberInRange(min: number, max: number): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    check(control.value ?? '', min, max);
}

export function settingsErrorMessage(errors: ValidationErrors | null): string | null {
  if (errors === null) {
    return null;
  }
  if (errors['required']) {
    return 'Enter a value.';
  }
  if (errors['wholeNumber']) {
    return 'Enter a whole number.';
  }
  if (errors['range']) {
    const { min, max } = errors['range'] as { min: number; max: number };
    return `Must be between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`;
  }
  return null;
}

export function fieldError(key: keyof ProducerSettings, value: string): ValidationErrors | null {
  const { min, max } = SETTINGS_LIMITS[key];
  return check(value, min, max);
}

/** The number for a valid field value, otherwise null. */
export function parseField(key: keyof ProducerSettings, value: string): number | null {
  return fieldError(key, value) === null ? Number(value.trim()) : null;
}

/** Settings → form values: the form holds text, so invalid input can be kept and rejected. */
export function formatSettings(settings: ProducerSettings): Record<keyof ProducerSettings, string> {
  return {
    instrumentCount: String(settings.instrumentCount),
    updatesPerBatch: String(settings.updatesPerBatch),
    batchIntervalMs: String(settings.batchIntervalMs),
  };
}

/** Form values → settings: the numbers if every field is valid, otherwise null. */
export function parseSettings(
  value: Record<keyof ProducerSettings, string>,
): ProducerSettings | null {
  const instrumentCount = parseField('instrumentCount', value.instrumentCount);
  const updatesPerBatch = parseField('updatesPerBatch', value.updatesPerBatch);
  const batchIntervalMs = parseField('batchIntervalMs', value.batchIntervalMs);
  if (instrumentCount === null || updatesPerBatch === null || batchIntervalMs === null) {
    return null;
  }
  return { instrumentCount, updatesPerBatch, batchIntervalMs };
}

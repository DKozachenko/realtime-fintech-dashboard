import { FormControl } from '@angular/forms';
import {
  fieldError,
  formatSettings,
  parseField,
  parseSettings,
  settingsErrorMessage,
  wholeNumberInRange,
} from './settings-form';

describe('whole-number validator', () => {
  const validate = (value: string) => wholeNumberInRange(1, 50)(new FormControl(value));

  it('requires a value', () => {
    expect(validate('')).toEqual({ required: true });
    expect(validate('   ')).toEqual({ required: true });
  });

  for (const value of ['0', '51']) {
    it(`rejects ${value} as out of range`, () => {
      expect(validate(value)).toEqual({ range: { min: 1, max: 50 } });
    });
  }

  for (const value of ['2.5', '1e3', '+5', '-1', 'abc']) {
    it(`rejects "${value}" as not a whole number`, () => {
      expect(validate(value)).toEqual({ wholeNumber: true });
    });
  }

  for (const value of [' 12 ', '007', '1', '50']) {
    it(`accepts "${value}"`, () => {
      expect(validate(value)).toBeNull();
    });
  }
});

describe('settingsErrorMessage', () => {
  it('describes each error', () => {
    expect(settingsErrorMessage({ required: true })).toBe('Enter a value.');
    expect(settingsErrorMessage({ wholeNumber: true })).toBe('Enter a whole number.');
    expect(settingsErrorMessage({ range: { min: 1, max: 50 } })).toBe('Must be between 1 and 50.');
    expect(settingsErrorMessage({ range: { min: 1, max: 1000 } })).toBe('Must be between 1 and 1,000.');
  });

  it('returns null without errors', () => {
    expect(settingsErrorMessage(null)).toBeNull();
  });
});

describe('parseSettings', () => {
  it('parses valid strings into numbers', () => {
    expect(parseSettings({ instrumentCount: ' 12 ', updatesPerBatch: '100', batchIntervalMs: '250' })).toEqual({
      instrumentCount: 12,
      updatesPerBatch: 100,
      batchIntervalMs: 250,
    });
  });

  it('returns null if any field is invalid', () => {
    expect(parseSettings({ instrumentCount: '51', updatesPerBatch: '100', batchIntervalMs: '250' })).toBeNull();
    expect(parseSettings({ instrumentCount: '5', updatesPerBatch: '', batchIntervalMs: '250' })).toBeNull();
  });
});

describe('fieldError and parseField', () => {
  it('validate against the limits of the given setting', () => {
    expect(fieldError('instrumentCount', '51')).toEqual({ range: { min: 1, max: 50 } });
    expect(fieldError('batchIntervalMs', '49')).toEqual({ range: { min: 50, max: 2000 } });
    expect(fieldError('updatesPerBatch', '1000')).toBeNull();
  });

  it('parseField returns the number or null', () => {
    expect(parseField('instrumentCount', ' 12 ')).toBe(12);
    expect(parseField('instrumentCount', '0')).toBeNull();
    expect(parseField('instrumentCount', 'x')).toBeNull();
  });
});

describe('formatSettings', () => {
  it('turns settings into form text that parses back to the same settings', () => {
    const settings = { instrumentCount: 12, updatesPerBatch: 1000, batchIntervalMs: 250 };
    expect(formatSettings(settings)).toEqual({
      instrumentCount: '12',
      updatesPerBatch: '1000',
      batchIntervalMs: '250',
    });
    expect(parseSettings(formatSettings(settings))).toEqual(settings);
  });
});

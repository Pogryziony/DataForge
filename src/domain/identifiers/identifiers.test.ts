import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SeededRandom } from '../random';
import { decodePesel, generateNip, generatePesel, generatePolishId, generateRegon, validateNip, validatePesel, validatePolishId, validateRegon } from './poland';
import { cprYear, decodeCpr, generateCpr, generateCvr, validateCpr, validateCvr } from './denmark';
import { generateIban, validateIban } from './banking';

describe('Polish identifiers', () => {
  it('accepts independent reference vectors', () => {
    expect(validatePesel('44051401458')).toBe(true);
    expect(decodePesel('44051401458')).toEqual({ birthDate: '1944-05-14', sex: 'male' });
    expect(validateNip('5261058627')).toBe(true);
    expect(validateRegon('000000052')).toBe(true);
    expect(validatePolishId('ABA300000')).toBe(true);
    expect(validatePesel('44051401459')).toBe(false);
  });
  it('generates valid identifiers across supported centuries', () => {
    fc.assert(fc.property(fc.integer({ min: 1800, max: 2299 }), fc.string(), (year, seed) => {
      const random = new SeededRandom(seed), date = `${year}-01-03`;
      const value = generatePesel(random, date, 'female');
      expect(validatePesel(value)).toBe(true);
      expect(decodePesel(value)).toEqual({ birthDate: date, sex: 'female' });
      expect(validateNip(generateNip(random))).toBe(true);
      expect(validateRegon(generateRegon(random, 14))).toBe(true);
      expect(validatePolishId(generatePolishId(random))).toBe(true);
    }));
  });
});
describe('Danish profiles', () => {
  it('accepts the CPR authority legacy vector and non-mod11 standard values', () => {
    expect(validateCpr('070761-4285', 'legacy-mod11')).toBe(true);
    expect(decodeCpr('0707614285').birthDate).toBe('1961-07-07');
    expect(validateCpr('0707614287')).toBe(true);
    expect(validateCpr('0707614287', 'legacy-mod11')).toBe(false);
    expect(validateCpr('3102991234')).toBe(false);
    expect(validateCpr('0707614285', 'official-test-pool')).toBe(false);
  });
  it('honours all century transitions', () => {
    expect(cprYear(36, 4)).toBe(2036);
    expect(cprYear(37, 4)).toBe(1937);
    expect(cprYear(57, 5)).toBe(2057);
    expect(cprYear(58, 5)).toBe(1858);
    fc.assert(fc.property(fc.integer({ min: 1858, max: 2057 }), year => {
      const date = `${year}-03-01`;
      const value = generateCpr(new SeededRandom(String(year)), date, 'male', 'legacy-mod11');
      expect(decodeCpr(value)).toMatchObject({ birthDate: date, sex: 'male', modulus11: true });
    }));
  });
  it('checks company checksum independently', () => {
    expect(validateCvr('29136815')).toBe(true);
    expect(validateCvr(generateCvr(new SeededRandom('company')))).toBe(true);
  });
});
describe('IBAN', () => {
  it('accepts SWIFT examples and rejects corruption', () => {
    for (const value of ['DK5000400440116243', 'PL61109010140000071219812874', 'DE89370400440532013000', 'GB29NWBK60161331926819']) expect(validateIban(value)).toBe(true);
    expect(validateIban('DK5100400440116243')).toBe(false);
  });
  it('produces checksum-compatible accounts', () => {
    for (const country of ['PL', 'DK', 'DE', 'GB'] as const) {
      for (let i = 0; i < 100; i++) expect(validateIban(generateIban(new SeededRandom(`${country}${i}`), country))).toBe(true);
    }
  });
});

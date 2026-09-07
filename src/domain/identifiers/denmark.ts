import { dateParts, isoDate } from '../dates';
import { DomainError } from '../errors';
import type { SeededRandom } from '../random';
import type { CprProfile, EncodedSex } from '../types';

const CPR_WEIGHTS = [4, 3, 2, 7, 6, 5, 4, 3, 2, 1];
export function cprYear(shortYear: number, seventh: number): number {
  if (seventh <= 3) return 1900 + shortYear;
  if (seventh === 4 || seventh === 9) return (shortYear <= 36 ? 2000 : 1900) + shortYear;
  return (shortYear <= 57 ? 2000 : 1800) + shortYear;
}
export function decodeCpr(input: string): { birthDate: string; sex: EncodedSex; modulus11: boolean } {
  if (!/^(?:\d{10}|\d{6}-\d{4})$/.test(input)) throw new DomainError('CPR_FORMAT', 'Expected DDMMYYXXXX or DDMMYY-XXXX');
  const value = input.replace('-', '');
  if (value.slice(6) === '0000') throw new DomainError('CPR_SERIAL', 'The serial 0000 is excluded');
  const year = cprYear(Number(value.slice(4, 6)), Number(value[6]));
  return {
    birthDate: isoDate(year, Number(value.slice(2, 4)), Number(value.slice(0, 2))),
    sex: Number(value[9]) % 2 ? 'male' : 'female',
    modulus11: [...value].reduce((sum, digit, i) => sum + Number(digit) * CPR_WEIGHTS[i], 0) % 11 === 0,
  };
}
export function validateCpr(input: string, profile: CprProfile = 'standard', officialPool: string[] = []): boolean {
  try {
    const result = decodeCpr(input);
    if (profile === 'legacy-mod11') return result.modulus11;
    if (profile === 'official-test-pool') return officialPool.some(value => value.replace('-', '') === input.replace('-', ''));
    return true;
  } catch { return false; }
}
export function generateCpr(random: SeededRandom, birthDate: string, sex: EncodedSex, profile: CprProfile = 'standard', formatted = false, officialPool: string[] = []): string {
  const { year, month, day } = dateParts(birthDate);
  if (year < 1858 || year > 2057) throw new DomainError('CPR_YEAR_RANGE', 'CPR supports years 1858–2057');
  const prefix = [day, month, year % 100].map(value => String(value).padStart(2, '0')).join('');
  let value: string;
  if (profile === 'official-test-pool') {
    const candidates = officialPool.filter(candidate => {
      if (!validateCpr(candidate)) return false;
      const decoded = decodeCpr(candidate);
      return decoded.birthDate === birthDate && decoded.sex === sex;
    });
    value = random.pick(candidates).replace('-', '');
  } else {
    const seventhDigits = Array.from({ length: 10 }, (_, i) => i).filter(digit => cprYear(year % 100, digit) === year);
    for (let attempt = 0; attempt < 2000; attempt++) {
      const candidate = prefix + random.pick(seventhDigits) + random.digits(2) + (random.integer(0, 4) * 2 + Number(sex === 'male'));
      if (validateCpr(candidate, profile)) return formatted ? candidate.slice(0, 6) + '-' + candidate.slice(6) : candidate;
    }
    throw new DomainError('CPR_EXHAUSTED', 'Unable to satisfy the CPR profile within the retry limit');
  }
  return formatted ? value.slice(0, 6) + '-' + value.slice(6) : value;
}

const CVR_WEIGHTS = [2, 7, 6, 5, 4, 3, 2, 1];
/** A checksum profile, not proof of a registered or active business. */
export function validateCvr(value: string): boolean {
  return /^[1-9]\d{7}$/.test(value) && [...value].reduce((sum, char, i) => sum + Number(char) * CVR_WEIGHTS[i], 0) % 11 === 0;
}
export function generateCvr(random: SeededRandom): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const body = random.integer(1, 9) + random.digits(6);
    const remainder = [...body].reduce((sum, char, i) => sum + Number(char) * CVR_WEIGHTS[i], 0) % 11;
    const check = (11 - remainder) % 11;
    if (check < 10) return body + check;
  }
  throw new DomainError('CVR_EXHAUSTED', 'Unable to generate checksum-compatible CVR');
}
/** Only the documented ten-digit structure; no invented checksum rule. */
export const generatePNumber = (random: SeededRandom): string => random.integer(1, 9) + random.digits(9);
export const validatePNumber = (value: string): boolean => /^[1-9]\d{9}$/.test(value);

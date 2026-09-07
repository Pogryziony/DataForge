import { dateParts, isoDate } from '../dates';
import { DomainError } from '../errors';
import type { SeededRandom } from '../random';
import type { EncodedSex } from '../types';

const PESEL_WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7];
const REGON9_WEIGHTS = [8, 9, 2, 3, 4, 5, 6, 7];
const REGON14_WEIGHTS = [2, 4, 8, 5, 0, 9, 7, 3, 6, 1, 2, 4, 8];
const sum = (value: string, weights: number[]) =>
  weights.reduce((result, weight, index) => result + Number(value[index]) * weight, 0);
const pad = (value: number) => String(value).padStart(2, '0');

export function generatePesel(random: SeededRandom, birthDate: string, sex: EncodedSex): string {
  const { year, month, day } = dateParts(birthDate);
  const offsets: Record<number, number> = { 18: 80, 19: 0, 20: 20, 21: 40, 22: 60 };
  const offset = offsets[Math.floor(year / 100)];
  if (offset === undefined)
    throw new DomainError('PESEL_YEAR_RANGE', 'PESEL supports years 1800–2299');
  const body =
    pad(year % 100) +
    pad(month + offset) +
    pad(day) +
    random.digits(3) +
    String(random.integer(0, 4) * 2 + Number(sex === 'male'));
  return body + String((10 - (sum(body, PESEL_WEIGHTS) % 10)) % 10);
}
export function decodePesel(value: string): { birthDate: string; sex: EncodedSex } {
  if (!/^\d{11}$/.test(value))
    throw new DomainError('PESEL_FORMAT', 'PESEL requires exactly 11 digits');
  const encodedMonth = Number(value.slice(2, 4));
  const century = [1900, 2000, 2100, 2200, 1800][Math.floor(encodedMonth / 20)];
  if (century === undefined) throw new DomainError('PESEL_DATE', 'Unsupported month encoding');
  return {
    birthDate: isoDate(
      century + Number(value.slice(0, 2)),
      encodedMonth % 20,
      Number(value.slice(4, 6)),
    ),
    sex: Number(value[9]) % 2 ? 'male' : 'female',
  };
}
export function validatePesel(value: string): boolean {
  try {
    decodePesel(value);
    return (sum(value, PESEL_WEIGHTS) + Number(value[10])) % 10 === 0;
  } catch {
    return false;
  }
}
export function generateNip(random: SeededRandom): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const body = String(random.integer(1, 9)) + random.digits(8);
    const check = sum(body, NIP_WEIGHTS) % 11;
    if (check < 10) return body + check;
  }
  throw new DomainError('NIP_EXHAUSTED', 'Unable to generate NIP within retry limit');
}
export function validateNip(value: string): boolean {
  return (
    /^\d{10}$/.test(value) &&
    !/^0+$/.test(value) &&
    sum(value, NIP_WEIGHTS) % 11 === Number(value[9])
  );
}
const regonCheck = (body: string, weights: number[]) => (sum(body, weights) % 11) % 10;
export function generateRegon(random: SeededRandom, length: 9 | 14 = 9): string {
  const body = String(random.integer(1, 9)) + random.digits(7);
  const parent = body + regonCheck(body, REGON9_WEIGHTS);
  if (length === 9) return parent;
  const unit = parent + random.digits(4);
  return unit + regonCheck(unit, REGON14_WEIGHTS);
}
export function validateRegon(value: string): boolean {
  if (!/^(?:\d{9}|\d{14})$/.test(value) || /^0+$/.test(value)) return false;
  if (regonCheck(value, REGON9_WEIGHTS) !== Number(value[8])) return false;
  return value.length === 9 || regonCheck(value, REGON14_WEIGHTS) === Number(value[13]);
}
const letterValue = (char: string) => char.charCodeAt(0) - 55;
export function generatePolishId(random: SeededRandom): string {
  const series = Array.from({ length: 3 }, () => String.fromCharCode(random.integer(65, 90))).join(
    '',
  );
  const serial = random.digits(5);
  const total =
    [7, 3, 1].reduce((result, weight, index) => result + letterValue(series[index]) * weight, 0) +
    sum(serial, [7, 3, 1, 7, 3]);
  return series + (total % 10) + serial;
}
export function validatePolishId(value: string): boolean {
  if (!/^[A-Z]{3}\d{6}$/.test(value)) return false;
  const weights = [7, 3, 1, 9, 7, 3, 1, 7, 3];
  return (
    [...value].reduce(
      (result, char, index) =>
        result + (index < 3 ? letterValue(char) : Number(char)) * weights[index],
      0,
    ) %
      10 ===
    0
  );
}

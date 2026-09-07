import { DomainError } from '../errors';
import type { SeededRandom } from '../random';

export type IbanCountry = 'PL' | 'DK' | 'DE' | 'GB';
const lengths: Record<IbanCountry, number> = { PL: 28, DK: 18, DE: 22, GB: 22 };
function mod97(value: string): number {
  let remainder = 0;
  for (const char of value) {
    const encoded = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of encoded) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}
export function ibanFromBban(country: IbanCountry, bban: string): string {
  const expected =
    country === 'GB' ? /^[A-Z]{4}\d{14}$/ : new RegExp(`^\\d{${lengths[country] - 4}}$`);
  if (!expected.test(bban)) throw new DomainError('BBAN_FORMAT', 'Invalid basic account number');
  const check = String(98 - mod97(bban + country + '00')).padStart(2, '0');
  return country + check + bban;
}
export function generateIban(random: SeededRandom, country: IbanCountry): string {
  if (!(country in lengths))
    throw new DomainError('IBAN_COUNTRY', 'IBAN is supported for PL, DK, DE and GB; not US');
  let bban = country === 'GB' ? 'TEST' + random.digits(14) : random.digits(lengths[country] - 4);
  if (country === 'PL') {
    const prefix = random.digits(7);
    const sum = [...prefix].reduce(
      (total, digit, i) => total + Number(digit) * [3, 9, 7, 1, 3, 9, 7][i],
      0,
    );
    bban = prefix + ((10 - (sum % 10)) % 10) + random.digits(16);
  }
  return ibanFromBban(country, bban);
}
export function validateIban(value: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(value)) return false;
  const country = value.slice(0, 2) as IbanCountry;
  if (
    value.length !== lengths[country] ||
    Number(value.slice(2, 4)) < 2 ||
    Number(value.slice(2, 4)) > 98
  )
    return false;
  const bban = value.slice(4);
  if (country === 'GB' ? !/^[A-Z]{4}\d{14}$/.test(bban) : !/^\d+$/.test(bban)) return false;
  return mod97(bban + value.slice(0, 4)) === 1;
}

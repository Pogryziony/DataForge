import { DomainError } from './errors';
import type { SeededRandom } from './random';

export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError('INVALID_DATE', 'Expected YYYY-MM-DD');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DomainError('INVALID_DATE', 'Date does not exist');
  }
  return date;
}
export function dateParts(value: string) {
  const date = parseDate(value);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
export function isoDate(year: number, month: number, day: number): string {
  const result = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  parseDate(result);
  return result;
}
export function randomDate(random: SeededRandom, min = '1950-01-01', max = '2005-12-31'): string {
  const day = random.integer(parseDate(min).getTime() / 86400000, parseDate(max).getTime() / 86400000);
  return new Date(day * 86400000).toISOString().slice(0, 10);
}
export function ageOn(birthDate: string, referenceDate: string): number {
  const birth = dateParts(birthDate);
  const reference = dateParts(referenceDate);
  if (birthDate > referenceDate) throw new DomainError('FUTURE_BIRTH', 'Birth date is after reference date');
  return reference.year - birth.year - Number(reference.month < birth.month || (reference.month === birth.month && reference.day < birth.day));
}
export function addDays(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new DomainError('INVALID_OFFSET', 'Date offset must be an integer');
  const result = new Date(parseDate(value).getTime() + days * 86400000);
  if (!Number.isFinite(result.getTime())) throw new DomainError('INVALID_DATE', 'Date offset exceeds supported range');
  return result.toISOString().slice(0, 10);
}

/** ISO timestamp with an explicit IANA-zone offset at the requested instant. */
export function zonedTimestamp(date: Date, timeZone: string): string {
  if (timeZone === 'UTC') return date.toISOString();
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
  } catch { throw new DomainError('TIME_ZONE', 'Provide a supported IANA time zone'); }
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offset = Math.round((Date.parse(local + 'Z') - date.getTime()) / 60000);
  const absolute = Math.abs(offset);
  return `${local}${offset < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

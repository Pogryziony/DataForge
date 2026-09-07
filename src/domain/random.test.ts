import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SeededRandom } from './random';
import { ageOn, parseDate, zonedTimestamp } from './dates';

describe('deterministic primitives', () => {
  it('replays seeded streams', () => {
    fc.assert(fc.property(fc.string(), seed => {
      const a = new SeededRandom(seed), b = new SeededRandom(seed);
      expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
    }));
  });
  it('bounds integers and creates version 4 UUID syntax', () => {
    const random = new SeededRandom('test');
    for (let i = 0; i < 1000; i++) {
      expect(random.integer(-2, 2)).toBeGreaterThanOrEqual(-2);
      expect(random.integer(-2, 2)).toBeLessThanOrEqual(2);
      expect(random.uuid()).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    }
    expect(() => random.integer(2, 1)).toThrow();
    expect(() => random.pick([])).toThrow();
  });
  it('rejects date overflow and calculates completed years', () => {
    expect(() => parseDate('2023-02-29')).toThrow();
    expect(parseDate('2024-02-29').getUTCDate()).toBe(29);
    expect(ageOn('2000-09-08', '2026-09-07')).toBe(25);
  });
  it('preserves the instant with explicit winter and summer Copenhagen offsets', () => {
    expect(zonedTimestamp(new Date('2026-01-15T12:00:00Z'), 'Europe/Copenhagen')).toBe('2026-01-15T13:00:00+01:00');
    expect(zonedTimestamp(new Date('2026-07-15T12:00:00Z'), 'Europe/Copenhagen')).toBe('2026-07-15T14:00:00+02:00');
    expect(() => zonedTimestamp(new Date(), 'not-a-zone')).toThrow('IANA');
  });
});

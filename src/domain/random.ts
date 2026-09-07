import { DomainError } from './errors';

/** FNV-1a seed expansion and Mulberry32. Versioned as part of engine-v1. */
export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom {
  private state: number;
  constructor(public readonly seed: string) {
    this.state = hashSeed(seed);
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  integer(min: number, max: number): number {
    if (
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) ||
      min > max ||
      max - min > Number.MAX_SAFE_INTEGER
    ) {
      throw new DomainError('INVALID_RANGE', 'Expected an ordered safe integer range');
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }
  pick<T>(values: readonly T[]): T {
    if (!values.length)
      throw new DomainError('EMPTY_POOL', 'No candidate values match these constraints');
    return values[this.integer(0, values.length - 1)];
  }
  digits(length: number): string {
    if (!Number.isInteger(length) || length < 0 || length > 100_000)
      throw new DomainError('INVALID_LENGTH', 'Length must be 0–100000');
    return Array.from({ length }, () => this.integer(0, 9)).join('');
  }
  uuid(): string {
    const bytes = Array.from({ length: 16 }, () => this.integer(0, 255));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  fork(...parts: (string | number)[]): SeededRandom {
    return new SeededRandom(JSON.stringify([this.seed, ...parts]));
  }
}

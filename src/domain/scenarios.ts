import { validateRecord } from './engine';
import { DomainError, type ValidationIssue } from './errors';
import type { DataRecord, GenerationConfig, JsonValue } from './types';

export type Mutation =
  | 'missing'
  | 'null'
  | 'empty'
  | 'type'
  | 'length'
  | 'range'
  | 'date'
  | 'checksum'
  | 'unicode'
  | 'foreignKey';
export interface NegativeCase {
  caseId: string;
  category: Mutation;
  fieldPath: string;
  original: DataRecord;
  record: DataRecord;
  issues: ValidationIssue[];
  isolated: boolean;
  expectedViolation: string;
}
export function negativeCase(
  original: DataRecord,
  config: GenerationConfig,
  fieldName: string,
  category: Mutation,
  index = 0,
): NegativeCase {
  const baselineIssues = validateRecord(original, config);
  if (baselineIssues.length)
    throw new DomainError('INVALID_BASELINE', 'Negative mutation requires a valid baseline');
  const field = config.schema.fields.find((field) => field.name === fieldName);
  if (!field) throw new DomainError('FIELD_MISSING', 'Choose a root field for mutation');
  const record = structuredClone(original);
  const previous = record[fieldName];
  switch (category) {
    case 'missing':
      delete record[fieldName];
      break;
    case 'null':
      record[fieldName] = null;
      break;
    case 'empty':
      record[fieldName] = '';
      break;
    case 'type':
      record[fieldName] = typeof previous === 'number' ? 'not-a-number' : 123;
      break;
    case 'length':
      record[fieldName] = 'A'.repeat(Math.min(100001, Number(field.options?.maxLength ?? 100) + 1));
      break;
    case 'range':
      record[fieldName] = Number(field.options?.max ?? 1000) + 1;
      break;
    case 'date':
      record[fieldName] = '2023-02-29';
      break;
    case 'checksum': {
      const supported = ['pesel', 'nip', 'regon', 'iban', 'nrb', 'cvr', 'vatDk'];
      if (
        !supported.includes(field.generator) &&
        !(field.generator === 'cpr' && field.options?.profile === 'legacy-mod11')
      )
        throw new DomainError(
          'NO_REQUIRED_CHECKSUM',
          'This profile has no supported mandatory checksum',
        );
      const value = String(previous);
      record[fieldName] = value.slice(0, -1) + String((Number(value.at(-1)) + 1) % 10);
      break;
    }
    case 'unicode':
      record[fieldName] = 'ÆØÅ\u0000中文';
      break;
    case 'foreignKey':
      record[fieldName] = '__missing_foreign_key__';
      break;
  }
  const issues = validateRecord(record, config);
  if (!issues.length)
    throw new DomainError(
      'MUTATION_NOT_INVALID',
      'The chosen mutation does not violate a checked rule; choose another mutation',
    );
  return {
    caseId: `negative-${index + 1}`,
    category,
    fieldPath: fieldName,
    original: structuredClone(original),
    record,
    issues,
    isolated: issues.length === 1,
    expectedViolation: `${category}:${fieldName}`,
  };
}

export function boundaryValues(
  min: number,
  max: number,
  step = 1,
): { value: number; expected: 'valid' | 'invalid' }[] {
  if (![min, max, step].every(Number.isFinite) || min > max || step <= 0)
    throw new DomainError('BOUNDARY_RANGE', 'Provide finite ordered bounds and a positive step');
  return [
    ...new Set([
      min - step,
      min,
      Math.min(max, min + step),
      Math.max(min, max - step),
      max,
      max + step,
    ]),
  ].map((value) => ({ value, expected: value >= min && value <= max ? 'valid' : 'invalid' }));
}

export interface PairwiseInput {
  parameters: Record<string, JsonValue[]>;
  forbidden?: DataRecord[];
  maxRows?: number;
}
export interface PairwiseResult {
  rows: DataRecord[];
  coveredPairs: number;
  totalPairs: number;
  complete: boolean;
}
export function generatePairwise(input: PairwiseInput): PairwiseResult {
  const entries = Object.entries(input.parameters);
  if (
    entries.length < 2 ||
    entries.length > 10 ||
    entries.some(
      ([name, values]) =>
        ['__proto__', 'constructor', 'prototype'].includes(name) ||
        !Array.isArray(values) ||
        !values.length,
    )
  )
    throw new DomainError('PAIRWISE_PARAMETERS', 'Provide 2–10 non-empty parameters');
  if (entries.reduce((size, [, values]) => size * values.length, 1) > 10000)
    throw new DomainError(
      'PAIRWISE_LIMIT',
      'Cartesian candidate space is limited to 10000 combinations',
    );
  for (const forbidden of input.forbidden ?? [])
    for (const [key, value] of Object.entries(forbidden)) {
      if (
        !input.parameters[key]?.some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(value),
        )
      )
        throw new DomainError(
          'PAIRWISE_CONSTRAINT',
          'Constraint uses an unknown parameter or value',
          key,
        );
    }
  let candidates: DataRecord[] = [{}];
  for (const [name, values] of entries)
    candidates = candidates.flatMap((row) => values.map((value) => ({ ...row, [name]: value })));
  candidates = candidates.filter(
    (row) =>
      !(input.forbidden ?? []).some((constraint) =>
        Object.entries(constraint).every(
          ([key, value]) => JSON.stringify(row[key]) === JSON.stringify(value),
        ),
      ),
  );
  const pairs = (row: DataRecord): string[] =>
    entries.flatMap(([first], i) =>
      entries
        .slice(i + 1)
        .map(([second]) => JSON.stringify([first, row[first], second, row[second]])),
    );
  const candidatePairs = candidates.map(pairs);
  const uncovered = new Set(candidatePairs.flat());
  const totalPairs = uncovered.size;
  const rows: DataRecord[] = [];
  const limit = input.maxRows ?? 1000;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
    throw new DomainError('PAIRWISE_ROWS', 'Row limit must be 1–10000');
  while (uncovered.size && rows.length < limit) {
    let bestIndex = -1,
      bestScore = 0;
    candidatePairs.forEach((values, index) => {
      const score = values.reduce((total, pair) => total + Number(uncovered.has(pair)), 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) break;
    rows.push(candidates[bestIndex]);
    candidatePairs[bestIndex].forEach((pair) => uncovered.delete(pair));
  }
  return {
    rows,
    coveredPairs: totalPairs - uncovered.size,
    totalPairs,
    complete: uncovered.size === 0,
  };
}

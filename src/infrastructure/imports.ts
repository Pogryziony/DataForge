import Papa from 'papaparse';
import { DomainError } from '../domain/errors';
import type { DataRecord, JsonValue, ReferencePool } from '../domain/types';
import { validateReferencePool } from '../domain/addresses';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export function parseSafeJson(text: string): JsonValue {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new DomainError('IMPORT_LIMIT', 'Import is limited to 20 MiB');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new DomainError('JSON_PARSE', 'Invalid JSON; check syntax without exposing record contents'); }
  let nodes = 0;
  function inspect(node: unknown, depth: number): void {
    if (++nodes > 3000000 || depth > 14) throw new DomainError('JSON_COMPLEXITY', 'JSON exceeds nesting or node limits');
    if (typeof node === 'number' && !Number.isFinite(node)) throw new DomainError('JSON_NUMBER', 'Non-finite JSON number');
    if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new DomainError('UNSAFE_KEY', 'Unsafe object key');
      inspect(child, depth + 1);
    }
  }
  inspect(value, 0);
  return value as JsonValue;
}
export function importRecords(text: string, format: 'json' | 'csv'): DataRecord[] {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new DomainError('IMPORT_LIMIT', 'Import is limited to 20 MiB');
  let records: unknown;
  if (format === 'json') records = parseSafeJson(text);
  else {
    const result = Papa.parse<DataRecord>(text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false });
    if (result.errors.length || result.meta.renamedHeaders && Object.keys(result.meta.renamedHeaders).length) throw new DomainError('CSV_PARSE', 'Invalid CSV structure or duplicate headers');
    records = result.data;
  }
  if (!Array.isArray(records) || records.length > 100000) throw new DomainError('IMPORT_RECORDS', 'Expected an array of at most 100000 records');
  records.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new DomainError('IMPORT_ROW', 'Every record must be an object', String(i));
    for (const key of Object.keys(row)) if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new DomainError('UNSAFE_KEY', 'Unsafe column name');
  });
  return records as DataRecord[];
}
export function mapColumns(records: DataRecord[], mapping: Record<string, string>): DataRecord[] {
  const targets = Object.values(mapping).filter(Boolean);
  if (new Set(targets).size !== targets.length || targets.some(value => ['__proto__', 'constructor', 'prototype'].includes(value))) throw new DomainError('COLUMN_MAPPING', 'Target names must be unique and safe');
  return records.map(row => Object.fromEntries(Object.entries(mapping).filter(([source, target]) => target && Object.hasOwn(row, source)).map(([source, target]) => [target, row[source]])));
}
export function importReferencePool(text: string): ReferencePool {
  const pool = parseSafeJson(text) as unknown as ReferencePool;
  validateReferencePool(pool);
  return pool;
}

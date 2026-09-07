import { addDays } from './dates';
import { DomainError } from './errors';
import type { DataRecord, JsonValue } from './types';

export interface TransformRule {
  field: string;
  operation:
    | 'mask'
    | 'remove'
    | 'pseudonymize'
    | 'replace'
    | 'generate'
    | 'shiftDate'
    | 'trim'
    | 'uppercase'
    | 'lowercase';
  generator?: string;
  options?: Record<string, JsonValue>;
  value?: JsonValue;
  keepLast?: number;
  domain?: string;
}
export async function transformRecords(
  records: DataRecord[],
  rules: TransformRule[],
  secret = '',
  generated: DataRecord[] = [],
): Promise<DataRecord[]> {
  const needsSecret = rules.some((rule) => rule.operation === 'pseudonymize');
  if (needsSecret && secret.length < 16)
    throw new DomainError(
      'PSEUDONYM_KEY',
      'Provide a private key of at least 16 characters; it will not be saved',
    );
  const encoder = new TextEncoder();
  const key = needsSecret
    ? await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
    : null;
  const cache = new Map<string, string>();
  const result: DataRecord[] = [];
  for (const [index, original] of records.entries()) {
    const row = structuredClone(original);
    for (const rule of rules) {
      if (!Object.hasOwn(row, rule.field)) continue;
      const value = row[rule.field];
      switch (rule.operation) {
        case 'remove':
          delete row[rule.field];
          break;
        case 'replace':
          row[rule.field] = structuredClone(rule.value ?? null);
          break;
        case 'generate': {
          if (!Object.hasOwn(generated[index] ?? {}, rule.field))
            throw new DomainError(
              'TRANSFORM_GENERATOR',
              'Synthetic replacement is not available',
              rule.field,
            );
          row[rule.field] = structuredClone(generated[index][rule.field]);
          break;
        }
        case 'mask': {
          const text = String(value),
            keep = rule.keepLast ?? 4;
          if (!Number.isInteger(keep) || keep < 0)
            throw new DomainError('MASK_LENGTH', 'Visible suffix length must be non-negative');
          row[rule.field] =
            '*'.repeat(Math.max(0, text.length - keep)) + (keep ? text.slice(-keep) : '');
          break;
        }
        case 'pseudonymize': {
          const message = JSON.stringify([rule.domain ?? 'default', value]);
          if (!cache.has(message)) {
            const bytes = new Uint8Array(
              await crypto.subtle.sign('HMAC', key!, encoder.encode(message)),
            );
            cache.set(
              message,
              'pseudo_' + [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
            );
          }
          row[rule.field] = cache.get(message)!;
          break;
        }
        case 'shiftDate':
          row[rule.field] = addDays(String(value), Number(rule.value ?? 0));
          break;
        case 'trim':
          row[rule.field] = String(value).trim();
          break;
        case 'uppercase':
          row[rule.field] = String(value).toUpperCase();
          break;
        case 'lowercase':
          row[rule.field] = String(value).toLowerCase();
          break;
        default:
          throw new DomainError('TRANSFORM', 'Unsupported transform');
      }
    }
    result.push(row);
  }
  return result;
}

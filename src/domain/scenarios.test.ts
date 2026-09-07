import { expect, it } from 'vitest';
import { generatePairwise, negativeCase } from './scenarios';
import { importJsonSchema, compileJsonValidator } from './json-schema';
import { GenerationSession } from './engine';
import { createGeneratorRegistry } from './generators';
import { loadTextProvider } from '../infrastructure/faker';
import type { GenerationConfig } from './types';

it('covers allowed parameter pairs and reports truncation', () => {
  const input = {
    parameters: { country: ['PL', 'DK'], role: ['user', 'admin'], active: [true, false] },
    forbidden: [{ country: 'DK', role: 'admin' }],
  };
  const result = generatePairwise(input);
  expect(result.complete).toBe(true);
  expect(result.rows.some((row) => row.country === 'DK' && row.role === 'admin')).toBe(false);
  expect(generatePairwise({ ...input, maxRows: 1 }).complete).toBe(false);
});
it('checks negative mutations rather than claiming arbitrary text is invalid', () => {
  const config: GenerationConfig = {
    seed: 'a',
    referenceDate: '2026-09-07',
    count: 1,
    locale: 'pl',
    schema: {
      id: 's',
      name: 's',
      version: 1,
      fields: [{ id: 'id', name: 'id', generator: 'integer', options: { min: 1, max: 10 } }],
    },
  };
  const result = negativeCase({ id: 4 }, config, 'id', 'range');
  expect(result.isolated).toBe(true);
  expect(result.issues[0].code).toBe('RANGE');
});
it('imports supported schema and validates generated data independently', async () => {
  const original = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['code', 'amount', 'nested'],
    additionalProperties: false,
    properties: {
      code: { type: 'string', pattern: '^[A-Z]{4,6}$' },
      amount: { type: 'integer', minimum: 4, maximum: 9 },
      nested: { type: 'array', maxItems: 3, items: { type: 'boolean' } },
    },
  };
  const schema = importJsonSchema(original);
  const registry = createGeneratorRegistry(await loadTextProvider(['pl']));
  const rows = new GenerationSession(
    { seed: 'schema', referenceDate: '2026-09-07', count: 20, locale: 'pl', schema },
    registry,
  ).nextBatch(20);
  const validate = compileJsonValidator(original);
  rows.forEach((row) => expect(validate(row)).toBe(true));
  expect(() => importJsonSchema({ type: 'object', allOf: [] })).toThrow('allOf');
  expect(() => importJsonSchema({ $ref: 'https://example.com/schema' })).toThrow('local');
});

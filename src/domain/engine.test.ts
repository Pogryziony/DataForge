import { beforeAll, describe, expect, it } from 'vitest';
import { loadTextProvider } from '../infrastructure/faker';
import { createGeneratorRegistry, type GeneratorDefinition } from './generators';
import { GenerationSession, validateRecord } from './engine';
import type { GenerationConfig } from './types';
import { generateDatasets } from './datasets';

let registry: Map<string, GeneratorDefinition>;
beforeAll(async () => {
  registry = createGeneratorRegistry(await loadTextProvider(['pl', 'da']));
});
const config: GenerationConfig = {
  seed: 'example',
  referenceDate: '2026-09-07',
  locale: 'da',
  count: 50,
  schema: {
    id: 'customer',
    name: 'Customer',
    version: 1,
    fields: [
      { id: 'id', name: 'id', generator: 'uuid', unique: true },
      {
        id: 'cpr',
        name: 'cpr',
        generator: 'cpr',
        options: { birthDateField: 'birthDate', sexField: 'sex' },
      },
      { id: 'birth', name: 'birthDate', generator: 'birthDate' },
      { id: 'sex', name: 'sex', generator: 'enum', options: { values: ['female', 'male'] } },
    ],
  },
};
describe('schema generation', () => {
  it('rejects multiplicative output before allocating nested arrays', () => {
    expect(
      () =>
        new GenerationSession(
          {
            ...config,
            count: 100000,
            schema: {
              ...config.schema,
              fields: [
                {
                  id: 'a',
                  name: 'a',
                  generator: 'array',
                  options: { maxItems: 1000 },
                  item: { id: 'b', name: 'b', generator: 'text', options: { maxLength: 100000 } },
                },
              ],
            },
          },
          registry,
        ),
    ).toThrow('256 MiB');
  });
  it('resolves dependencies and validates each generated row', () => {
    const rows = new GenerationSession(config, registry).nextBatch(50);
    rows.forEach((row) => expect(validateRecord(row, config)).toEqual([]));
  });
  it('produces identical results with different batch sizes', () => {
    const a = new GenerationSession(config, registry),
      b = new GenerationSession(config, registry);
    expect(a.nextBatch(50)).toEqual([...b.nextBatch(7), ...b.nextBatch(19), ...b.nextBatch(24)]);
  });
  it('rejects duplicate names, cycles, missing references and uniqueness exhaustion', () => {
    const make = (fields: GenerationConfig['schema']['fields']) =>
      new GenerationSession({ ...config, schema: { ...config.schema, fields } }, registry);
    expect(() =>
      make([{ id: 'a', name: 'a', generator: 'uuid', rule: { operation: 'copy', fields: ['a'] } }]),
    ).toThrow('Cyclic');
    expect(() =>
      make([
        { id: 'a', name: 'a', generator: 'uuid', rule: { operation: 'copy', fields: ['missing'] } },
      ]),
    ).toThrow('Referenced');
    const session = make([
      { id: 'a', name: 'a', generator: 'constant', unique: true, options: { value: 'only' } },
    ]);
    expect(() => session.nextBatch(2)).toThrow('Unique');
  });
  it('keeps references in relational datasets', () => {
    const result = generateDatasets(
      [
        {
          name: 'orders',
          count: 20,
          schema: {
            id: 'orders',
            name: 'Orders',
            version: 1,
            fields: [
              { id: 'id', name: 'id', generator: 'uuid' },
              {
                id: 'customerId',
                name: 'customerId',
                generator: 'uuid',
                rule: { operation: 'foreignKey', dataset: 'customers', targetField: 'id' },
              },
            ],
          },
        },
        { name: 'customers', count: 4, schema: config.schema },
      ],
      config,
      registry,
    );
    const ids = new Set(result.customers.map((row) => row.id));
    result.orders.forEach((row) => expect(ids.has(row.customerId)).toBe(true));
  });
  it('retries composite collisions deterministically and reports exhausted combinations', () => {
    const definition = {
      name: 'links',
      count: 4,
      uniqueTogether: [['left', 'right']],
      schema: {
        id: 'links',
        name: 'Links',
        version: 1,
        fields: [
          { id: 'id', name: 'id', generator: 'uuid' },
          { id: 'left', name: 'left', generator: 'enum', options: { values: ['a', 'b'] } },
          { id: 'right', name: 'right', generator: 'enum', options: { values: ['c', 'd'] } },
        ],
      },
    };
    const rows = generateDatasets([definition], config, registry).links;
    expect(new Set(rows.map((row) => `${row.left}:${row.right}`)).size).toBe(4);
    expect(generateDatasets([definition], config, registry).links).toEqual(rows);
    const sequential = structuredClone(definition);
    sequential.schema.fields[0].generator = 'sequence';
    expect(generateDatasets([sequential], config, registry).links.map((row) => row.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(() => generateDatasets([{ ...definition, count: 5 }], config, registry)).toThrow(
      '1000 attempts',
    );
  });
});

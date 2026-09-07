import { expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { GenerationSession, validateRecord } from './engine';
import { createGeneratorRegistry } from './generators';
import { loadTextProvider } from '../infrastructure/faker';
import { validateReferencePool, syntheticDanishAddress } from './addresses';
import { SeededRandom } from './random';
import type { ReferencePool } from './types';

it('generates every built-in non-reference template and checks the full record', async () => {
  const registry = createGeneratorRegistry(await loadTextProvider(['pl', 'da']));
  for (const template of TEMPLATES.filter((template) => template.id !== 'dar-address')) {
    const config = {
      seed: 'templates',
      referenceDate: '2026-09-07',
      locale: 'da' as const,
      count: 5,
      schema: template.schema,
    };
    const rows = new GenerationSession(config, registry).nextBatch(5);
    for (const row of rows) expect(validateRecord(row, config), template.id).toEqual([]);
  }
});
it('validates DAR relationships without converting synthetics to registry-verified records', () => {
  const address = syntheticDanishAddress(new SeededRandom('address'));
  expect(address.registryVerified).toBe(false);
  const pool: ReferencePool = {
    kind: 'dar',
    source: {
      id: 'test-only',
      title: 'Synthetic shape fixture, not DAR',
      url: 'https://example.com/fixture',
      retrievedAt: '2026-01-01',
      version: '1',
      license: 'Test only',
    },
    records: [{ ...address, municipalityCode: '0101', roadCode: '0001' }],
  };
  expect(() => validateReferencePool(pool)).not.toThrow();
  pool.records.push({
    ...pool.records[0],
    adresseId: new SeededRandom('second').uuid(),
    houseNumber: '999',
  });
  expect(() => validateReferencePool(pool)).toThrow('Conflicting');
});
